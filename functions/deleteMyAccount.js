/**
 * deleteMyAccount Cloud Function
 *
 * Used for Member to delete account
 *
 * Returns:
 * {
 *   success: true
 * }
 *
 * Pre-deletion blocking checks:
 * - Requests initiated by self with status pending/accepted/suggested
 * - Requests where self is participant with status pending/accepted/suggested
 *
 * Cleanup:
 * - Delete profile, notification
 * - Update matching, friends
 * - Anonymize repair
 * - Delete member, Auth user
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// ============ Helper: Commit in chunks ============

async function commitBatchInChunks(batch, maxChunks = 10) {
  // batch can be WriteBatch or array containing multiple batches
  // Single batch max operations ~500, split into chunks to prevent exceeding limit
  if (batch && batch.commit) {
    await batch.commit();
  } else if (Array.isArray(batch)) {
    for (const b of batch) {
      if (b && b.commit) {
        await b.commit();
      }
    }
  }
}

// ============ Main function ============

const deleteMyAccount = functions.https.onCall(async (data, context) => {
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
      "Only members can delete their account"
    );
  }

  // 3. Blocking check: Re-run rules consistent with checkAccountDeletable
  const activeStatuses = ["pending", "accepted", "suggested"];

  // Check requests initiated by self
  const ownRequestsSnapshot = await db
    .collection("request")
    .where("member_id", "==", uid)
    .get();

  const hasOwnBlocking = ownRequestsSnapshot.docs.some((doc) => {
    const status = String(doc.data().status || "").toLowerCase().trim();
    return activeStatuses.includes(status);
  });

  if (hasOwnBlocking) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "You still have an unfinished booking request or active booking."
    );
  }

  // Check requests where self is participant
  const participantRequestsSnapshot = await db
    .collection("request")
    .where("participant_ids", "array-contains", uid)
    .get();

  const hasParticipantBlocking = participantRequestsSnapshot.docs.some((doc) => {
    const status = String(doc.data().status || "").toLowerCase().trim();
    return activeStatuses.includes(status);
  });

  if (hasParticipantBlocking) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "You are still listed as a participant in another active booking."
    );
  }

  // ============ Firestore cleanup ============

  // Prepare batch
  const delBatch = db.batch();
  const updBatch = db.batch();

  // A. Delete profile
  const profilesSnapshot = await db
    .collection("profile")
    .where("member_id", "==", uid)
    .get();
  profilesSnapshot.docs.forEach((doc) => {
    delBatch.delete(doc.ref);
  });

  // B. Delete notification
  const notifsSnapshot = await db
    .collection("notification")
    .where("member_id", "==", uid)
    .get();
  notifsSnapshot.docs.forEach((doc) => {
    delBatch.delete(doc.ref);
  });

  // C. Update matching (sender_id)
  const matchingSenderSnapshot = await db
    .collection("matching")
    .where("sender_id", "==", uid)
    .get();
  matchingSenderSnapshot.docs.forEach((doc) => {
    updBatch.update(doc.ref, {
      status: "invalidated",
      respond_message: "User account deleted.",
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  // C. Update matching (reciever_id, note spelling)
  const matchingRecieverSnapshot = await db
    .collection("matching")
    .where("reciever_id", "==", uid)
    .get();
  matchingRecieverSnapshot.docs.forEach((doc) => {
    updBatch.update(doc.ref, {
      status: "invalidated",
      respond_message: "User account deleted.",
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  // D. Update friends (remove current user)
  const friendsSnapshot = await db
    .collection("friends")
    .where("friends_ids", "array-contains", uid)
    .get();
  friendsSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const newFriendsIds = (data.friends_ids || []).filter((id) => id !== uid);
    updBatch.update(doc.ref, {
      friends_ids: newFriendsIds,
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  // E. Delete friends/{uid}
  const friendsDocRef = db.collection("friends").doc(uid);
  delBatch.delete(friendsDocRef);

  // F. Anonymize repair
  const repairSnapshot = await db
    .collection("repair")
    .where("member_id", "==", uid)
    .get();
  repairSnapshot.docs.forEach((doc) => {
    const repairData = doc.data();
    // Collect fields that need to be anonymized
    const updateData = {
      member_id: "",
      reporter_deleted: true,
      reporter_name: "Deleted user",
      updated_at: FieldValue.serverTimestamp(),
    };

    // If other user identity fields exist, clear them too
    if (repairData.member_name !== undefined) {
      updateData.member_name = "";
    }
    if (repairData.reporter_email !== undefined) {
      updateData.reporter_email = "";
    }
    if (repairData.user_email !== undefined) {
      updateData.user_email = "";
    }
    if (repairData.email !== undefined) {
      updateData.email = "";
    }
    if (repairData.name !== undefined) {
      updateData.name = "";
    }

    updBatch.update(doc.ref, updateData);
  });

  // G. Delete member/{uid}
  delBatch.delete(memberRef);

  // Commit Firestore cleanup
  await delBatch.commit();
  await updBatch.commit();

  // ============ Delete Firebase Auth user ============

  try {
    const auth = getAuth();
    await auth.deleteUser(uid);
  } catch (authError) {
    console.error("Failed to delete auth user:", authError);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to delete auth account"
    );
  }

  // ============ Return success ============

  return { success: true };
});

module.exports = { deleteMyAccount };