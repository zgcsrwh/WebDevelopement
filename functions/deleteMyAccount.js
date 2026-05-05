/**
 * deleteMyAccount Cloud Function
 *
 * 用于 Member 删除账号
 *
 * 返回：
 * {
 *   success: true
 * }
 *
 * 删除前 blocking 检查：
 * - 自己发起的 request 状态为 pending/accepted/suggested
 * - 作为 participant 的 request 状态为 pending/accepted/suggested
 *
 * 清理：
 * - 删除 profile、notification
 * - 更新 matching、friends
 * - 匿名化 repair
 * - 删除 member、Auth 用户
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// ============ Helper: 分批提交 ============

async function commitBatchInChunks(batch, maxChunks = 10) {
  // batch 现在可能是 WriteBatch 或包含多个 batch 的数组
  // 单个 batch 最大操作数约 500，分多个 chunk 防止超限
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

// ============ 主函数 ============

const deleteMyAccount = functions.https.onCall(async (data, context) => {
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
      "Only members can delete their account"
    );
  }

  // 3. Blocking 检查：重新执行和 checkAccountDeletable 一致的规则
  const activeStatuses = ["pending", "accepted", "suggested"];

  // 检查自己发起的 request
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

  // 检查作为 participant 的 request
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

  // ============ Firestore 清理 ============

  // 准备 batch
  const delBatch = db.batch();
  const updBatch = db.batch();

  // A. 删除 profile
  const profilesSnapshot = await db
    .collection("profile")
    .where("member_id", "==", uid)
    .get();
  profilesSnapshot.docs.forEach((doc) => {
    delBatch.delete(doc.ref);
  });

  // B. 删除 notification
  const notifsSnapshot = await db
    .collection("notification")
    .where("member_id", "==", uid)
    .get();
  notifsSnapshot.docs.forEach((doc) => {
    delBatch.delete(doc.ref);
  });

  // C. 更新 matching (sender_id)
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

  // C. 更新 matching (reciever_id，注意拼写)
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

  // D. 更新 friends（移除当前用户）
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

  // E. 删除 friends/{uid}
  const friendsDocRef = db.collection("friends").doc(uid);
  delBatch.delete(friendsDocRef);

  // F. 匿名化 repair
  const repairSnapshot = await db
    .collection("repair")
    .where("member_id", "==", uid)
    .get();
  repairSnapshot.docs.forEach((doc) => {
    const repairData = doc.data();
    // 收集需要匿名化的字段
    const updateData = {
      member_id: "",
      reporter_deleted: true,
      reporter_name: "Deleted user",
      updated_at: FieldValue.serverTimestamp(),
    };

    // 如果存在其他用户身份字段，一并清空
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

  // G. 删除 member/{uid}
  delBatch.delete(memberRef);

  // 提交 Firestore 清理
  await delBatch.commit();
  await updBatch.commit();

  // ============ 删除 Firebase Auth 用户 ============

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

  // ============ 返回成功 ============

  return { success: true };
});

module.exports = { deleteMyAccount };