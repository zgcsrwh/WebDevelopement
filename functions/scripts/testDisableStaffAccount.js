/**
 * testDisableStaffAccount.js
 *
 * 本地测试脚本 for disableStaffAccount Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testDisableStaffAccount.js --scenario=disable-staff-success
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
const { getAuth: getAdminAuth } = require("firebase-admin/auth");

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
const adminAuth = getAdminAuth();
const { v4: uuidv4 } = require("uuid");

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
let scenario = "disable-staff-success";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// --list 在解析参数后立即处理
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");

  console.log("\nHappy:");
  console.log("  disable-staff-success");
  console.log("  disable-staff-already-deactivated-idempotent");

  console.log("\nFailure/Validation:");
  console.log("  missing-staff-id");
  console.log("  staff-not-found");
  console.log("  target-admin-not-allowed");
  console.log("  target-invalid-role-not-allowed");
  console.log("  cannot-disable-self");
  console.log("  blocked-by-active-facility");
  console.log("  blocked-by-facility-status-missing");
  console.log("  ignores-deleted-facility");

  console.log("\nPermission:");
  console.log("  unauthenticated");
  console.log("  member-not-allowed");
  console.log("  staff-not-allowed");
  console.log("  inactive-admin-not-allowed");

  console.log("\nSecurity:");
  console.log("  ignores-payload-role-status");

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

async function deleteAuthUserByUid(uid) {
  try {
    await adminAuth.deleteUser(uid);
  } catch (e) {
    // 如果已不存在，忽略
  }
}

async function verifyAuthStillExists(uid) {
  try {
    await adminAuth.getUser(uid);
    return true;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return false;
    }
    throw error;
  }
}

async function verifyAuthDisabled(uid) {
  try {
    const userRecord = await adminAuth.getUser(uid);
    return userRecord.disabled === true;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return false;
    }
    throw error;
  }
}

function generateUniqueEmail() {
  return `test-${uuidv4()}@example.com`;
}

// ============ Scenario 配置 ============

const scenarios = {
  // ============ Happy ============
  "disable-staff-success": {
    description: "Disable staff - success",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-staff",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证 admin_staff 文档仍存在
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status !== "deactivate") {
        throw new Error(`status should be deactivate, got ${data.status}`);
      }
      if (!data.updated_at) {
        throw new Error("updated_at should exist");
      }
      if (data.role !== "staff") {
        throw new Error(`role should be staff, got ${data.role}`);
      }

      // 验证 Auth user 仍存在且未 disabled
      const authExists = await verifyAuthStillExists(ctx.targetStaffUid);
      if (!authExists) {
        throw new Error("Auth user should still exist");
      }
      const authDisabled = await verifyAuthDisabled(ctx.targetStaffUid);
      if (authDisabled) {
        throw new Error("Auth user should not be disabled");
      }

      return true;
    },
  },

  "disable-staff-already-deactivated-idempotent": {
    description: "Disable already-deactivated staff - idempotent",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-deactivated-staff",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证 status 仍是 deactivate
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status !== "deactivate") {
        throw new Error(`status should be deactivate, got ${data.status}`);
      }

      // 验证 Auth user 仍存在
      const authExists = await verifyAuthStillExists(ctx.targetStaffUid);
      if (!authExists) {
        throw new Error("Auth user should still exist");
      }

      return true;
    },
  },

  // ============ Failure/Validation ============
  "missing-staff-id": {
    description: "Missing staff_id - invalid-argument",
    payload: (ctx) => ({}),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "staff-not-found": {
    description: "Staff not found - not-found",
    payload: (ctx) => ({
      staff_id: "missing-staff-id",
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "not-found",
  },

  "target-admin-not-allowed": {
    description: "Target is admin - failed-precondition",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-target-admin",
    cleanup: true,
    expectedError: "failed-precondition",
    verifyDatabase: async (ctx) => {
      // 验证 target status 未被修改
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status === "deactivate") {
        throw new Error("target status should not be changed to deactivate");
      }
      return true;
    },
  },

  "target-invalid-role-not-allowed": {
    description: "Target role is invalid - failed-precondition",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-staff-invalid-role",
    cleanup: true,
    expectedError: "failed-precondition",
    verifyDatabase: async (ctx) => {
      // 验证 target status 未被修改
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status === "deactivate") {
        throw new Error("target status should not be changed to deactivate");
      }
      return true;
    },
  },

  "cannot-disable-self": {
    description: "Cannot disable self - failed-precondition",
    payload: (ctx) => ({
      staff_id: ctx.adminUid, // caller tries to disable self
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  "blocked-by-active-facility": {
    description: "Staff manages active facility - failed-precondition",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-staff-with-active-facility",
    cleanup: true,
    expectedError: "failed-precondition",
    verifyDatabase: async (ctx) => {
      // 验证 target status 未被修改
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status === "deactivate") {
        throw new Error("target status should not be changed to deactivate");
      }

      // 验证 facility doc 仍存在
      if (!ctx.createdFacilityId) {
        throw new Error("facility should be created");
      }
      const facilityDoc = await db.collection("facility").doc(ctx.createdFacilityId).get();
      if (!facilityDoc.exists) {
        throw new Error("facility doc should still exist");
      }

      return true;
    },
  },

  "blocked-by-facility-status-missing": {
    description: "Facility status missing - failed-precondition",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-staff-with-missing-facility",
    cleanup: true,
    expectedError: "failed-precondition",
    verifyDatabase: async (ctx) => {
      // 验证 target status 未被修改
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status === "deactivate") {
        throw new Error("target status should not be changed to deactivate");
      }

      // 验证 facility doc 仍存在
      if (!ctx.createdFacilityId) {
        throw new Error("facility should be created");
      }
      const facilityDoc = await db.collection("facility").doc(ctx.createdFacilityId).get();
      if (!facilityDoc.exists) {
        throw new Error("facility doc should still exist");
      }

      return true;
    },
  },

  "ignores-deleted-facility": {
    description: "Deleted facility - allows disable",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-staff-with-deleted-facility",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证 target status 已改成 deactivate
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status !== "deactivate") {
        throw new Error(`status should be deactivate, got ${data.status}`);
      }

      // 验证 facility doc 仍存在且 status 仍是 deleted
      if (!ctx.createdFacilityId) {
        throw new Error("facility should be created");
      }
      const facilityDoc = await db.collection("facility").doc(ctx.createdFacilityId).get();
      if (!facilityDoc.exists) {
        throw new Error("facility doc should still exist");
      }
      if (facilityDoc.data().status !== "deleted") {
        throw new Error("facility status should be deleted");
      }

      return true;
    },
  },

  // ============ Permission ============
  "unauthenticated": {
    description: "Unauthenticated - unauthenticated error",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-admin-and-staff",
    cleanup: true,
    expectedError: "unauthenticated",
  },

  "member-not-allowed": {
    description: "Member not allowed - permission-denied error",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-member-and-staff",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "staff-not-allowed": {
    description: "Staff not allowed - permission-denied error",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-staff-caller-and-target-staff",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "inactive-admin-not-allowed": {
    description: "Inactive admin not allowed - failed-precondition error",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
    }),
    preProcess: "create-inactive-admin-and-staff",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  // ============ Security ============
  "ignores-payload-role-status": {
    description: "Ignores payload role/status - security",
    payload: (ctx) => ({
      staff_id: ctx.targetStaffUid,
      role: "admin",
      status: "active",
      email: "fake@example.com",
      uid: "fake-uid",
      admin_id: "fake-admin",
    }),
    preProcess: "create-admin-and-staff",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证 target status 已被改成 deactivate
      const staffDoc = await db.collection("admin_staff").doc(ctx.targetStaffUid).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document should still exist");
      }
      const data = staffDoc.data();
      if (data.status !== "deactivate") {
        throw new Error(`status should be deactivate, got ${data.status}`);
      }
      if (data.role !== "staff") {
        throw new Error(`role should be staff (ignored payload), got ${data.role}`);
      }

      return true;
    },
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-admin": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: email,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = email;
    ctx.adminStaffIds = [adminUid];
    ctx.memberIds = [];
    ctx.authUsers = [email];
    ctx.targetStaffUid = null;

    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-admin-and-staff": async (ctx) => {
    // 1. 先创建 target staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "active",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 再创建 admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target staff ${staffUid}`);
    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-admin-and-deactivated-staff": async (ctx) => {
    // 1. 先创建 target deactivated staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "deactivate",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 再创建 admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target deactivated staff ${staffUid}`);
    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-admin-and-target-admin": async (ctx) => {
    // 1. 先创建 target admin (not staff)
    const targetEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, targetEmail, "test-password-123");
    const targetUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(targetUid).set({
      name: "Target Admin",
      email: targetEmail,
      status: "active",
      role: "admin",
    });

    ctx.targetStaffUid = targetUid;
    ctx.targetStaffEmail = targetEmail;
    ctx.adminStaffIds = [targetUid];
    ctx.authUsers = [targetEmail];

    // 2. 再创建 admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target admin ${targetUid}`);
    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-admin-and-staff-invalid-role": async (ctx) => {
    // 1. 先创建 target staff with invalid role
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "active",
      role: "manager", // invalid role
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 再创建 admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target staff with invalid role ${staffUid}`);
    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-admin-and-staff-with-active-facility": async (ctx) => {
    // 1. 先创建 target staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "active",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 创建 active facility
    const facilityId = `facility-${uuidv4()}`;
    await db.collection("facility").doc(facilityId).set({
      name: "Blocked Facility",
      staff_id: staffUid,
      status: "normal",
    });
    ctx.createdFacilityId = facilityId;
    ctx.facilityIds = [facilityId];

    // 3. 再创建 admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target staff ${staffUid}`);
    console.log(`  ✓ Created active facility ${facilityId}`);
    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-admin-and-staff-with-missing-facility": async (ctx) => {
    // 1. 先创建 target staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "active",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 创建 facility without status
    const facilityId = `facility-${uuidv4()}`;
    await db.collection("facility").doc(facilityId).set({
      name: "Missing Status Facility",
      staff_id: staffUid,
      // status 缺失
    });
    ctx.createdFacilityId = facilityId;
    ctx.facilityIds = [facilityId];

    // 3. 再创建 admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target staff ${staffUid}`);
    console.log(`  ✓ Created facility with missing status ${facilityId}`);
    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-admin-and-staff-with-deleted-facility": async (ctx) => {
    // 1. 先创建 target staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "active",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 创建 deleted facility
    const facilityId = `facility-${uuidv4()}`;
    await db.collection("facility").doc(facilityId).set({
      name: "Deleted Facility",
      staff_id: staffUid,
      status: "deleted",
    });
    ctx.createdFacilityId = facilityId;
    ctx.facilityIds = [facilityId];

    // 3. 再创建 admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target staff ${staffUid}`);
    console.log(`  ✓ Created deleted facility ${facilityId}`);
    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-member-and-staff": async (ctx) => {
    // 1. 先创建 target staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "active",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 创建 member caller
    const memberEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, memberEmail, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: memberEmail,
      status: "active",
      role: "Member",
    });

    ctx.adminUid = memberUid;
    ctx.adminEmail = memberEmail;
    ctx.memberIds = [memberUid];
    ctx.authUsers.push(memberEmail);

    console.log(`  ✓ Created target staff ${staffUid}`);
    console.log(`  ✓ Created member ${memberUid}`);
  },

  "create-staff-caller-and-target-staff": async (ctx) => {
    // 1. 先创建 target staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Target Staff",
      email: staffEmail,
      status: "active",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 创建 staff caller
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(callerUid).set({
      name: "Caller Staff",
      email: callerEmail,
      status: "active",
      role: "staff",
    });

    ctx.adminUid = callerUid;
    ctx.adminEmail = callerEmail;
    ctx.adminStaffIds.push(callerUid);
    ctx.authUsers.push(callerEmail);

    console.log(`  ✓ Created target staff ${staffUid}`);
    console.log(`  ✓ Created staff caller ${callerUid}`);
  },

  "create-inactive-admin-and-staff": async (ctx) => {
    // 1. 先创建 target staff
    const staffEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, staffEmail, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: staffEmail,
      status: "active",
      role: "staff",
    });

    ctx.targetStaffUid = staffUid;
    ctx.targetStaffEmail = staffEmail;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [staffEmail];

    // 2. 创建 inactive admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Inactive Admin",
      email: adminEmail,
      status: "inactive",
      role: "admin",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds.push(adminUid);
    ctx.authUsers.push(adminEmail);

    console.log(`  ✓ Created target staff ${staffUid}`);
    console.log(`  ✓ Created inactive admin ${adminUid}`);
  },
};

// ============ 全局上下文 ============

const config = scenarios[scenario];
const ctx = {
  adminUid: null,
  adminEmail: null,
  targetStaffUid: null,
  targetStaffEmail: null,
  adminStaffIds: [],
  memberIds: [],
  authUsers: [],
  facilityIds: [],
  createdFacilityId: null,
};

// ============ 测试运行函数 ============

async function runTest() {
  if (!config) {
    console.error(`Unknown scenario: ${scenario}`);
    process.exit(1);
  }

  console.log(`\nRunning scenario: ${scenario}`);
  console.log(`Description: ${config.description}`);

  try {
    // preProcess
    if (config.preProcess) {
      console.log("Running preProcess...");
      const preProcess = preProcesses[config.preProcess];
      if (preProcess) {
        await preProcess(ctx);
      }
    }

    // 如果是 unauthenticated 场景，先登出
    if (scenario === "unauthenticated") {
      await signOut(auth);
    } else {
      // 登录为 caller
      await signInWithEmailAndPassword(auth, ctx.adminEmail, "test-password-123");
    }

    // 调用 callable
    const disableStaffAccountCallable = httpsCallable(functions, "disableStaffAccount");
    console.log("Calling disableStaffAccount...");

    let result;
    try {
      result = await disableStaffAccountCallable(config.payload(ctx));

      // 检查是否有错误但 call 成功的情况
      if (config.expectedError) {
        throw new Error(`Expected error ${config.expectedError}, but got success`);
      }

      // 验证返回值
      if (config.expectedSuccess) {
        const data = result.data;
        if (data.success !== true) {
          throw new Error(`success should be true, got ${data.success}`);
        }

        console.log(`  ✓ success: ${data.success}`);
      }

      // 验证数据库
      if (config.verifyDatabase) {
        const verified = await config.verifyDatabase(ctx);
        if (!verified) {
          throw new Error("Database verification failed");
        }
        console.log("  ✓ Database verification passed");
      }

      console.log("TEST PASSED");
    } catch (callError) {
      // callable 抛出错误
      if (config.expectedError) {
        const errorCode = normalizeErrorCode(callError.code || callError.details?.code);
        if (errorCode !== config.expectedError) {
          throw new Error(`Expected error ${config.expectedError}, got ${errorCode}: ${callError.message}`);
        }
        console.log(`  ✓ Error code: ${errorCode}`);
        console.log(`  ✓ Error message: ${callError.message}`);

        // 验证数据库
        if (config.verifyDatabase) {
          const verified = await config.verifyDatabase(ctx);
          if (!verified) {
            throw new Error("Database verification failed");
          }
          console.log("  ✓ Database verification passed");
        }

        console.log("TEST PASSED");
        return;
      }

      // 没有预期错误但抛出了错误
      throw callError;
    }
  } catch (error) {
    console.error("TEST FAILED:", error.message);
    throw error;
  }
}

// ============ Cleanup 函数 ============

async function cleanup() {
  if (!config.cleanup) return;

  console.log("Cleaning up...");

  try {
    // 1. 删除 facility
    for (const id of ctx.facilityIds || []) {
      await db.collection("facility").doc(id).delete().catch(() => {});
    }

    // 2. 删除 admin_staff
    for (const id of ctx.adminStaffIds || []) {
      await db.collection("admin_staff").doc(id).delete().catch(() => {});
    }

    // 3. 删除 member
    for (const id of ctx.memberIds || []) {
      await db.collection("member").doc(id).delete().catch(() => {});
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