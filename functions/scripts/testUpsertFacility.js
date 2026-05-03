/**
 * testUpsertFacility.js
 *
 * 本地测试脚本 for upsertFacility Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node testUpsertFacility.js --scenario=create-success
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
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } = require("firebase/auth");
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
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

console.log("  ✓ Firebase Client SDK initialized");
console.log("  ✓ Connected to Auth Emulator: http://127.0.0.1:9099");
console.log("  ✓ Connected to Functions Emulator: http://127.0.0.1:5001");

// ============ Firebase Admin SDK 初始化 ============

admin.initializeApp({
  projectId: "learnfire-e5720"
});

const db = admin.firestore();

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
let scenario = "create-success";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// ============ 工具函数 ============

function normalizeErrorCode(code) {
  if (code && code.startsWith("functions/")) {
    return code.replace("functions/", "");
  }
  return code;
}

// ============ Scenario 配置 ============

const scenarios = {
  "create-success": {
    description: "Create new facility - success",
    payload: {
      name: "Test Facility",
      sport_type: "Badminton",
      description: "Test description",
      usage_guidelines: "Test guidelines",
      capacity: 4,
      location: "Test location",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    preProcess: null,
    expectedSuccess: true,
    verifyDatabase: async (facilityId) => {
      const doc = await db.collection("facility").doc(facilityId).get();
      const data = doc.data();
      return (
        data &&
        data.name === "Test Facility" &&
        data.sport_type === "Badminton" &&
        data.capacity === 4 &&
        data.status === "normal" &&
        data.scheduled_change === null
      );
    },
  },
  "edit-basic-success": {
    description: "Edit basic fields - success",
    payload: {
      facility_id: "facility-test-001",
      name: "Updated Name",
      sport_type: "SHOULD_BE_IGNORED",
      description: "Updated description",
      usage_guidelines: "Updated guidelines",
      capacity: 999,
      location: "Updated location",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    preProcess: "create-facility",
    expectedSuccess: true,
    expectedFacilityId: "facility-test-001",
    verifyDatabase: async () => {
      const doc = await db.collection("facility").doc("facility-test-001").get();
      const data = doc.data();
      return (
        data.name === "Updated Name" &&
        data.sport_type === "Badminton" && // 原值保持
        data.capacity === 4 && // 原值保持
        data.description === "Updated description"
      );
    },
  },
  "edit-hours-scheduled-change": {
    description: "Edit hours - scheduled_change created",
    payload: {
      facility_id: "facility-test-002",
      name: "Original Name",
      sport_type: "Badminton",
      description: "Original description",
      usage_guidelines: "Original guidelines",
      capacity: 4,
      location: "Original location",
      start_time: 9,
      end_time: 20,
      staff_id: "staff-001",
    },
    preProcess: "create-facility-hours",
    expectedSuccess: true,
    expectedFacilityId: "facility-test-002",
    verifyDatabase: async () => {
      const doc = await db.collection("facility").doc("facility-test-002").get();
      const data = doc.data();
      return (
        data.start_time === 9 &&
        data.end_time === 18 &&
        data.scheduled_change &&
        data.scheduled_change.type === "update" &&
        data.scheduled_change.payload.start_time === 9 &&
        data.scheduled_change.payload.end_time === 20
      );
    },
  },
  "edit-staff-sync": {
    description: "Edit staff - sync pending/accepted requests",
    payload: {
      facility_id: "facility-test-003",
      name: "Test Facility",
      sport_type: "Badminton",
      description: "Test description",
      usage_guidelines: "Test guidelines",
      capacity: 4,
      location: "Test location",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-002",
    },
    preProcess: "create-facility-with-requests",
    expectedSuccess: true,
    expectedFacilityId: "facility-test-003",
    verifyDatabase: async () => {
      const facilityDoc = await db.collection("facility").doc("facility-test-003").get();
      const request1Doc = await db.collection("request").doc("request-001").get();
      const request2Doc = await db.collection("request").doc("request-002").get();
      return (
        facilityDoc.data().staff_id === "staff-002" &&
        request1Doc.data().staff_id === "staff-002" &&
        request2Doc.data().staff_id === "staff-002"
      );
    },
  },
  // Failure Paths
  "missing-required-field": {
    description: "Missing required field",
    payload: {
      name: "Test",
    },
    expectedErrorCode: "invalid-argument",
  },
  "invalid-capacity": {
    description: "Invalid capacity (out of range)",
    payload: {
      name: "Test",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 999,
      location: "Test",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    expectedErrorCode: "invalid-argument",
  },
  "invalid-hours": {
    description: "Invalid opening hours",
    payload: {
      name: "Test",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 22,
      end_time: 9,
      staff_id: "staff-001",
    },
    expectedErrorCode: "invalid-argument",
  },
  "invalid-staff": {
    description: "Invalid staff (not found)",
    payload: {
      name: "Test",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-not-exist",
    },
    expectedErrorCode: "not-found",
  },
  "facility-not-found": {
    description: "Facility not found",
    payload: {
      facility_id: "facility-not-exist",
      name: "Test",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    expectedErrorCode: "not-found",
  },
  "edit-deleted-facility": {
    description: "Edit deleted facility",
    payload: {
      facility_id: "facility-deleted",
      name: "Updated",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    preProcess: "create-deleted-facility",
    expectedErrorCode: "failed-precondition",
  },
  // ============ 权限类 scenarios ============
  "unauthenticated": {
    description: "Not logged in",
    payload: {
      name: "Test Facility",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    preProcess: null,
    expectedErrorCode: "unauthenticated",
    loginType: "none",
  },
  "not-admin": {
    description: "Login as Staff, not Admin",
    payload: {
      name: "Test Facility",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    preProcess: "create-staff-user",
    expectedErrorCode: "permission-denied",
    loginType: "staff",
  },
  "inactive-admin": {
    description: "Login as inactive Admin",
    payload: {
      name: "Test Facility",
      sport_type: "Badminton",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 22,
      staff_id: "staff-001",
    },
    preProcess: "create-inactive-admin",
    expectedErrorCode: "permission-denied",
    loginType: "inactive-admin",
  },
};

// ============ 主测试逻辑 ============

async function runScenario() {
  const config = scenarios[scenario];
  if (!config) {
    console.error(`Scenario not found: ${scenario}`);
    console.log("Available scenarios:", Object.keys(scenarios).join(", "));
    process.exit(1);
  }

  console.log(`\n=== Running: ${config.description} ===`);

  // ============ 0. 初始化 Admin 用户 ============
  // 确保 admin_staff/{uid} 存在，role 为 Admin
  console.log("Initializing Admin user...");

  let adminUid = null;
  let adminUser = null;

  try {
    adminUser = await signInWithEmailAndPassword(auth, "admin@test.com", "123456");
    adminUid = adminUser.user.uid;
    console.log(`  ✓ Logged in as admin@test.com, UID: ${adminUid}`);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      try {
        adminUser = await createUserWithEmailAndPassword(auth, "admin@test.com", "123456");
        adminUid = adminUser.user.uid;
        console.log(`  ✓ Created admin@test.com, UID: ${adminUid}`);
      } catch (createError) {
        console.error("ERROR: Failed to create admin@test.com:", createError.message);
        process.exit(1);
      }
    } else {
      console.error("ERROR: Login failed:", error.message);
      process.exit(1);
    }
  }

  // 在 Firestore 创建/更新 admin_staff
  const staffRef = db.collection("admin_staff").doc(adminUid);
  await staffRef.set({
    name: "Admin User",
    email: "admin@test.com",
    role: "Admin",
    status: "active",
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`  ✓ Created/updated admin_staff/${adminUid}`);

  // ============ 初始化权限测试用户 ============
  // 创建 Staff 用户（用于 not-admin 测试）
  let staffUserUid = null;
  try {
    const staffUser = await signInWithEmailAndPassword(auth, "staff-user@test.com", "123456");
    staffUserUid = staffUser.user.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      try {
        const newStaffUser = await createUserWithEmailAndPassword(auth, "staff-user@test.com", "123456");
        staffUserUid = newStaffUser.user.uid;
      } catch (createError) {
        // 忽略创建失败
      }
    }
  }

  // 创建 Inactive Admin（用于 inactive-admin 测试）
  let inactiveAdminUid = null;
  try {
    const inactiveUser = await signInWithEmailAndPassword(auth, "inactive-admin@test.com", "123456");
    inactiveAdminUid = inactiveUser.user.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      try {
        const newInactiveUser = await createUserWithEmailAndPassword(auth, "inactive-admin@test.com", "123456");
        inactiveAdminUid = newInactiveUser.user.uid;
      } catch (createError) {
        // 忽略创建失败
      }
    }
  }

  if (staffUserUid) {
    await db.collection("admin_staff").doc(staffUserUid).set({
      name: "Staff User",
      email: "staff-user@test.com",
      role: "Staff",
      status: "active",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Created/updated admin_staff/${staffUserUid} (role: Staff)`);
  }

  if (inactiveAdminUid) {
    await db.collection("admin_staff").doc(inactiveAdminUid).set({
      name: "Inactive Admin",
      email: "inactive-admin@test.com",
      role: "Admin",
      status: "inactive",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Created/updated admin_staff/${inactiveAdminUid} (status: inactive)`);
  }

  // ============ 清理之前的测试数据 ============
  console.log("Cleaning previous test data...");

  // 清理 facility
  const facilityDocs = await db.collection("facility").get();
  const batch1 = db.batch();
  facilityDocs.forEach((doc) => batch1.delete(doc.ref));
  await batch1.commit();

  // 清理 admin_staff 测试账号（除了当前 adminUid）
  const allStaffDocs = await db.collection("admin_staff").get();
  const batch2 = db.batch();
  allStaffDocs.forEach((doc) => {
    if (doc.id !== adminUid && (doc.id.startsWith("staff-") || doc.id.startsWith("admin-"))) {
      batch2.delete(doc.ref);
    }
  });
  await batch2.commit();

  // ============ Pre-process ============
  if (config.preProcess) {
    console.log("Running preProcess...");

    if (config.preProcess === "create-facility") {
      // 创建 Staff
      await db.collection("admin_staff").doc("staff-001").set({
        name: "Staff User 1",
        email: "staff1@test.com",
        role: "Staff",
        status: "active",
      });
      // 创建 Facility
      await db.collection("facility").doc("facility-test-001").set({
        name: "Original Name",
        sport_type: "Badminton",
        description: "Original description",
        usage_guidelines: "Original guidelines",
        capacity: 4,
        location: "Original location",
        start_time: 9,
        end_time: 22,
        staff_id: "staff-001",
        status: "normal",
        scheduled_change: null,
      });
      console.log("  ✓ Created facility-test-001");
    } else if (config.preProcess === "create-facility-hours") {
      await db.collection("admin_staff").doc("staff-001").set({
        name: "Staff User 1",
        email: "staff1@test.com",
        role: "Staff",
        status: "active",
      });
      await db.collection("facility").doc("facility-test-002").set({
        name: "Original Name",
        sport_type: "Badminton",
        description: "Original description",
        usage_guidelines: "Original guidelines",
        capacity: 4,
        location: "Original location",
        start_time: 9,
        end_time: 18,
        staff_id: "staff-001",
        status: "normal",
        scheduled_change: null,
      });
      console.log("  ✓ Created facility-test-002");
    } else if (config.preProcess === "create-facility-with-requests") {
      await db.collection("admin_staff").doc("staff-001").set({
        name: "Staff User 1",
        email: "staff1@test.com",
        role: "Staff",
        status: "active",
      });
      await db.collection("admin_staff").doc("staff-002").set({
        name: "Staff User 2",
        email: "staff2@test.com",
        role: "Staff",
        status: "active",
      });
      await db.collection("facility").doc("facility-test-003").set({
        name: "Test Facility",
        sport_type: "Badminton",
        description: "Test description",
        usage_guidelines: "Test guidelines",
        capacity: 4,
        location: "Test location",
        start_time: 9,
        end_time: 22,
        staff_id: "staff-001",
        status: "normal",
        scheduled_change: null,
      });
      // 创建 pending request
      await db.collection("request").doc("request-001").set({
        facility_id: "facility-test-003",
        member_id: "member-001",
        staff_id: "staff-001",
        status: "pending",
        date: "2026-05-04",
        start_time: "10",
        end_time: "11",
      });
      // 创建 accepted request
      await db.collection("request").doc("request-002").set({
        facility_id: "facility-test-003",
        member_id: "member-002",
        staff_id: "staff-001",
        status: "accepted",
        date: "2026-05-04",
        start_time: "14",
        end_time: "15",
      });
      console.log("  ✓ Created facility-test-003 with requests");
    } else if (config.preProcess === "create-deleted-facility") {
      await db.collection("admin_staff").doc("staff-001").set({
        name: "Staff User 1",
        email: "staff1@test.com",
        role: "Staff",
        status: "active",
      });
      await db.collection("facility").doc("facility-deleted").set({
        name: "Deleted Facility",
        sport_type: "Badminton",
        description: "Test",
        usage_guidelines: "Test",
        capacity: 4,
        location: "Test",
        start_time: 9,
        end_time: 22,
        staff_id: "staff-001",
        status: "deleted",
      });
      console.log("  ✓ Created facility-deleted");
    } else if (config.preProcess === "create-staff-user") {
      // 创建 Staff 用户（Firestore role = Staff，不是 Admin）
      await db.collection("admin_staff").doc("staff-user").set({
        name: "Staff User",
        email: "staff-user@test.com",
        role: "Staff",
        status: "active",
      });
      console.log("  ✓ Created admin_staff/staff-user (role: Staff)");
    } else if (config.preProcess === "create-inactive-admin") {
      // 创建 Inactive Admin
      await db.collection("admin_staff").doc("inactive-admin").set({
        name: "Inactive Admin",
        email: "inactive-admin@test.com",
        role: "Admin",
        status: "inactive",
      });
      console.log("  ✓ Created admin_staff/inactive-admin (status: inactive)");
    }
  }

  // 如果是 create-success 场景，也需要创建 staff
  if (scenario === "create-success") {
    await db.collection("admin_staff").doc("staff-001").set({
      name: "Staff User 1",
      email: "staff1@test.com",
      role: "Staff",
      status: "active",
    });
    console.log("  ✓ Created staff-001");
  }

  // 重新登录 Admin（确保 token 有效）
  console.log("Re-logging in as admin...");
  await signOut(auth);
  const reLoginUser = await signInWithEmailAndPassword(auth, "admin@test.com", "123456");
  console.log(`  ✓ Logged in as: ${reLoginUser.user.email}`);
  console.log(`  ✓ UID: ${reLoginUser.user.uid}`);

  // 验证 currentUser
  console.log("");
  console.log("  auth.currentUser:", auth.currentUser?.email);
  console.log("  auth.currentUser UID:", auth.currentUser?.uid);
  console.log("  idToken:", auth.currentUser ? "exists" : "missing");

  // ============ 处理 loginType ============
  if (config.loginType === "none") {
    console.log("Logging out (unauthenticated test)...");
    await signOut(auth);
    console.log("  ✓ Signed out");
    console.log("  auth.currentUser:", auth.currentUser?.email || "null");
  } else if (config.loginType === "staff") {
    console.log("Switching to Staff user...");
    await signOut(auth);
    const staffUser = await signInWithEmailAndPassword(auth, "staff-user@test.com", "123456");
    console.log(`  ✓ Logged in as: ${staffUser.user.email}`);
    console.log(`  ✓ UID: ${staffUser.user.uid}`);
  } else if (config.loginType === "inactive-admin") {
    console.log("Switching to inactive Admin user...");
    await signOut(auth);
    const inactiveUser = await signInWithEmailAndPassword(auth, "inactive-admin@test.com", "123456");
    console.log(`  ✓ Logged in as: ${inactiveUser.user.email}`);
    console.log(`  ✓ UID: ${inactiveUser.user.uid}`);
  }

  // 构建 payload
  const payload = { ...config.payload };
  console.log("");
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("");

  // ============ 调用 upsertFacility ============
  console.log("Calling upsertFacility...");

  const upsertFacility = httpsCallable(functions, "upsertFacility");

  try {
    const result = await upsertFacility(payload);

    // ============ 验证成功结果 ============
    if (config.expectedSuccess === true) {
      console.log("");
      console.log("=".repeat(60));
      console.log("Function Result:");
      console.log("=".repeat(60));
      console.log(JSON.stringify(result.data, null, 2));

      // 验证数据库
      if (config.verifyDatabase) {
        console.log("");
        console.log("Verifying results with Admin SDK...");
        const facilityId = config.expectedFacilityId || result.data.facility_id;
        const verified = await config.verifyDatabase(facilityId);
        if (!verified) {
          console.error("FAIL: Database verification failed");
          process.exit(1);
        }
        console.log("Database verification passed");
      }

      console.log(`\n=== PASSED: ${config.description} ===`);
    } else {
      console.error("FAIL: Expected error but got success");
      console.error("Result:", result.data);
      process.exit(1);
    }
  } catch (error) {
    // 预期错误
    if (config.expectedErrorCode) {
      const actualCode = normalizeErrorCode(error.code);
      const message = error.message || error.details;

      if (actualCode === config.expectedErrorCode || message?.includes(config.expectedErrorCode)) {
        console.log(`\n=== PASSED: ${config.description} ===`);
        console.log(`Error (expected): ${message || actualCode}`);
        return;
      }
    }

    console.error("FAIL:", error.message || error);
    console.error("Code:", error.code);
    process.exit(1);
  }
}

// ============ 入口 ============

runScenario()
  .then(() => {
    console.log("\nTest complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });