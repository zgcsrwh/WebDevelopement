/**
 * respondToMatchRequest Cloud Function Implementation
 *
 * Based on respondToMatchRequest_Implementation_Plan.md
 *
 * ID type: string (all use string)
 * Status type: string
 * Error handling: throw new functions.https.HttpsError
 *
 * Does not check member.role, member collection itself represents Member identity
 * Member identity check only uses member/{context.auth.uid} existence
 * Member operation check only uses member.status === active
 *
 * accepted operation must be atomic: matching update + friends creation + invalidation must be in the same transaction
 * Transaction follows strict read-before-write: all reads must complete before any writes
 */

// Firebase Functions v1 implementation
const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// ============ Utility functions ============

/**
 * Validate status
 */
function normalizeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!["accepted", "rejected"].includes(normalized)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Status must be accepted or rejected"
    );
  }
  return normalized;
}

/**
 * Validate and normalize respond_message
 */
function normalizeRespondMessage(message) {
  // Backend re-trim
  return String(message || "").trim();
}

// ============ Main function ============

const respondToMatchRequest = functions.https.onCall(async (data, context) => {
  // 1. Validate authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in."
    );
  }

  const callerUid = context.auth.uid;

  // 2. Read current user member document (outside transaction)
  const memberDoc = await db.collection("member").doc(callerUid).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only members can respond to match requests."
    );
  }
  const memberData = memberDoc.data();
  if (String(memberData.status || "").toLowerCase() !== "active") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Member account is not active."
    );
  }

  // 3. Read payload (outside transaction)
  const rawMatchId = data.match_id || data.id;
  const matchId = String(rawMatchId || "").trim();
  const status = data.status;
  const respondMessage = data.respond_message || "";

  // 4. Parameter validation (outside transaction)
  if (!matchId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing match_id."
    );
  }

  const normalizedStatus = normalizeStatus(status);
  const normalizedRespondMessage = normalizeRespondMessage(respondMessage);
  const completedAt = new Date().toISOString();

  // 5. Use transaction to ensure atomicity (strict read-before-write)
  await db.runTransaction(async (transaction) => {
    // ========== Phase 1: All reads (must be before writes) ==========

    // 5a. Read current matching document
    const matchingRef = db.collection("matching").doc(matchId);
    const matchingDoc = await transaction.get(matchingRef);

    // 5b. Validate matching exists
    if (!matchingDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Match request not found."
      );
    }
    const matchingData = matchingDoc.data();

    // 5c. Permission check: must be receiver
    if (matchingData.reciever_id !== callerUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the receiver can respond to this request."
      );
    }

    // 5d. Status check: must be pending
    if (String(matchingData.status || "").toLowerCase() !== "pending") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This request has already been processed."
      );
    }

    // 5e. If accepted, read friends and pending matching (before writes)
    let friendIdsSender = [];
    let friendIdsReceiver = [];
    const pendingToInvalidate = [];

    if (normalizedStatus === "accepted") {
      const senderId = matchingData.sender_id;
      const receiverId = matchingData.reciever_id;

      // 5e1. Read sender's friends document
      const senderFriendsRef = db.collection("friends").doc(senderId);
      const senderFriendsDoc = await transaction.get(senderFriendsRef);
      friendIdsSender = [...new Set([...(senderFriendsDoc.data()?.friends_ids || []), receiverId])];

      // 5e2. Read receiver's friends document
      const receiverFriendsRef = db.collection("friends").doc(receiverId);
      const receiverFriendsDoc = await transaction.get(receiverFriendsRef);
      friendIdsReceiver = [...new Set([...(receiverFriendsDoc.data()?.friends_ids || []), senderId])];

      // 5e3. Read all pending matching (to find other pending for same user pair)
      const pendingQuery = db.collection("matching").where("status", "==", "pending");
      const pendingSnap = await transaction.get(pendingQuery);

      // Find documents that need to be invalidated
      pendingSnap.docs.forEach((doc) => {
        const item = doc.data();
        if (doc.id !== matchId &&
            ((item.sender_id === senderId && item.reciever_id === receiverId) ||
             (item.sender_id === receiverId && item.reciever_id === senderId))) {
          pendingToInvalidate.push(doc.ref);
        }
      });
    }

    // ========== Phase 2: All writes (after reads) ==========

    // 5f. Update current matching
    transaction.update(matchingDoc.ref, {
      status: normalizedStatus,
      respond_message: normalizedRespondMessage,
      completed_at: completedAt,
    });

    // 5g. If accepted, execute friends creation and invalidation
    if (normalizedStatus === "accepted") {
      const senderId = matchingData.sender_id;
      const receiverId = matchingData.reciever_id;

      // 5g1. Update sender friends
      transaction.set(
        db.collection("friends").doc(senderId),
        { member_id: senderId, friends_ids: friendIdsSender },
        { merge: true }
      );

      // 5g2. Update receiver friends
      transaction.set(
        db.collection("friends").doc(receiverId),
        { member_id: receiverId, friends_ids: friendIdsReceiver },
        { merge: true }
      );

      // 5g3. Invalidate other pending matching
      pendingToInvalidate.forEach((ref) => {
        transaction.update(ref, {
          status: "invalidated",
          respond_message: "Automatically invalidated because the members are already matched.",
          completed_at: completedAt,
        });
      });
    }
  });

  // 6. Return success
  return { success: true };
});

module.exports = { respondToMatchRequest };