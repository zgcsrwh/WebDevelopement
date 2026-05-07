/**
 * sendMatchRequest Cloud Function 实现
 *
 * 基于 sendMatchRequest_Implementation_Plan.md
 *
 * ID 类型：全部使用 string
 * Status 类型：string
 * 错误处理：throw new functions.https.HttpsError
 *
 * 不检查 member.role，member collection 本身代表 Member 身份
 * Member 身份判断只使用 member/{context.auth.uid} 是否存在
 * Member 可操作判断只使用 member.status === active
 */

// Firebase Functions v1 写法
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// ============ 工具函数 ============

/**
 * 校验 apply_description
 */
function validateApplyDescription(description) {
  // 后端重新 trim
  const trimmed = String(description || "").trim();

  // 超过 500 字符
  if (trimmed.length > 500) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Apply description exceeds maximum length of 500 characters"
    );
  }

  // 包含 < 或 >
  if (trimmed.includes("<") || trimmed.includes(">")) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Apply description cannot contain HTML tags"
    );
  }

  // 返回归一化后的消息，空值使用默认文案
  return trimmed || "Would you like to train together?";
}

// ============ 主函数 ============

/**
 * sendMatchRequest Cloud Function
 *
 * 业务逻辑：
 * 1. 校验用户已登录（context.auth.uid）
 * 2. 读取 member/{callerUid} 校验 Member 身份
 * 3. 校验 member.status === active
 * 4. Payload 校验（reciever_id / receiver_id）
 * 5. apply_description 校验
 * 6. caller profile 校验（open_match）
 * 7. receiver 校验（member + profile + status）
 * 8. friends 校验
 * 9. duplicate matching 校验
 * 10. 创建 matching 文档
 */
exports.sendMatchRequest = functions.https.onCall(async (data, context) => {
  // 1. 校验用户已登录
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const callerUid = context.auth.uid;

  // 2. 读取 member/{callerUid} 校验 Member 身份
  const memberDoc = await db.collection("member").doc(callerUid).get();

  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Only members can send match requests");
  }

  const memberData = memberDoc.data();
  const memberStatus = String(memberData.status || "").toLowerCase();

  // 3. 校验 member.status === active
  if (memberStatus !== "active") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Your account is not active"
    );
  }

  // 4. Payload 校验：读取目标 ID
  const rawReceiverId = data.reciever_id || data.receiver_id;
  const receiverId = String(rawReceiverId || "").trim();

  // 不相信前端已经校验，后端必须校验
  if (!receiverId) {
    throw new functions.https.HttpsError("invalid-argument", "reciever_id is required");
  }

  if (receiverId === callerUid) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot send match request to yourself");
  }

  // 5. apply_description 校验
  const normalizedMessage = validateApplyDescription(data.apply_description);

  // 6. caller profile 校验
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

  // 7. receiver 校验
  // 7.1 receiver member 存在且 status === active
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

  // 7.2 receiver profile 存在且 open_match === true
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

  // 8. friends 校验
  // 已查证：查询 friends where member_id == callerUid，取第一条，不校验 status
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

  // 9. duplicate matching 校验
  // 双向检查：pending 或 accepted
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

  // 10. 创建 matching 文档
  // 在 transaction 内再次检查 duplicate，降低并发重复创建 pending/accepted matching 的风险
  const newMatchingRef = db.collection("matching").doc();

  await db.runTransaction(async (transaction) => {
    // 再次检查 duplicate（在 transaction 中）
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
      reciever_id: receiverId, // 注意拼写：reciever_id
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