/**
 * getUserContext Cloud Function
 *
 * 登录后返回当前用户的 session context: role, status, profile, isProfileComplete
 *
 * ID 类型：全部使用 string
 * Status 类型：string
 * 错误处理：throw new functions.https.HttpsError
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * normalizeRoleValue - 规范化角色值
 *
 * @param {string} role - 原始角色值
 * @returns {string} - "Admin" | "Staff" | "Member"
 */
function normalizeRoleValue(role) {
  const normalized = String(role || "").toLowerCase().trim();
  if (normalized === "admin") {
    return "Admin";
  }
  if (normalized === "staff") {
    return "Staff";
  }
  return "Member";
}

/**
 * getUserContext - 获取用户会话上下文
 */
const getUserContext = functions.https.onCall(async (data, context) => {
  // 1. 校验登录
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  // 2. 读取 admin_staff
  const staffDoc = await db.collection("admin_staff").doc(userId).get();
  if (staffDoc.exists) {
    const staffData = staffDoc.data();
    const normalizedRole = normalizeRoleValue(staffData.role);

    return {
      role: normalizedRole,
      status: staffData.status || "inactive",
      profile: {
        ...staffData,
        id: userId,
        name: staffData.name || "",
        email: staffData.email || "",
        role: normalizedRole,
        status: staffData.status || "inactive",
      },
      isProfileComplete: true,
    };
  }

  // 3. 读取 member
  const memberDoc = await db.collection("member").doc(userId).get();
  if (memberDoc.exists) {
    const memberData = memberDoc.data();

    return {
      role: "Member",
      status: memberData.status || "inactive",
      profile: {
        ...memberData,
        id: userId,
        name: memberData.name || "",
        email: memberData.email || "",
        role: "Member",
        status: memberData.status || "inactive",
      },
      isProfileComplete: true,
    };
  }

  // 4. fallback（新用户）
  // fallback 展示信息优先级
  const email = context.auth.token?.email || (data && data.email) || "";
  const displayName =
    (data && data.displayName) || context.auth.token?.name || "Member";

  return {
    role: "Member",
    status: "active",
    profile: {
      id: userId,
      name: displayName,
      email: email,
      role: "Member",
      status: "active",
    },
    isProfileComplete: false,
  };
});

module.exports = { getUserContext };