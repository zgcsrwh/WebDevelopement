const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * toggleMatchStatus - Member 开启/关闭匹配功能
 *
 * API 6.2: 匹配状态开关
 */
const toggleMatchStatus = functions.https.onCall(async (data, context) => {
  // 1. 检查认证
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const callerUid = context.auth.uid;

  // 2. 检查 Member 权限
  const memberDoc = await db.doc(`member/${callerUid}`).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Not a member account.");
  }

  const memberData = memberDoc.data();
  // 注意：member 文档本身代表 Member 身份，没有 role 字段
  // role 只存在于 admin_staff，用来区分 Staff/Admin
  const memberStatus = String(memberData.status || "").toLowerCase();

  if (memberStatus !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Your account is not active.");
  }

  // 3. 校验 payload
  const { open_match } = data;
  if (typeof open_match !== "boolean") {
    throw new functions.https.HttpsError("invalid-argument", "Please provide a valid match status.");
  }

  // 4. 读取 profile
  const profileDocs = await db
    .collection("profile")
    .where("member_id", "==", callerUid)
    .limit(1)
    .get();

  if (profileDocs.empty) {
    throw new functions.https.HttpsError("failed-precondition", "Please complete your partner profile first.");
  }

  const profileDoc = profileDocs.docs[0];

  // 5. 更新 profile
  await profileDoc.ref.update({
    open_match: open_match,
    last_updated: new Date().toISOString(),
  });

  // 6. 如果关闭匹配，invalidate pending matching
  if (!open_match) {
    // 查询 sender 相关的 pending matching
    const senderDocs = await db
      .collection("matching")
      .where("sender_id", "==", callerUid)
      .get();

    // 查询 reciever 相关的 pending matching（注意拼写：reciever_id）
    const recieverDocs = await db
      .collection("matching")
      .where("reciever_id", "==", callerUid)
      .get();

    // 合并结果，用 Set 按 doc.id 去重
    const allDocs = [...senderDocs.docs, ...recieverDocs.docs];
    const uniqueDocs = Array.from(
      new Map(allDocs.map((doc) => [doc.id, doc])).values()
    );

    // 只更新 status lower-case 为 "pending" 的文档
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