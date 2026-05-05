/**
 * checkAccountDeletable Cloud Function
 *
 * 检查当前 Member 账号是否可以删除
 *
 * 返回：
 * {
 *   isDeletable: boolean,
 *   blockingReasons: string[]
 * }
 *
 * blocking 规则：
 * 1. 自己发起的 request 状态为 pending/accepted/suggested
 * 2. 作为 participant 的 request 状态为 pending/accepted/suggested
 *
 * repair 不阻塞删除
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

const checkAccountDeletable = functions.https.onCall(async (data, context) => {
  // 1. 校验用户已登录
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  // 2. 读取 member 文档
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

  // 3. 查询自己发起的 request
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

  // 4. 查询作为 participant 的 request
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

  // 5. 返回结果
  return {
    isDeletable: blockingReasons.length === 0,
    blockingReasons: blockingReasons,
  };
});

module.exports = { checkAccountDeletable };