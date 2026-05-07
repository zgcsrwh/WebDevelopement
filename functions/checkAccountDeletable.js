/**
 * checkAccountDeletable Cloud Function
 *
 * Check if current Member account can be deleted
 *
 * Returns:
 * {
 *   isDeletable: boolean,
 *   blockingReasons: string[]
 * }
 *
 * Blocking rules:
 * 1. Requests initiated by self with status pending/accepted/suggested
 * 2. Requests where self is participant with status pending/accepted/suggested
 *
 * Repair does not block deletion
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

const checkAccountDeletable = functions.https.onCall(async (data, context) => {
  // 1. Validate user is logged in
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  // 2. Read member document
  const memberRef = db.collection("member").doc(uid);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only members can check account deletion eligibility"
    );
  }

  const blockingReasons = [];
  const activeStatuses = ["pending", "accepted", "suggested"];

  // 3. Query requests initiated by self
  const ownRequestsSnapshot = await db
    .collection("request")
    .where("member_id", "==", uid)
    .get();

  const hasOwnBlockingRequest = ownRequestsSnapshot.docs.some((doc) => {
    const requestData = doc.data();
    const status = String(requestData.status || "").toLowerCase().trim();
    return activeStatuses.includes(status);
  });

  if (hasOwnBlockingRequest) {
    blockingReasons.push(
      "You still have an unfinished booking request or active booking."
    );
  }

  // 4. Query requests where self is participant
  const participantRequestsSnapshot = await db
    .collection("request")
    .where("participant_ids", "array-contains", uid)
    .get();

  const hasParticipantBlockingRequest = participantRequestsSnapshot.docs.some(
    (doc) => {
      const requestData = doc.data();
      const status = String(requestData.status || "").toLowerCase().trim();
      return activeStatuses.includes(status);
    }
  );

  if (hasParticipantBlockingRequest) {
    blockingReasons.push(
      "You are still listed as a participant in another active booking."
    );
  }

  // 5. Return result
  return {
    isDeletable: blockingReasons.length === 0,
    blockingReasons: blockingReasons,
  };
});

module.exports = { checkAccountDeletable };