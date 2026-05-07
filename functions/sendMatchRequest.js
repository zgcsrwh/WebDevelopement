/**
 * sendMatchRequest Cloud Function Implementation
 *
 * Based on sendMatchRequest_Implementation_Plan.md
 *
 * ID type: string (all use string)
 * Status type: string
 * Error handling: throw new functions.https.HttpsError
 *
 * Does not check member.role, member collection itself represents Member identity
 * Member identity check only uses member/{context.auth.uid} existence
 * Member operation check only uses member.status === active
 */

// Firebase Functions v1 implementation
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// ============ Utility functions ============

/**
 * Validate apply_description
 */
function validateApplyDescription(description) {
  // Backend re-trim
  const trimmed = String(description || "").trim();

  // Exceeds 500 characters
  if (trimmed.length > 500) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Apply description exceeds maximum length of 500 characters"
    );
  }

  // Contains < or >
  if (trimmed.includes("<") || trimmed.includes(">")) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Apply description cannot contain HTML tags"
    );
  }

  // Return normalized message, use default message for empty value
  return trimmed || "Would you like to train together?";
}

// ============ Main function ============

/**
 * sendMatchRequest Cloud Function
 *
 * Business logic:
 * 1. Validate user is logged in (context.auth.uid)
 * 2. Read member/{callerUid} and validate Member identity
 * 3. Validate member.status === active
 * 4. Payload validation (reciever_id / receiver_id)
 * 5. apply_description validation
 * 6. caller profile validation (open_match)
 * 7. receiver validation (member + profile + status)
 * 8. friends validation
 * 9. duplicate matching validation
 * 10. Create matching document
 */
exports.sendMatchRequest = functions.https.onCall(async (data, context) => {
  // 1. Validate user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const callerUid = context.auth.uid;

  // 2. Read member/{callerUid} and validate Member identity
  const memberDoc = await db.collection("member").doc(callerUid).get();

  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Only members can send match requests");
  }

  const memberData = memberDoc.data();
  const memberStatus = String(memberData.status || "").toLowerCase();

  // 3. Validate member.status === active
  if (memberStatus !== "active") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Your account is not active"
    );
  }

  // 4. Payload validation: read target ID
  const rawReceiverId = data.reciever_id || data.receiver_id;
  const receiverId = String(rawReceiverId || "").trim();

  // Do not trust frontend validation, backend must validate
  if (!receiverId) {
    throw new functions.https.HttpsError("invalid-argument", "reciever_id is required");
  }

  if (receiverId === callerUid) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot send match request to yourself");
  }

  // 5. apply_description validation
  const normalizedMessage = validateApplyDescription(data.apply_description);

  // 6. caller profile validation
  const callerProfileSnap = await db
    .collection("profile")
    .where("member_id", "==", callerUid)
    .limit(1)
    .get();

  if (callerProfileSnap.empty) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Please complete your partner profile and enable matching first"
    );
  }

  const callerProfile = callerProfileSnap.docs[0].data();

  if (!callerProfile.open_match) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Please complete your partner profile and enable matching first"
    );
  }

  // 7. receiver validation
  // 7.1 receiver member exists and status === active
  const receiverMemberDoc = await db.collection("member").doc(receiverId).get();

  if (!receiverMemberDoc.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The selected member is currently unavailable for matching"
    );
  }

  const receiverMemberData = receiverMemberDoc.data();
  const receiverMemberStatus = String(receiverMemberData.status || "").toLowerCase();

  if (receiverMemberStatus !== "active") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The selected member is currently unavailable for matching"
    );
  }

  // 7.2 receiver profile exists and open_match === true
  const receiverProfileSnap = await db
    .collection("profile")
    .where("member_id", "==", receiverId)
    .limit(1)
    .get();

  if (receiverProfileSnap.empty) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The selected member is currently unavailable for matching"
    );
  }

  const receiverProfile = receiverProfileSnap.docs[0].data();

  if (!receiverProfile.open_match) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The selected member is currently unavailable for matching"
    );
  }

  // 8. friends validation
  // Verified: query friends where member_id == callerUid, take first, do not validate status
  const friendsSnap = await db
    .collection("friends")
    .where("member_id", "==", callerUid)
    .limit(1)
    .get();

  if (!friendsSnap.empty) {
    const friendRecord = friendsSnap.docs[0].data();
    const friendIds = friendRecord?.friends_ids || [];

    if (friendIds.includes(receiverId)) {
      throw new functions.https.HttpsError(
        "already-exists",
        "You are already connected with this member"
      );
    }
  }

  // 9. duplicate matching validation
  // Bidirectional check: pending or accepted
  const matchingSnap = await db.collection("matching").get();

  const duplicate = matchingSnap.docs.find((doc) => {
    const match = doc.data();
    const samePair =
      (match.sender_id === callerUid && match.reciever_id === receiverId) ||
      (match.sender_id === receiverId && match.reciever_id === callerUid);
    const active = ["pending", "accepted"].includes(
      String(match.status || "").toLowerCase()
    );
    return samePair && active;
  });

  if (duplicate) {
    throw new functions.https.HttpsError(
      "already-exists",
      "A match request already exists with this member"
    );
  }

  // 10. Create matching document
  // Re-check duplicate in transaction to reduce risk of concurrent duplicate pending/accepted matching creation
  const newMatchingRef = db.collection("matching").doc();

  await db.runTransaction(async (transaction) => {
    // Re-check duplicate (in transaction)
    const snapshot = await transaction.get(db.collection("matching"));

    const exists = snapshot.docs.find((d) => {
      const m = d.data();
      const pair =
        (m.sender_id === callerUid && m.reciever_id === receiverId) ||
        (m.sender_id === receiverId && m.reciever_id === callerUid);
      const active = ["pending", "accepted"].includes(
        String(m.status || "").toLowerCase()
      );
      return pair && active;
    });

    if (exists) {
      throw new functions.https.HttpsError(
        "already-exists",
        "A match request already exists with this member"
      );
    }

    transaction.create(newMatchingRef, {
      sender_id: callerUid,
      reciever_id: receiverId, // Note spelling: reciever_id
      apply_description: normalizedMessage,
      respond_message: "",
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
      completed_at: "",
    });
  });

  return {
    success: true,
    match_id: newMatchingRef.id,
  };
});