const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * disableStaffAccount - Admin 禁用 Staff 账号
 *
 * API 8.3: 禁用员工账号
 *
 * Payload:
 * {
 *   staff_id: "xxx" // Staff 文档 ID（Auth UID）
 * }
 */
const disableStaffAccount = functions.https.onCall(async (data, context) => {
  // 1. 权限判断：必须已登录
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const callerUid = context.auth.uid;

  // 2. 权限判断：调用者必须是 active Admin
  const callerDoc = await db.doc(`admin_staff/${callerUid}`).get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Not a staff account.");
  }

  const callerData = callerDoc.data();
  const callerRole = String(callerData.role || "").toLowerCase();
  const callerStatus = String(callerData.status || "").toLowerCase();

  if (callerRole !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can disable staff accounts.");
  }

  if (callerStatus !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Your account is not active.");
  }

  // 3. 校验 payload
  const staffId = String(data.staff_id || data.id || "").trim();
  if (!staffId) {
    throw new functions.https.HttpsError("invalid-argument", "Please provide a staff account to disable.");
  }

  // 4. 检查目标 Staff 是否存在
  const targetDoc = await db.doc(`admin_staff/${staffId}`).get();
  if (!targetDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Staff account not found.");
  }

  const targetData = targetDoc.data();
  const targetRole = String(targetData.role || "").toLowerCase();
  const targetStatus = String(targetData.status || "").toLowerCase();

  // 5. 不能禁用自己
  if (callerUid === staffId) {
    throw new functions.https.HttpsError("failed-precondition", "Cannot disable your own account.");
  }

  // 6. 目标必须是 Staff，不能是 Admin
  if (targetRole === "admin") {
    throw new functions.https.HttpsError("failed-precondition", "Cannot disable admin accounts.");
  }

  if (targetRole !== "staff") {
    throw new functions.https.HttpsError("failed-precondition", "Only staff accounts can be disabled.");
  }

  // 7. 幂等处理：如果已经是 deactivate，直接返回
  if (targetStatus === "deactivate") {
    return { success: true };
  }

  // 8. 检查 facility 引用
  const facilityDocs = await db
    .collection("facility")
    .where("staff_id", "==", staffId)
    .get();

  const activeFacilities = facilityDocs.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((fac) => {
      const status = String(fac.status || "").toLowerCase();
      return status !== "deleted";
    });

  if (activeFacilities.length) {
    const facilityNames = activeFacilities
      .map((f) => f.name || f.id)
      .join(", ");
    throw new functions.https.HttpsError(
      "failed-precondition",
      `This staff member still manages active facilities: ${facilityNames}. Please transfer them first.`
    );
  }

  // 9. 禁用 Staff
  await db.doc(`admin_staff/${staffId}`).update({
    status: "deactivate",
    updated_at: FieldValue.serverTimestamp(),
  });

  // 10. 返回成功
  return { success: true };
});

module.exports = { disableStaffAccount };