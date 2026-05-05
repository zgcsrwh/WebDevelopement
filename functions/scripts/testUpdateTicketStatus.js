/**
 * testUpdateTicketStatus.js
 *
 * 本地测试脚本 for updateTicketStatus Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testUpdateTicketStatus.js --scenario=resolve-success-last-pending-repair-restores-facility
 *
 * 先启动 emulator:
 *   firebase emulators:start --only functions,auth,firestore
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(1);
}

// ============ 引入 ============

// Modern Firebase Client SDK
const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, deleteUser } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

// Firebase Admin SDK (用于验证结果)
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// ============ Firebase Client SDK 初始化 ============

const firebaseConfig = {
  apiKey: "AIzaSyDSyXsiFqEH-OLdmHFXR8k_ZtEfhP1dk40",
  authDomain: "learnfire-e5720.firebaseapp.com",
  projectId: "learnfire-e5720",
  storageBucket: "learnfire-e5720.firebasestorage.app",
  messagingSenderId: "271681004538",
  appId: "1:271681004538:web:8630b96cbf14b1e2183a43",
  measurementId: "G-TD22LFSGHH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

// 连接 Emulator
const rawAuthEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
let authEmulatorUrl = rawAuthEmulatorHost || "127.0.0.1:9099";
// 补完 scheme
if (!authEmulatorUrl.startsWith("http://") && !authEmulatorUrl.startsWith("https://")) {
  authEmulatorUrl = "http://" + authEmulatorUrl;
}
connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

console.log("  ✓ Firebase Client SDK initialized");
console.log(`  ✓ Connected to Auth Emulator: ${authEmulatorUrl}`);
console.log("  ✓ Connected to Functions Emulator: http://127.0.0.1:5001");

// ============ Firebase Admin SDK 初始化 ============

admin.initializeApp({
  projectId: "learnfire-e5720"
});

const db = admin.firestore();
const { v4: uuidv4 } = require("uuid");

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
let scenario = "resolve-success-last-pending-repair-restores-facility";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// --list 在解析参数后立即处理
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");
  console.log("\nHappy paths:");
  console.log("  resolve-success-last-pending-repair-restores-facility");
  console.log("  resolve-success-other-pending-repair-keeps-fixing");
  console.log("  resolve-success-authorized-by-facility-staff-id");
  console.log("  resolve-success-authorized-by-repair-staff-id");
  console.log("\nFailure paths:");
  console.log("  repair-not-found");
  console.log("  already-resolved-repair");
  console.log("  terminated-repair");
  console.log("  invalid-status");
  console.log("  missing-repair-id");
  console.log("  missing-status");
  console.log("  unauthenticated");
  console.log("  not-staff");
  console.log("  inactive-staff");
  console.log("  admin-not-allowed");
  console.log("  wrong-staff");
  console.log("  facility-not-found");
  console.log("  deleted-facility");
  process.exit(0);
}

// ============ 工具函数 ============

function normalizeErrorCode(code) {
  if (code && code.startsWith("functions/")) {
    return code.replace("functions/", "");
  }
  return code;
}

async function deleteAuthUser(email) {
  try {
    await signInWithEmailAndPassword(auth, email, "test-password-123");
    await deleteUser(auth.currentUser);
  } catch (e) {
    // 用户不存在，忽略
  }
}

// ============ Scenario 配置 ============

const scenarios = {
  // ============ Happy paths ============
  "resolve-success-last-pending-repair-restores-facility": {
    description: "Resolve last pending repair - facility restored to normal",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-facility-repair",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const repairDoc = await db.collection("repair").doc(ctx.repairId).get();
      const facilityDoc = await db.collection("facility").doc(ctx.facilityId).get();
      return (
        repairDoc.exists &&
        repairDoc.data().status === "resolved" &&
        repairDoc.data().staff_id === ctx.staffId &&
        facilityDoc.data().status === "normal"
      );
    },
  },
  "resolve-success-other-pending-repair-keeps-fixing": {
    description: "Resolve repair but other pending exists - facility keeps fixing",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-facility-repairs",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const repairDoc = await db.collection("repair").doc(ctx.repairId).get();
      const otherRepairDoc = await db.collection("repair").doc(ctx.otherRepairId).get();
      const facilityDoc = await db.collection("facility").doc(ctx.facilityId).get();
      return (
        repairDoc.data().status === "resolved" &&
        otherRepairDoc.data().status === "pending" &&
        facilityDoc.data().status === "fixing"
      );
    },
  },
  "resolve-success-authorized-by-facility-staff-id": {
    description: "Resolve repair - authorized by facility.staff_id",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-facility-with-staff-id",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const repairDoc = await db.collection("repair").doc(ctx.repairId).get();
      return repairDoc.data().status === "resolved";
    },
  },
  "resolve-success-authorized-by-repair-staff-id": {
    description: "Resolve repair - authorized by repair.staff_id",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-facility-with-repair-staff-id",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const repairDoc = await db.collection("repair").doc(ctx.repairId).get();
      return repairDoc.data().status === "resolved";
    },
  },

  // ============ Failure paths ============
  "repair-not-found": {
    description: "Repair not found - should fail",
    payload: (ctx) => ({ repairt_id: "non-existent-id", status: "resolved" }),
    preProcess: "create-staff-facility-repair",
    cleanup: true,
    expectedError: "not-found",
  },
  "already-resolved-repair": {
    description: "Repair already resolved - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-facility-resolved-repair",
    cleanup: true,
    expectedError: "failed-precondition",
  },
  "terminated-repair": {
    description: "Repair terminated - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-facility-terminated-repair",
    cleanup: true,
    expectedError: "failed-precondition",
  },
  "invalid-status": {
    description: "Invalid status - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "invalid" }),
    preProcess: "create-staff-facility-repair",
    cleanup: true,
    expectedError: "failed-precondition",
  },
  "missing-repair-id": {
    description: "Missing repairt_id - should fail",
    payload: (ctx) => ({ status: "resolved" }),
    preProcess: "create-staff-facility-repair",
    cleanup: true,
    expectedError: "invalid-argument",
  },
  "missing-status": {
    description: "Missing status - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId }),
    preProcess: "create-staff-facility-repair",
    cleanup: true,
    expectedError: "invalid-argument",
  },
  "unauthenticated": {
    description: "Unauthenticated - should fail",
    payload: (ctx) => ({ repairt_id: "fake-id", status: "resolved" }),
    preProcess: null,
    cleanup: false,
    expectedError: "unauthenticated",
  },
  "not-staff": {
    description: "Not a staff - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-user-not-staff",
    cleanup: true,
    expectedError: "permission-denied",
  },
  "inactive-staff": {
    description: "Inactive staff - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-inactive-staff-facility-repair",
    cleanup: true,
    expectedError: "permission-denied",
  },
  "admin-not-allowed": {
    description: "Admin not allowed - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-admin-facility-repair",
    cleanup: true,
    expectedError: "permission-denied",
  },
  "wrong-staff": {
    description: "Wrong staff - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-wrong-staff-facility-repair",
    cleanup: true,
    expectedError: "permission-denied",
  },
  "facility-not-found": {
    description: "Facility not found - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-repair-missing-facility",
    cleanup: true,
    expectedError: "not-found",
  },
  "deleted-facility": {
    description: "Deleted facility - should fail",
    payload: (ctx) => ({ repairt_id: ctx.repairId, status: "resolved" }),
    preProcess: "create-staff-deleted-facility-repair",
    cleanup: true,
    expectedError: "failed-precondition",
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-staff-facility-repair": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    // 确保 staffId === userId
    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created staff ${staffId} (auth: ${userId})`);
    console.log(`  ✓ Created facility ${facilityId}`);
    console.log(`  ✓ Created repair ${repairId}`);
  },

  "create-staff-facility-repairs": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const otherRepairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    await db.collection("repair").doc(otherRepairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "plumbing",
      repair_description: "Other repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.otherRepairId = otherRepairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId, otherRepairId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created staff ${staffId}`);
    console.log(`  ✓ Created facility ${facilityId}`);
    console.log(`  ✓ Created repair ${repairId} and ${otherRepairId}`);
  },

  "create-staff-facility-with-staff-id": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId  // facility.staff_id = current staff
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: "",  // repair.staff_id empty
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-staff-facility-with-repair-staff-id": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: "other-staff-id"  // facility.staff_id = other staff
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,  // repair.staff_id = current staff
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-staff-facility-resolved-repair": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "resolved",  // already resolved
      completed_at: FieldValue.serverTimestamp()
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-staff-facility-terminated-repair": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "deleted",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "terminated",  // terminated
      completed_at: FieldValue.serverTimestamp()
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-user-not-staff": async (ctx) => {
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    // 不创建 admin_staff 文档

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-inactive-staff-facility-repair": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Inactive Staff",
      role: "Staff",
      status: "inactive"  // inactive
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-admin-facility-repair": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Admin User",
      role: "Admin",  // Admin, not Staff
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-wrong-staff-facility-repair": async (ctx) => {
    // 创建两个不同的 staff
    const staffId1 = "uts-staff-" + uuidv4().slice(0, 8);
    const staffId2 = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email1 = `test-${uuidv4()}@example.com`;
    const email2 = `test-${uuidv4()}@example.com`;

    // staff1 登录（用于调用）
    await createUserWithEmailAndPassword(auth, email1, "test-password-123");
    const userId1 = auth.currentUser.uid;
    await db.collection("admin_staff").doc(userId1).set({
      name: "Staff 1",
      role: "Staff",
      status: "active"
    });

    // staff2 也创建（但不登录）
    await createUserWithEmailAndPassword(auth, email2, "test-password-123");
    const userId2 = auth.currentUser.uid;
    await db.collection("admin_staff").doc(userId2).set({
      name: "Staff 2",
      role: "Staff",
      status: "active"
    });

    // 重新登录 staff1，确保当前登录用户是 staff1
    await signInWithEmailAndPassword(auth, email1, "test-password-123");
    const currentUserId = auth.currentUser.uid;

    // facility.staff_id = staff2（不是当前登录用户）
    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "fixing",
      staff_id: userId2
    });

    // repair.staff_id = staff2（不是当前登录用户）
    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId2,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = currentUserId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId1, userId2];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email1, email2];
  },

  "create-staff-repair-missing-facility": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    // 不创建 facility
    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,  // facility 不存在
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },

  "create-staff-deleted-facility-repair": async (ctx) => {
    const staffId = "uts-staff-" + uuidv4().slice(0, 8);
    const facilityId = "uts-fac-" + uuidv4().slice(0, 8);
    const repairId = "uts-repair-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(userId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Deleted Facility",
      status: "deleted",
      staff_id: userId
    });

    await db.collection("repair").doc(repairId).set({
      member_id: "some-member-id",
      facility_id: facilityId,
      staff_id: userId,
      type: "lighting",
      repair_description: "Test repair",
      status: "pending",
      completed_at: ""
    });

    ctx.staffId = userId;
    ctx.facilityId = facilityId;
    ctx.repairId = repairId;
    ctx.adminStaffIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.repairIds = [repairId];
    ctx.authUsers = [email];
  },
};

// ============ Main 函数 ============

const config = scenarios[scenario];
if (!config) {
  console.error(`Unknown scenario: ${scenario}`);
  process.exit(1);
}

console.log(`\n=== Testing scenario: ${scenario} ===`);
console.log(`Description: ${config.description}`);

const ctx = {
  adminStaffIds: [],
  facilityIds: [],
  repairIds: [],
  authUsers: []
};

async function runTest() {
  try {
    // preProcess
    if (config.preProcess) {
      console.log("Running preProcess...");
      const preProcess = preProcesses[config.preProcess];
      if (preProcess) {
        await preProcess(ctx);
      }
    }

    // 调用 callable
    const updateTicketStatus = httpsCallable(functions, "updateTicketStatus");
    console.log("Calling updateTicketStatus...");

    let result;
    try {
      result = await updateTicketStatus(config.payload(ctx));

      // 检查是否有错误但 call 成功的情况
      if (config.expectedError) {
        throw new Error(`Expected error ${config.expectedError}, but got success`);
      }

      // 验证返回值
      if (config.expectedSuccess) {
        if (!result.data.success) {
          throw new Error("Expected success, but got failure");
        }
        if (!result.data.repairt_id || !result.data.repair_id) {
          throw new Error("Missing repairt_id or repair_id in response");
        }
        if (result.data.repairt_id !== result.data.repair_id) {
          throw new Error("repairt_id and repair_id should match");
        }
        if (result.data.stats.notificationsCreated !== 0) {
          throw new Error("notificationsCreated should be 0");
        }
        if (result.data.stats.notificationFailures !== 0) {
          throw new Error("notificationFailures should be 0");
        }

        console.log(`  ✓ Repair resolved: ${result.data.repair_id}`);
        console.log(`  ✓ Facility status: ${result.data.facility_status}`);
        console.log(`  ✓ Facility restored: ${result.data.stats.facilityRestored}`);
      }

      // 验证数据库
      if (config.verifyDatabase) {
        const verified = await config.verifyDatabase(ctx);
        if (!verified) {
          throw new Error("Database verification failed");
        }
        console.log("  ✓ Database verification passed");
      }

    } catch (error) {
      // 处理 callable 抛出的错误
      const errorCode = normalizeErrorCode(error.code);

      if (config.expectedError) {
        if (errorCode === config.expectedError) {
          console.log(`  ✓ Got expected error: ${errorCode}`);
        } else {
          throw new Error(`Expected error ${config.expectedError}, but got ${errorCode}: ${error.message}`);
        }
      } else {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }

    console.log("\n=== TEST PASSED ===");
    return true;

  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error.message);
    throw error;
  }
}

// ============ Cleanup 函数 ============

async function cleanup() {
  if (!config.cleanup) return;

  console.log("Cleaning up...");

  try {
    // 1. 删除 repair
    for (const id of ctx.repairIds || []) {
      await db.collection("repair").doc(id).delete().catch(() => {});
    }

    // 2. 删除 facility
    for (const id of ctx.facilityIds || []) {
      await db.collection("facility").doc(id).delete().catch(() => {});
    }

    // 3. 删除 admin_staff
    for (const id of ctx.adminStaffIds || []) {
      await db.collection("admin_staff").doc(id).delete().catch(() => {});
    }

    // 4. 删除 Auth 用户
    for (const email of ctx.authUsers || []) {
      await deleteAuthUser(email);
    }

    console.log("  ✓ Cleanup done");
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
}

// ============ 运行测试 ============

runTest()
  .then(() => {
    return cleanup().then(() => process.exit(0));
  })
  .catch((error) => {
    return cleanup().then(() => process.exit(1));
  });