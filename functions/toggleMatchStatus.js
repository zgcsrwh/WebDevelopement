const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * toggleMatchStatus - Member enables/disables matching
 *
 * API 6.2: Match status switch
 */
const toggleMatchStatus = functions.https.onCall(async (data, context) => {
  // 1. Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const callerUid = context.auth.uid;

  // 2. Check Member permissions
  const memberDoc = await db.doc(`member/${callerUid}`).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Not a member account.");
  }

  const memberData = memberDoc.data();
  // Note: member document itself represents Member identity, no role field
  // role only exists in admin_staff to distinguish Staff/Admin
  const memberStatus = String(memberData.status || "").toLowerCase();

  if (memberStatus !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Your account is not active.");
  }

  // 3. Validate payload
  const { open_match } = data;
  if (typeof open_match !== "boolean") {
    throw new functions.https.HttpsError("invalid-argument", "Please provide a valid match status.");
  }

  // 4. Read profile
  const profileDocs = await db
    .collection("profile")
    .where("member_id", "==", callerUid)
    .limit(1)
    .get();

  if (profileDocs.empty) {
    throw new functions.https.HttpsError("failed-precondition", "Please complete your partner profile first.");
  }

  const profileDoc = profileDocs.docs[0];

  // 5. Update profile
  await profileDoc.ref.update({
    open_match: open_match,
    last_updated: new Date().toISOString(),
  });

  // 6. If matching is closed, invalidate pending matching
  if (!open_match) {
    // Query pending matching related to sender
    const senderDocs = await db
      .collection("matching")
      .where("sender_id", "==", callerUid)
      .get();

    // Query pending matching related to reciever (note spelling: reciever_id)
    const recieverDocs = await db
      .collection("matching")
      .where("reciever_id", "==", callerUid)
      .get();

    // Merge results, deduplicate by doc.id using Set
    const allDocs = [...senderDocs.docs, ...recieverDocs.docs];
    const uniqueDocs = Array.from(
      new Map(allDocs.map((doc) => [doc.id, doc])).values()
    );

    // Only update documents with status lowercase "pending"
    const pendingDocs = uniqueDocs.filter((doc) => {
      const data = doc.data();
      return String(data.status || "").toLowerCase() === "pending";
    });

    await Promise.all(
      pendingDocs.map((doc) =>
        doc.ref.update({
          status: "invalidated",
          respond_message:
            "Automatically invalidated because matching was closed.",
          updated_at: FieldValue.serverTimestamp(),
        })
      )
    );
  }

  return { success: true };
});

module.exports = { toggleMatchStatus };