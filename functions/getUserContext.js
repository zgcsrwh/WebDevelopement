/**
 * getUserContext Cloud Function
 *
 * Returns current user's session context after login: role, status, profile, isProfileComplete
 *
 * ID type: string
 * Status type: string
 * Error handling: throw new functions.https.HttpsError
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * normalizeRoleValue - Normalize role value
 *
 * @param {string} role - Original role value
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
 * getUserContext - Get user session context
 */
const getUserContext = functions.https.onCall(async (data, context) => {
  // 1. Validate authentication
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  // 2. Read admin_staff
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

  // 3. Read member
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

  // 4. Fallback (new user)
  // Fallback display info priority
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