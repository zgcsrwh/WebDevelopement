/**
 * testCreateStaffAccount.js
 *
 * 本地测试脚本 for createStaffAccount Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testCreateStaffAccount.js --scenario=create-staff-success
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
let scenario = "create-staff-success";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// --list 在解析参数后立即处理
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");

  console.log("\nHappy:");
  console.log("  create-staff-success");
  console.log("  create-staff-success-iso-date");
  console.log("  create-staff-success-lowercases-email");

  console.log("\nValidation:");
  console.log("  missing-name");
  console.log("  name-too-long");
  console.log("  name-contains-html");
  console.log("  missing-email");
  console.log("  invalid-email");
  console.log("  missing-date-of-birth");
  console.log("  invalid-date-of-birth");
  console.log("  date-of-birth-in-future");
  console.log("  date-of-birth-too-old");
  console.log("  missing-address");
  console.log("  address-too-long");
  console.log("  address-contains-html");
  console.log("  missing-password");
  console.log("  weak-password-too-short");
  console.log("  weak-password-no-letter");
  console.log("  weak-password-no-number");
  console.log("  weak-password-has-space");

  console.log("\nDuplicate:");
  console.log("  duplicate-email-auth");
  console.log("  duplicate-email-admin-staff");
  console.log("  duplicate-email-member");

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

async function verifyAuthDeleted(uid) {
  try {
    await adminAuth.getUser(uid);
    return false;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return true;
    }
    throw error;
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

function generateUniqueEmail() {
  return `test-${uuidv4()}@example.com`;
}

// ============ Scenario 配置 ============

const scenarios = {
  // ============ Happy ============
  "create-staff-success": {
    description: "Create staff with YYYY-MM-DD date - success",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证 Auth user
      const userRecord = await adminAuth.getUser(ctx.createdStaffId);
      const userRecordByEmail = await adminAuth.getUserByEmail(ctx.staffEmail.toLowerCase());
      if (userRecord.uid !== userRecordByEmail.uid) {
        throw new Error("Auth user uid mismatch by getUser and getUserByEmail");
      }

      // 验证 admin_staff 文档
      const staffDoc = await db.collection("admin_staff").doc(ctx.createdStaffId).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document does not exist");
      }
      const data = staffDoc.data();
      if (data.role !== "staff") {
        throw new Error(`role should be staff, got ${data.role}`);
      }
      if (data.status !== "active") {
        throw new Error(`status should be active, got ${data.status}`);
      }
      if (data.email !== ctx.staffEmail.toLowerCase()) {
        throw new Error(`email should be lowercase, got ${data.email}`);
      }
      if (data.date_of_birth !== "2000-05-07") {
        throw new Error(`date_of_birth should be 2000-05-07, got ${data.date_of_birth}`);
      }
      if (data.name !== "Test Staff") {
        throw new Error(`name mismatch, got ${data.name}`);
      }
      if (data.address !== "Test Address") {
        throw new Error(`address mismatch, got ${data.address}`);
      }
      if (!data.created_at) {
        throw new Error("created_at should exist");
      }
      if (!data.updated_at) {
        throw new Error("updated_at should exist");
      }

      // 验证不存在 member 文档
      const memberDoc = await db.collection("member").doc(ctx.createdStaffId).get();
      if (memberDoc.exists) {
        throw new Error("member document should not exist");
      }

      return true;
    },
  },

  "create-staff-success-iso-date": {
    description: "Create staff with ISO date - success",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07T00:00:00.000Z",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.createdStaffId).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document does not exist");
      }
      const data = staffDoc.data();
      if (data.date_of_birth !== "2000-05-07") {
        throw new Error(`date_of_birth should be normalized to 2000-05-07, got ${data.date_of_birth}`);
      }
      return true;
    },
  },

  "create-staff-success-lowercases-email": {
    description: "Create staff with mixed-case email - success",
    payload: (ctx) => {
      const mixedEmail = ctx.staffEmail.replace("test-", "Test-").replace("@example.", "@Example.");
      ctx.expectedStaffEmail = mixedEmail.toLowerCase();
      return {
        name: "Test Staff",
        email: mixedEmail,
        date_of_birth: "2000-05-07",
        address: "Test Address",
        password: "Staff1234"
      };
    },
    preProcess: "create-admin",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证 email 被 normalize 为小写
      const staffDoc = await db.collection("admin_staff").doc(ctx.createdStaffId).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document does not exist");
      }
      const data = staffDoc.data();
      if (data.email !== ctx.expectedStaffEmail) {
        throw new Error(`email should be ${ctx.expectedStaffEmail}, got ${data.email}`);
      }

      // 验证 Auth 中也是小写
      const userRecord = await adminAuth.getUserByEmail(data.email);
      if (userRecord.email !== data.email) {
        throw new Error(`Auth email should be ${data.email}, got ${userRecord.email}`);
      }

      return true;
    },
  },

  // ============ Validation ============
  "missing-name": {
    description: "Missing name - validation error",
    payload: (ctx) => ({
      name: "",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "name-too-long": {
    description: "Name too long - validation error",
    payload: (ctx) => ({
      name: "A".repeat(81),
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "name-contains-html": {
    description: "Name contains HTML - validation error",
    payload: (ctx) => ({
      name: "Test <script>Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "missing-email": {
    description: "Missing email - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: "",
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "invalid-email": {
    description: "Invalid email - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: "not-an-email",
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "missing-date-of-birth": {
    description: "Missing date_of_birth - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "invalid-date-of-birth": {
    description: "Invalid date_of_birth - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "not-a-date",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "date-of-birth-in-future": {
    description: "date_of_birth in future - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2099-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "date-of-birth-too-old": {
    description: "date_of_birth too old - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "1899-01-01",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "missing-address": {
    description: "Missing address - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "address-too-long": {
    description: "Address too long - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "A".repeat(201),
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "address-contains-html": {
    description: "Address contains HTML - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test <script>Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "missing-password": {
    description: "Missing password - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: ""
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "weak-password-too-short": {
    description: "Password too short - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "1234567"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "weak-password-no-letter": {
    description: "Password no letter - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "12345678"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "weak-password-no-number": {
    description: "Password no number - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "abcdefgh"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "weak-password-has-space": {
    description: "Password has space - validation error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff 1234"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  // ============ Duplicate ============
  "duplicate-email-auth": {
    description: "Duplicate email in Auth - already-exists error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.duplicateEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin-with-duplicate-email",
    cleanup: true,
    expectedError: "already-exists",
    verifyDatabase: async (ctx) => {
      // 验证没有创建新的 staff admin_staff 文档
      // duplicate-email-auth：只有 Auth 中有该 email，admin_staff 里没有
      if (ctx.createdStaffId) {
        throw new Error("Should not create staff when email already exists in Auth");
      }
      // 确认 email 仍然只存在于 Auth 中
      const staffDocs = await db.collection("admin_staff").where("email", "==", ctx.duplicateEmail.toLowerCase()).get();
      if (!staffDocs.empty) {
        throw new Error("Should not have admin_staff with duplicate email");
      }
      return true;
    },
  },

  "duplicate-email-admin-staff": {
    description: "Duplicate email in admin_staff - already-exists error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.duplicateEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin-with-existing-staff-email",
    cleanup: true,
    expectedError: "already-exists",
    verifyDatabase: async (ctx) => {
      // 验证没有创建新的 staff
      if (ctx.createdStaffId) {
        throw new Error("Should not create staff when email already exists in admin_staff");
      }
      // 确认只有 preProcess 创建的 duplicate admin_staff 文档
      const staffDocs = await db.collection("admin_staff").where("email", "==", ctx.duplicateEmail.toLowerCase()).get();
      const staffDocsWithRoleStaff = staffDocs.docs.filter(d => d.data().role === "staff");
      if (staffDocsWithRoleStaff.length > ctx.preCreatedDuplicateStaffIds.length) {
        throw new Error("Should not create additional staff with duplicate email");
      }
      return true;
    },
  },

  "duplicate-email-member": {
    description: "Duplicate email in member - already-exists error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.duplicateEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-admin-with-existing-member-email",
    cleanup: true,
    expectedError: "already-exists",
    verifyDatabase: async (ctx) => {
      // 验证没有创建新的 staff
      if (ctx.createdStaffId) {
        throw new Error("Should not create staff when email already exists in member");
      }
      // 确认 preProcess 创建的 duplicate member 文档仍然存在
      const memberDocs = await db.collection("member").where("email", "==", ctx.duplicateEmail.toLowerCase()).get();
      if (memberDocs.size < ctx.preCreatedDuplicateMemberIds.length) {
        throw new Error("Duplicate member document should still exist");
      }
      return true;
    },
  },

  // ============ Permission ============
  "unauthenticated": {
    description: "Unauthenticated - unauthenticated error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: null,
    cleanup: false,
    expectedError: "unauthenticated",
  },

  "member-not-allowed": {
    description: "Member not allowed - permission-denied error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-member",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "staff-not-allowed": {
    description: "Staff not allowed - permission-denied error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-staff",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "inactive-admin-not-allowed": {
    description: "Inactive admin not allowed - failed-precondition error",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234"
    }),
    preProcess: "create-inactive-admin",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  // ============ Security ============
  "ignores-payload-role-status": {
    description: "Ignores payload role/status - security",
    payload: (ctx) => ({
      name: "Test Staff",
      email: ctx.staffEmail,
      date_of_birth: "2000-05-07",
      address: "Test Address",
      password: "Staff1234",
      role: "admin",
      status: "inactive",
      uid: "fake-uid",
      admin_id: "fake-admin"
    }),
    preProcess: "create-admin",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.createdStaffId).get();
      if (!staffDoc.exists) {
        throw new Error("admin_staff document does not exist");
      }
      const data = staffDoc.data();
      // role 和 status 应该被忽略，仍然是固定值
      if (data.role !== "staff") {
        throw new Error(`role should be staff (ignored payload), got ${data.role}`);
      }
      if (data.status !== "active") {
        throw new Error(`status should be active (ignored payload), got ${data.status}`);
      }
      // doc id 应该是新 Auth UID，不是 payload.uid
      if (data.email !== ctx.staffEmail.toLowerCase()) {
        throw new Error("email should be normalized");
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
      role: "admin"
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = email;
    ctx.adminStaffIds = [adminUid];
    ctx.memberIds = [];
    ctx.authUsers = [email];
    // 为 create-staff-success 场景准备一个新的 unique email
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
  },

  "create-member": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    ctx.adminUid = memberUid;
    ctx.adminEmail = email;
    ctx.memberEmail = email;
    ctx.adminStaffIds = [];
    ctx.memberIds = [memberUid];
    ctx.authUsers = [email];
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created member ${memberUid}`);
  },

  "create-staff": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: email,
      status: "active",
      role: "staff"
    });

    // caller email
    ctx.adminUid = staffUid;
    ctx.adminEmail = email;
    ctx.adminStaffIds = [staffUid];
    ctx.memberIds = [];
    ctx.authUsers = [email];
    // target new staff email
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created staff ${staffUid} (role: staff)`);
  },

  "create-inactive-admin": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Inactive Admin",
      email: email,
      status: "inactive",
      role: "admin"
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = email;
    ctx.adminStaffIds = [adminUid];
    ctx.memberIds = [];
    ctx.authUsers = [email];
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created inactive admin ${adminUid}`);
  },

  "create-staff": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: email,
      status: "active",
      role: "staff"
    });

    // caller email
    ctx.adminUid = staffUid;
    ctx.adminEmail = email;
    ctx.adminStaffIds = [staffUid];
    ctx.memberIds = [];
    ctx.authUsers = [email];
    // target new staff email
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created staff ${staffUid} (role: staff)`);
  },

  "create-inactive-admin": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Inactive Admin",
      email: email,
      status: "inactive",
      role: "admin"
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = email;
    ctx.adminStaffIds = [adminUid];
    ctx.memberIds = [];
    ctx.authUsers = [email];
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created inactive admin ${adminUid}`);
  },

  "create-admin-with-duplicate-email": async (ctx) => {
    // 1. 创建 active Admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin"
    });

    // 2. 再创建一个 duplicate Auth user（无 Firestore 文档）
    const duplicateEmail = generateUniqueEmail();
    // 切换到另一个 Auth app 的方式比较复杂，这里用 Admin SDK 创建
    const duplicateUserRecord = await adminAuth.createUser({
      email: duplicateEmail,
      password: "Test1234",
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds = [adminUid];
    ctx.memberIds = [];
    ctx.authUsers = [adminEmail]; // Admin Auth 会由 cleanup 删除，duplicate 用 Admin SDK 创建的需要单独清理
    ctx.duplicateEmail = duplicateEmail;
    ctx.duplicateAuthUid = duplicateUserRecord.uid;
    ctx.preCreatedDuplicateAuthUids = [duplicateUserRecord.uid];
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
    console.log(`  ✓ Created duplicate Auth user ${duplicateUserRecord.uid}`);
  },

  "create-admin-with-existing-staff-email": async (ctx) => {
    // 1. 创建 active Admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin"
    });

    // 2. 额外创建一个 admin_staff duplicate 文档（不需要 Auth user）
    const duplicateEmail = generateUniqueEmail();
    const duplicateStaffId = `duplicate-staff-${uuidv4()}`;
    await db.collection("admin_staff").doc(duplicateStaffId).set({
      name: "Existing Staff",
      email: duplicateEmail,
      status: "active",
      role: "staff"
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds = [adminUid, duplicateStaffId];
    ctx.memberIds = [];
    ctx.authUsers = [adminEmail];
    ctx.duplicateEmail = duplicateEmail;
    ctx.preCreatedDuplicateStaffIds = [duplicateStaffId];
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
    console.log(`  ✓ Created duplicate admin_staff ${duplicateStaffId}`);
  },

  "create-admin-with-existing-member-email": async (ctx) => {
    // 1. 创建 active Admin caller
    const adminEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, adminEmail, "test-password-123");
    const adminUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(adminUid).set({
      name: "Test Admin",
      email: adminEmail,
      status: "active",
      role: "admin"
    });

    // 2. 额外创建一个 member duplicate 文档（不需要 Auth user）
    const duplicateEmail = generateUniqueEmail();
    const duplicateMemberId = `duplicate-member-${uuidv4()}`;
    await db.collection("member").doc(duplicateMemberId).set({
      name: "Existing Member",
      email: duplicateEmail,
      status: "active",
      role: "Member"
    });

    ctx.adminUid = adminUid;
    ctx.adminEmail = adminEmail;
    ctx.adminStaffIds = [adminUid];
    ctx.memberIds = [duplicateMemberId];
    ctx.authUsers = [adminEmail];
    ctx.duplicateEmail = duplicateEmail;
    ctx.preCreatedDuplicateMemberIds = [duplicateMemberId];
    ctx.staffEmail = generateUniqueEmail();

    console.log(`  ✓ Created admin ${adminUid} (role: admin)`);
    console.log(`  ✓ Created duplicate member ${duplicateMemberId}`);
  },
};

// ============ 全局上下文 ============

const config = scenarios[scenario];
const ctx = {
  adminUid: null,
  adminEmail: null,
  createdStaffId: null,
  adminStaffIds: [],
  memberIds: [],
  authUsers: [],
  staffEmail: "",
  duplicateEmail: "",
  preCreatedDuplicateAuthUids: [],
  preCreatedDuplicateStaffIds: [],
  preCreatedDuplicateMemberIds: [],
  expectedStaffEmail: "",
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
      // 登录为 Admin caller
      await signInWithEmailAndPassword(auth, ctx.adminEmail, "test-password-123");
    }

    // 调用 callable
    const createStaffAccountCallable = httpsCallable(functions, "createStaffAccount");
    console.log("Calling createStaffAccount...");

    let result;
    try {
      result = await createStaffAccountCallable(config.payload(ctx));

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
        if (!data.staff_id) {
          throw new Error("staff_id should exist");
        }
        ctx.createdStaffId = data.staff_id;

        console.log(`  ✓ success: ${data.success}`);
        console.log(`  ✓ staff_id: ${data.staff_id}`);
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

        // 验证数据库没有创建不该创建的内容
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
    // 1. 删除 created staff（如果创建了）
    if (ctx.createdStaffId) {
      await db.collection("admin_staff").doc(ctx.createdStaffId).delete().catch(() => {});
      await deleteAuthUserByUid(ctx.createdStaffId);
      console.log(`  ✓ Deleted created staff ${ctx.createdStaffId}`);
    }

    // 2. 删除 admin_staff（包含 preProcess 创建的 duplicate staff）
    for (const id of ctx.adminStaffIds || []) {
      await db.collection("admin_staff").doc(id).delete().catch(() => {});
    }

    // 3. 删除 member（包含 preProcess 创建的 duplicate member）
    for (const id of ctx.memberIds || []) {
      await db.collection("member").doc(id).delete().catch(() => {});
    }

    // 4. 删除 duplicate Auth users（用 Admin SDK 创建的）
    for (const uid of ctx.preCreatedDuplicateAuthUids || []) {
      await deleteAuthUserByUid(uid);
    }

    // 5. 删除 Auth caller user（用 Client SDK 创建的）
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