/**
 * testDeleteFacility.js
 *
 * 本地测试脚本 for deleteFacility Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node testDeleteFacility.js --scenario=delete-normal-facility-success
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
const { v4: uuidv4 } = require("uuid");

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
let scenario = "delete-normal-facility-success";

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
  // ============ Happy paths ============
  "delete-normal-facility-success": {
    description: "Delete normal facility - success",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-normal-facility",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const doc = await db.collection("facility").doc(ctx.facilityId).get();
      const data = doc.data();
      return data && data.status === "deleted" && data.scheduled_change === null;
    },
  },
  "delete-fixing-facility-terminates-repairs": {
    description: "Delete fixing facility - terminates repairs",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-fixing-facility-with-repairs",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const pendingRep = await db.collection("repair").doc("del-rep-pending").get();
      const inProgressRep = await db.collection("repair").doc("del-rep-inprogress").get();
      const resolvedRep = await db.collection("repair").doc("del-rep-resolved").get();
      return (
        pendingRep.data().status === "terminated" &&
        inProgressRep.data().status === "terminated" &&
        resolvedRep.data().status === "resolved"
      );
    },
  },
  "delete-facility-cancels-active-requests": {
    description: "Delete facility - cancels active requests",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-with-requests",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const pending = await db.collection("request").doc("del-req-pending").get();
      const accepted = await db.collection("request").doc("del-req-accepted").get();
      const upcoming = await db.collection("request").doc("del-req-upcoming").get();
      const inProgress = await db.collection("request").doc("del-req-inprogress").get();
      const completed = await db.collection("request").doc("del-req-completed").get();
      return (
        pending.data().status === "cancelled" &&
        accepted.data().status === "cancelled" &&
        upcoming.data().status === "cancelled" &&
        inProgress.data().status === "cancelled" &&
        completed.data().status === "completed" &&
        pending.data().completed_at &&
        accepted.data().completed_at
      );
    },
  },
  "delete-facility-deletes-time-slots": {
    description: "Delete facility - deletes time slots",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-with-time-slots",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const slot1 = await db.collection("time_slot").doc("del-slot-1").get();
      const slot2 = await db.collection("time_slot").doc("del-slot-2").get();
      return !slot1.exists && !slot2.exists;
    },
  },
  "delete-facility-marks-staff-unassigned": {
    description: "Delete facility - marks staff unassigned",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-staff-alone",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      const data = staffDoc.data();
      return data && data.assignment_status === "unassigned";
    },
  },
  "delete-facility-staff-still-assigned": {
    description: "Delete facility - staff still has other facility",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-staff-has-other",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return staffDoc.data().assignment_status !== "unassigned";
    },
  },
  "delete-facility-creates-notifications": {
    description: "Delete facility - creates notifications",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-with-participants",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const notifs = await db.collection("notification")
        .where("reference_id", "in", ["del-req-1", "del-req-2"])
        .get();
      const cancelledNotifs = await db.collection("notification")
        .where("status_context", "==", "cancelled")
        .get();
      return notifs.size >= 2 && cancelledNotifs.size >= 2 &&
        !notifs.docs[0].data().recipient_id;
    },
  },
  // ============ Failure paths ============
  "unauthenticated": {
    description: "Not logged in",
    payload: (ctx) => ({ facility_id: "some-id" }),
    preProcess: null,
    loginType: "none",
    expectedErrorCode: "unauthenticated",
    cleanup: false,
  },
  "not-admin": {
    description: "Login as Staff, not Admin",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-staff-user",
    loginType: "staff",
    expectedErrorCode: "permission-denied",
    cleanup: true,
  },
  "inactive-admin": {
    description: "Login as inactive Admin",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-inactive-admin",
    loginType: "inactive-admin",
    expectedErrorCode: "permission-denied",
    cleanup: true,
  },
  "missing-facility-id": {
    description: "Missing facility_id",
    payload: () => ({}),
    loginType: "admin",
    expectedErrorCode: "invalid-argument",
    cleanup: false,
  },
  "facility-not-found": {
    description: "Facility not found",
    payload: () => ({ facility_id: "non-existent-facility-id" }),
    loginType: "admin",
    expectedErrorCode: "not-found",
    cleanup: false,
  },
  "already-deleted-facility": {
    description: "Facility already deleted",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-already-deleted-facility",
    loginType: "admin",
    expectedErrorCode: "failed-precondition",
    cleanup: true,
  },
  // ============ Edge paths ============
  "no-related-requests": {
    description: "No related requests",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-no-requests",
    cleanup: true,
    expectedSuccess: true,
  },
  "no-related-time-slots": {
    description: "No related time slots",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-no-slots",
    cleanup: true,
    expectedSuccess: true,
  },
  "no-related-repairs": {
    description: "No related repairs",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-no-repairs",
    cleanup: true,
    expectedSuccess: true,
  },
  "staff-doc-missing-does-not-block": {
    description: "Staff doc missing does not block",
    payload: (ctx) => ({ facility_id: ctx.facilityId }),
    preProcess: "create-facility-no-staff",
    cleanup: true,
    expectedSuccess: true,
  },
};

// ============ Pre-process 函数 ============

const preProcesses = {
  "create-normal-facility": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Normal Facility",
      status: "normal",
      staff_id: adminId,
      scheduled_change: null
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility ${facilityId} (admin: ${adminId})`);
  },
  "create-fixing-facility-with-repairs": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Fixing Facility",
      status: "fixing",
      staff_id: adminId
    });

    // Create repairs
    await db.collection("repair").doc("del-rep-pending").set({
      facility_id: facilityId,
      status: "pending",
      repair_description: "Pending repair"
    });
    await db.collection("repair").doc("del-rep-inprogress").set({
      facility_id: facilityId,
      status: "in_progress",
      repair_description: "In progress repair"
    });
    await db.collection("repair").doc("del-rep-resolved").set({
      facility_id: facilityId,
      status: "resolved",
      repair_description: "Resolved repair"
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created fixing facility ${facilityId} with repairs`);
  },
  "create-facility-with-requests": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const memberId = "del-member-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: adminId
    });

    // Create member
    await db.collection("member").doc(memberId).set({
      name: "Test Member",
      status: "active"
    });

    // Create requests
    await db.collection("request").doc("del-req-pending").set({
      facility_id: facilityId,
      member_id: memberId,
      status: "pending",
      date: "2026-05-10",
      start_time: "10",
      end_time: "11"
    });
    await db.collection("request").doc("del-req-accepted").set({
      facility_id: facilityId,
      member_id: memberId,
      status: "accepted",
      date: "2026-05-10",
      start_time: "11",
      end_time: "12"
    });
    await db.collection("request").doc("del-req-upcoming").set({
      facility_id: facilityId,
      member_id: memberId,
      status: "upcoming",
      date: "2026-05-10",
      start_time: "12",
      end_time: "13"
    });
    await db.collection("request").doc("del-req-inprogress").set({
      facility_id: facilityId,
      member_id: memberId,
      status: "in_progress",
      date: "2026-05-10",
      start_time: "13",
      end_time: "14"
    });
    await db.collection("request").doc("del-req-completed").set({
      facility_id: facilityId,
      member_id: memberId,
      status: "completed",
      date: "2026-05-10",
      start_time: "14",
      end_time: "15"
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility ${facilityId} with requests`);
  },
  "create-facility-with-time-slots": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: adminId
    });

    // Create time slots
    await db.collection("time_slot").doc("del-slot-1").set({
      facility_id: facilityId,
      date: "2026-05-10",
      start_time: "10",
      end_time: "11",
      status: "open"
    });
    await db.collection("time_slot").doc("del-slot-2").set({
      facility_id: facilityId,
      date: "2026-05-10",
      start_time: "11",
      end_time: "12",
      status: "locked"
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility ${facilityId} with time slots`);
  },
  "create-facility-staff-alone": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const staffId = "del-staff-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("admin_staff").doc(staffId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: staffId
    });

    ctx.adminId = adminId;
    ctx.staffId = staffId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility ${facilityId} (staff: ${staffId}, no other facility)`);
  },
  "create-facility-staff-has-other": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const staffId = "del-staff-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);
    const otherFacilityId = "del-fac-other-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("admin_staff").doc(staffId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: staffId
    });

    await db.collection("facility").doc(otherFacilityId).set({
      name: "Other Facility",
      status: "normal",
      staff_id: staffId
    });

    ctx.adminId = adminId;
    ctx.staffId = staffId;
    ctx.facilityId = facilityId;
    ctx.otherFacilityId = otherFacilityId;
    console.log(`  ✓ Created facility ${facilityId} (staff: ${staffId}, has other)`);
  },
  "create-facility-with-participants": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const memberId = "del-member-" + uuidv4().slice(0, 8);
    const staffId = "del-staff-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("admin_staff").doc(staffId).set({
      name: "Test Staff",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: staffId
    });

    await db.collection("member").doc(memberId).set({
      name: "Test Member",
      status: "active"
    });

    await db.collection("request").doc("del-req-1").set({
      facility_id: facilityId,
      member_id: memberId,
      participant_ids: ["del-participant-1"],
      user_id_list: ["del-user-1"],
      staff_id: staffId,
      status: "pending",
      date: "2026-05-10",
      start_time: "10",
      end_time: "11"
    });

    await db.collection("request").doc("del-req-2").set({
      facility_id: facilityId,
      member_id: memberId,
      status: "pending",
      date: "2026-05-10",
      start_time: "11",
      end_time: "12"
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility ${facilityId} with participant requests`);
  },
  "create-staff-user": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const staffUserUid = "del-staff-user-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("admin_staff").doc(staffUserUid).set({
      name: "Staff User",
      role: "Staff",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: staffUserUid
    });

    // Create Auth user for Staff
    let staffUser = null;
    try {
      staffUser = await createUserWithEmailAndPassword(auth, "del-staff@test.com", "123456");
    } catch (e) {
      // Ignore if already exists
    }

    ctx.adminId = adminId;
    ctx.staffUserUid = staffUserUid;
    ctx.staffUserEmail = "del-staff@test.com";
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created staff user for permission test`);
  },
  "create-inactive-admin": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const inactiveUid = "del-inactive-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("admin_staff").doc(inactiveUid).set({
      name: "Inactive Admin",
      role: "Admin",
      status: "inactive"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: adminId
    });

    // Create Auth user for inactive admin
    let inactiveUser = null;
    try {
      inactiveUser = await createUserWithEmailAndPassword(auth, "del-inactive@test.com", "123456");
    } catch (e) {
      // Ignore
    }

    ctx.adminId = adminId;
    ctx.inactiveUid = inactiveUid;
    ctx.inactiveUserEmail = "del-inactive@test.com";
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created inactive admin for permission test`);
  },
  "create-already-deleted-facility": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Deleted Facility",
      status: "deleted",
      staff_id: adminId
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created already deleted facility`);
  },
  "create-facility-no-requests": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: adminId
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility without requests`);
  },
  "create-facility-no-slots": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: adminId
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility without time slots`);
  },
  "create-facility-no-repairs": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: adminId
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility without repairs`);
  },
  "create-facility-no-staff": async (ctx) => {
    const adminId = "del-admin-" + uuidv4().slice(0, 8);
    const facilityId = "del-fac-" + uuidv4().slice(0, 8);

    await db.collection("admin_staff").doc(adminId).set({
      name: "Test Admin",
      role: "Admin",
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: "non-existent-staff"
    });

    ctx.adminId = adminId;
    ctx.facilityId = facilityId;
    console.log(`  ✓ Created facility with non-existent staff`);
  },
};

// ============ 主函数 ============

async function main() {
  console.log("");
  console.log("=".repeat(60));
  console.log("deleteFacility Test Script");
  console.log("=".repeat(60));

  const config = scenarios[scenario];
  if (!config) {
    console.error(`Scenario not found: ${scenario}`);
    console.log("Available scenarios:", Object.keys(scenarios).join(", "));
    process.exit(1);
  }

  console.log(`\n=== Running: ${config.description} ===`);

  // ============ 0. 初始化 Admin 用户 ============
  console.log("Initializing Admin user...");

  let adminUid = null;
  let adminUser = null;

  try {
    adminUser = await signInWithEmailAndPassword(auth, "del-admin@test.com", "123456");
    adminUid = adminUser.user.uid;
    console.log(`  ✓ Logged in as del-admin@test.com, UID: ${adminUid}`);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      try {
        adminUser = await createUserWithEmailAndPassword(auth, "del-admin@test.com", "123456");
        adminUid = adminUser.user.uid;
        console.log(`  ✓ Created del-admin@test.com, UID: ${adminUid}`);
      } catch (createError) {
        console.error("ERROR: Failed to create admin user:", createError.message);
        process.exit(1);
      }
    } else {
      console.error("ERROR: Login failed:", error.message);
      process.exit(1);
    }
  }

  // 在 Firestore 创建 admin_staff
  const staffRef = db.collection("admin_staff").doc(adminUid);
  await staffRef.set({
    name: "Test Admin",
    email: "del-admin@test.com",
    role: "Admin",
    status: "active"
  });
  console.log(`  ✓ Created/updated admin_staff/${adminUid}`);

  // ============ 1. Pre-process ============
  const ctx = { adminUid };

  if (config.preProcess) {
    console.log("Running preProcess...");
    const preProcess = preProcesses[config.preProcess];
    if (preProcess) {
      await preProcess(ctx);
    }
  }

  // ============ 2. 处理 loginType ============
  if (config.loginType === "none") {
    console.log("Logging out (unauthenticated test)...");
    await signOut(auth);
    console.log("  ✓ Signed out");
  } else if (config.loginType === "staff" && ctx.staffUserEmail) {
    console.log("Switching to Staff user...");
    await signOut(auth);
    const staffUser = await signInWithEmailAndPassword(auth, ctx.staffUserEmail, "123456");
    console.log(`  ✓ Logged in as: ${staffUser.user.email}`);
  } else if (config.loginType === "inactive-admin" && ctx.inactiveUserEmail) {
    console.log("Switching to inactive Admin user...");
    await signOut(auth);
    const inactiveUser = await signInWithEmailAndPassword(auth, ctx.inactiveUserEmail, "123456");
    console.log(`  ✓ Logged in as: ${inactiveUser.user.email}`);
  } else if (!config.loginType || config.loginType === "admin") {
    // Re-login as admin
    console.log("Re-logging in as admin...");
    await signOut(auth);
    await signInWithEmailAndPassword(auth, "del-admin@test.com", "123456");
    console.log(`  ✓ Logged in as: del-admin@test.com`);
  }

  // ============ 3. ��建 payload ============
  const payload = config.payload ? config.payload(ctx) : {};
  console.log("");
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("");

  // ============ 4. 调用 deleteFacility ============
  console.log("Calling deleteFacility...");

  const deleteFacility = httpsCallable(functions, "deleteFacility");
  let result = null;
  let error = null;

  try {
    result = await deleteFacility(payload);
    console.log("  ✓ Function returned");
  } catch (err) {
    error = err;
    console.log(`  ✗ Function threw: ${err.message}`);
  }

  // ============ 5. 验证结果 ============
  console.log("");
  console.log("=".repeat(60));
  console.log("Verification:");
  console.log("=".repeat(60));

  let passed = false;

  if (config.expectedErrorCode) {
    // 期望失败
    if (error) {
      const errorCode = normalizeErrorCode(error.code);
      if (errorCode === config.expectedErrorCode) {
        console.log(`✓ Expected error: ${errorCode}`);
        console.log(`  Message: ${error.message}`);
        passed = true;
      } else {
        console.log(`✗ Wrong error code: expected ${config.expectedErrorCode}, got ${errorCode}`);
      }
    } else {
      console.log(`✗ Expected error ${config.expectedErrorCode}, but function succeeded`);
    }
  } else if (config.expectedSuccess) {
    // 期望成功
    if (error) {
      console.log(`✗ Unexpected error: ${error.message}`);
    } else if (result && result.data && result.data.success) {
      console.log("✓ Function returned success: true");

      if (config.verifyDatabase) {
        const verifyResult = await config.verifyDatabase(ctx);
        if (verifyResult) {
          console.log("✓ Database verification passed");
          passed = true;
        } else {
          console.log("✗ Database verification failed");
        }
      } else {
        passed = true;
      }

      if (result.data.stats) {
        console.log("  Stats:", JSON.stringify(result.data.stats, null, 2));
      }
    } else {
      console.log("✗ Function did not return success");
    }
  }

  // ============ 6. Cleanup ============
  if (config.cleanup && ctx.facilityId) {
    console.log("");
    console.log("Cleaning up...");

    try {
      // Delete facility
      const facSnap = await db.collection("facility")
        .where("__name__", ">=", "del-fac-")
        .where("__name__", "<", "del-faz-")
        .get();
      for (const doc of facSnap.docs) {
        await doc.ref.delete();
      }

      // Delete requests
      const reqSnap = await db.collection("request")
        .where("__name__", ">=", "del-req-")
        .where("__name__", "<", "del-reS-")
        .get();
      for (const doc of reqSnap.docs) {
        await doc.ref.delete();
      }

      // Delete repairs
      const repSnap = await db.collection("repair")
        .where("__name__", ">=", "del-rep-")
        .where("__name__", "<", "del-reQ-")
        .get();
      for (const doc of repSnap.docs) {
        await doc.ref.delete();
      }

      // Delete time slots
      const slotSnap = await db.collection("time_slot")
        .where("__name__", ">=", "del-slot-")
        .where("__name__", "<", "del-sloU-")
        .get();
      for (const doc of slotSnap.docs) {
        await doc.ref.delete();
      }

      // Delete notifications
      const notifSnap = await db.collection("notification")
        .where("reference_id", "in", ["del-req-1", "del-req-2"])
        .get();
      for (const doc of notifSnap.docs) {
        await doc.ref.delete();
      }

      // Delete admin_staff
      if (ctx.adminId) {
        await db.collection("admin_staff").doc(ctx.adminId).delete();
      }
      if (ctx.staffId) {
        await db.collection("admin_staff").doc(ctx.staffId).delete();
      }
      if (ctx.staffUserUid) {
        await db.collection("admin_staff").doc(ctx.staffUserUid).delete();
      }
      if (ctx.inactiveUid) {
        await db.collection("admin_staff").doc(ctx.inactiveUid).delete();
      }

      // Cleanup other facility if exists
      if (ctx.otherFacilityId) {
        await db.collection("facility").doc(ctx.otherFacilityId).delete();
      }

      console.log("  ✓ Cleanup done");
    } catch (cleanupError) {
      console.log(`  ✗ Cleanup error: ${cleanupError.message}`);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  if (passed) {
    console.log("TEST PASSED");
  } else {
    console.log("TEST FAILED");
    process.exit(1);
  }
  console.log("=".repeat(60));
}

// ============ 运行 ============

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});