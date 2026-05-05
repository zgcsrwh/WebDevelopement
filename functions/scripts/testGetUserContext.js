/**
 * testGetUserContext.js
 *
 * 本地测试脚本 for getUserContext Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testGetUserContext.js --scenario=member-login
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
let scenario = "member-login";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// --list 在解析参数后立即处理
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");
  console.log("\nHappy paths:");
  console.log("  member-login");
  console.log("  staff-login");
  console.log("  admin-login");
  console.log("  new-user-login");
  console.log("  inactive-member-login");
  console.log("  inactive-staff-login");
  console.log("\nSecurity/priority paths:");
  console.log("  admin-priority-over-member");
  console.log("  ignores-payload-role");
  console.log("\nFailure paths:");
  console.log("  unauthenticated");
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
  "member-login": {
    description: "Member login - returns Member role",
    payload: (ctx) => ({}),
    preProcess: "create-member",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Member",
      status: "active",
      isProfileComplete: true,
      profileRole: "Member"
    },
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return (
        memberDoc.exists &&
        memberDoc.data().status === "active"
      );
    },
  },
  "staff-login": {
    description: "Staff login - returns Staff role",
    payload: (ctx) => ({}),
    preProcess: "create-staff",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Staff",
      status: "active",
      isProfileComplete: true,
      profileRole: "Staff"
    },
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return (
        staffDoc.exists &&
        String(staffDoc.data().role || "").toLowerCase() === "staff"
      );
    },
  },
  "admin-login": {
    description: "Admin login - returns Admin role",
    payload: (ctx) => ({}),
    preProcess: "create-admin",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Admin",
      status: "active",
      isProfileComplete: true,
      profileRole: "Admin"
    },
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return (
        staffDoc.exists &&
        String(staffDoc.data().role || "").toLowerCase() === "admin"
      );
    },
  },
  "new-user-login": {
    description: "New user login - returns fallback Member",
    payload: (ctx) => ({ email: "newuser@example.com", displayName: "New User" }),
    preProcess: "create-no-document",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Member",
      status: "active",
      isProfileComplete: false,
      profileRole: "Member",
      profileName: "New User"
    },
    verifyDatabase: async (ctx) => {
      // 新用户没有 member/admin_staff 文档
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return !memberDoc.exists && !staffDoc.exists;
    },
  },
  "inactive-member-login": {
    description: "Inactive member login - returns status inactive",
    payload: (ctx) => ({}),
    preProcess: "create-inactive-member",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Member",
      status: "inactive",
      isProfileComplete: true,
      profileRole: "Member"
    },
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return (
        memberDoc.exists &&
        memberDoc.data().status === "inactive"
      );
    },
  },
  "inactive-staff-login": {
    description: "Inactive staff login - returns status inactive",
    payload: (ctx) => ({}),
    preProcess: "create-inactive-staff",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Staff",
      status: "inactive",
      isProfileComplete: true,
      profileRole: "Staff"
    },
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return (
        staffDoc.exists &&
        staffDoc.data().status === "inactive"
      );
    },
  },
  "admin-priority-over-member": {
    description: "Admin priority over member - returns Admin",
    payload: (ctx) => ({}),
    preProcess: "create-admin-and-member",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Admin",
      status: "active",
      isProfileComplete: true,
      profileRole: "Admin"
    },
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return memberDoc.exists && staffDoc.exists;
    },
  },
  "ignores-payload-role": {
    description: "Ignores payload role - returns Member from auth",
    payload: (ctx) => ({ role: "Admin", uid: "fake-admin-uid", member_id: "fake-member-id", staff_id: "fake-staff-id", email: "admin@example.com", displayName: "Fake Admin" }),
    preProcess: "create-member",
    cleanup: true,
    expectedSuccess: true,
    expected: {
      role: "Member",
      status: "active",
      isProfileComplete: true,
      profileRole: "Member"
    },
    verifyDatabase: async (ctx) => {
      // payload role should be ignored
      return true;
    },
  },
  "unauthenticated": {
    description: "Unauthenticated - returns error",
    payload: (ctx) => ({}),
    preProcess: null,
    cleanup: false,
    expectedError: "unauthenticated",
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-member": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} (auth: ${staffId})`);
  },

  "create-staff": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffId).set({
      name: "Test Staff",
      email: email,
      status: "active",
      role: "Staff"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [];
    ctx.adminStaffIds = [staffId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created staff ${staffId} (role: Staff)`);
  },

  "create-admin": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffId).set({
      name: "Test Admin",
      email: email,
      status: "active",
      role: "admin"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [];
    ctx.adminStaffIds = [staffId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created admin ${staffId} (role: admin)`);
  },

  "create-no-document": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    // 不创建任何 Firestore 文档

    ctx.staffId = staffId;
    ctx.memberIds = [];
    ctx.adminStaffIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created user ${staffId} (no Firestore document)`);
  },

  "create-inactive-member": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Inactive Member",
      email: email,
      status: "inactive",
      role: "Member"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created inactive member ${staffId}`);
  },

  "create-inactive-staff": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffId).set({
      name: "Inactive Staff",
      email: email,
      status: "inactive",
      role: "Staff"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [];
    ctx.adminStaffIds = [staffId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created inactive staff ${staffId}`);
  },

  "create-admin-and-member": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    // 两个文档都用同一个 uid
    await db.collection("admin_staff").doc(staffId).set({
      name: "Test Admin",
      email: email,
      status: "active",
      role: "admin"
    });

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [staffId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created both admin_staff and member for ${staffId}`);
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
  staffId: null,
  memberIds: [],
  adminStaffIds: [],
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

    // 如果是 unauthenticated 场景，先登出
    if (scenario === "unauthenticated") {
      await signOut(auth);
    }

    // 调用 callable
    const getUserContextCallable = httpsCallable(functions, "getUserContext");
    console.log("Calling getUserContext...");

    let result;
    try {
      result = await getUserContextCallable(config.payload(ctx));

      // 检查是否有错误但 call 成功的情况
      if (config.expectedError) {
        throw new Error(`Expected error ${config.expectedError}, but got success`);
      }

      // 验证返回值
      if (config.expectedSuccess) {
        const exp = config.expected;

        // 断言 role
        if (result.data.role !== exp.role) {
          throw new Error(`role mismatch: expected ${exp.role}, got ${result.data.role}`);
        }

        // 断言 status
        if (result.data.status !== exp.status) {
          throw new Error(`status mismatch: expected ${exp.status}, got ${result.data.status}`);
        }

        // 断言 isProfileComplete
        if (result.data.isProfileComplete !== exp.isProfileComplete) {
          throw new Error(`isProfileComplete mismatch: expected ${exp.isProfileComplete}, got ${result.data.isProfileComplete}`);
        }

        // 断言 profile.id
        if (!result.data.profile || !result.data.profile.id) {
          throw new Error("Missing profile.id in response");
        }
        if (result.data.profile.id !== ctx.staffId) {
          throw new Error(`profile.id mismatch: expected ${ctx.staffId}, got ${result.data.profile.id}`);
        }

        // 断言 profile.role
        if (result.data.profile.role !== exp.profileRole) {
          throw new Error(`profile.role mismatch: expected ${exp.profileRole}, got ${result.data.profile.role}`);
        }

        // 断言 profile.name (如果 expected 有定义)
        if (exp.profileName !== undefined && result.data.profile.name !== exp.profileName) {
          throw new Error(`profile.name mismatch: expected ${exp.profileName}, got ${result.data.profile.name}`);
        }

        console.log(`  ✓ role: ${result.data.role}`);
        console.log(`  ✓ status: ${result.data.status}`);
        console.log(`  ✓ isProfileComplete: ${result.data.isProfileComplete}`);
        console.log(`  ✓ profile.id: ${result.data.profile.id}`);
        console.log(`  ✓ profile.role: ${result.data.profile.role}`);
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
    // 1. 删除 member
    for (const id of ctx.memberIds || []) {
      await db.collection("member").doc(id).delete().catch(() => {});
    }

    // 2. 删除 admin_staff
    for (const id of ctx.adminStaffIds || []) {
      await db.collection("admin_staff").doc(id).delete().catch(() => {});
    }

    // 3. 删除 Auth 用户
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