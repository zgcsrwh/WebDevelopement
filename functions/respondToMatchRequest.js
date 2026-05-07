/**
 * respondToMatchRequest Cloud Function 实现
 *
 * 基于 respondToMatchRequest_Implementation_Plan.md
 *
 * ID 类型：全部使用 string
 * Status 类型：string
 * 错误处理：throw new functions.https.HttpsError
 *
 * 不检查 member.role，member collection 本身代表 Member 身份
 * Member 身份判断只使用 member/{context.auth.uid} 是否存在
 * Member 可操作判断只使用 member.status === active
 *
 * accepted 操作必须原子化：matching 更新 + friends 创建 + invalidation 必须在同一个 transaction 中
 * transaction 内遵循严格 read-before-write：所有 reads 必须在所有 writes 前完成
 */

// Firebase Functions v1 写法
const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// ============ 工具函数 ============

/**
 * 校验 status
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
 * 校验并归一化 respond_message
 */
function normalizeRespondMessage(message) {
  // 后端重新 trim
  return String(message || "").trim();
}

// ============ 主函数 ============

const respondToMatchRequest = functions.https.onCall(async (data, context) => {
  // 1. 校验认证
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in."
    );
  }

  const callerUid = context.auth.uid;

  // 2. 读取当前用户 member 文档（transaction 外）
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

  // 3. 读取 payload（transaction 外）
  const rawMatchId = data.match_id || data.id;
  const matchId = String(rawMatchId || "").trim();
  const status = data.status;
  const respondMessage = data.respond_message || "";

  // 4. 参数校验（transaction 外）
  if (!matchId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing match_id."
    );
  }

  const normalizedStatus = normalizeStatus(status);
  const normalizedRespondMessage = normalizeRespondMessage(respondMessage);
  const completedAt = new Date().toISOString();

  // 5. 使用 transaction 保证原子化（严格 read-before-write）
  await db.runTransaction(async (transaction) => {
    // ========== Phase 1: 所有读取 (必须在 writes 前) ==========

    // 5a. 读取当前 matching 文档
    const matchingRef = db.collection("matching").doc(matchId);
    const matchingDoc = await transaction.get(matchingRef);

    // 5b. 校验 matching 存在
    if (!matchingDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Match request not found."
      );
    }
    const matchingData = matchingDoc.data();

    // 5c. 权限校验：必须是 reciever
    if (matchingData.reciever_id !== callerUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the receiver can respond to this request."
      );
    }

    // 5d. 状态校验：必须是 pending
    if (String(matchingData.status || "").toLowerCase() !== "pending") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This request has already been processed."
      );
    }

    // 5e. 如果 accepted，读取 friends 和 pending matching（在 writes 前）
    let friendIdsSender = [];
    let friendIdsReceiver = [];
    const pendingToInvalidate = [];

    if (normalizedStatus === "accepted") {
      const senderId = matchingData.sender_id;
      const receiverId = matchingData.reciever_id;

      // 5e1. 读取 sender 的 friends 文档
      const senderFriendsRef = db.collection("friends").doc(senderId);
      const senderFriendsDoc = await transaction.get(senderFriendsRef);
      friendIdsSender = [...new Set([...(senderFriendsDoc.data()?.friends_ids || []), receiverId])];

      // 5e2. 读取 receiver 的 friends 文档
      const receiverFriendsRef = db.collection("friends").doc(receiverId);
      const receiverFriendsDoc = await transaction.get(receiverFriendsRef);
      friendIdsReceiver = [...new Set([...(receiverFriendsDoc.data()?.friends_ids || []), senderId])];

      // 5e3. 读取所有 pending matching（用于找同一对用户其他 pending）
      const pendingQuery = db.collection("matching").where("status", "==", "pending");
      const pendingSnap = await transaction.get(pendingQuery);

      // 找出需要 invalidated 的文档
      pendingSnap.docs.forEach((doc) => {
        const item = doc.data();
        if (doc.id !== matchId &&
            ((item.sender_id === senderId && item.reciever_id === receiverId) ||
             (item.sender_id === receiverId && item.reciever_id === senderId))) {
          pendingToInvalidate.push(doc.ref);
        }
      });
    }

    // ========== Phase 2: 所有写入 (在 reads 后) ==========

    // 5f. 更新当前 matching
    transaction.update(matchingDoc.ref, {
      status: normalizedStatus,
      respond_message: normalizedRespondMessage,
      completed_at: completedAt,
    });

    // 5g. 如果 accepted，执行 friends 创建和 invalidation
    if (normalizedStatus === "accepted") {
      const senderId = matchingData.sender_id;
      const receiverId = matchingData.reciever_id;

      // 5g1. 更新 sender friends
      transaction.set(
        db.collection("friends").doc(senderId),
        { member_id: senderId, friends_ids: friendIdsSender },
        { merge: true }
      );

      // 5g2. 更新 receiver friends
      transaction.set(
        db.collection("friends").doc(receiverId),
        { member_id: receiverId, friends_ids: friendIdsReceiver },
        { merge: true }
      );

      // 5g3. invalidated 其他 pending matching
      pendingToInvalidate.forEach((ref) => {
        transaction.update(ref, {
          status: "invalidated",
          respond_message: "Automatically invalidated because the members are already matched.",
          completed_at: completedAt,
        });
      });
    }
  });

  // 6. 返回成功
  return { success: true };
});

module.exports = { respondToMatchRequest };