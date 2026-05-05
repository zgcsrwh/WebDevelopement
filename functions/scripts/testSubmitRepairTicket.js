/**
 * testSubmitRepairTicket.js
 *
 * 本地测试脚本 for submitRepairTicket Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testSubmitRepairTicket.js --scenario=submit-success-normal-facility
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
let scenario = "submit-success-normal-facility";

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
  "submit-success-normal-facility": {
    description: "Submit repair on normal facility - success",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test repair", type: "lighting" }),
    preProcess: "create-member-and-normal-facility",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const repairDoc = await db.collection("repair").doc(ctx.repairId).get();
      const facilityDoc = await db.collection("facility").doc(ctx.facilityId).get();
      return (
        repairDoc.exists &&
        repairDoc.data().status === "pending" &&
        repairDoc.data().member_id === ctx.memberId &&
        repairDoc.data().facility_id === ctx.facilityId &&
        repairDoc.data().completed_at === "" &&
        facilityDoc.data().status === "fixing"
      );
    },
  },
  "submit-success-fixing-facility": {
    description: "Submit repair on fixing facility - success",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test repair 2", type: "plumbing" }),
    preProcess: "create-member-and-fixing-facility",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const facilityDoc = await db.collection("facility").doc(ctx.facilityId).get();
      const repairCount = await db.collection("repair")
        .where("facility_id", "==", ctx.facilityId)
        .get();
      return (
        facilityDoc.data().status === "fixing" &&
        repairCount.size >= 2
      );
    },
  },
  "cancels-active-requests": {
    description: "Cancel active requests when facility enters fixing",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test repair", type: "lighting" }),
    preProcess: "create-member-facility-with-requests",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const pending = await db.collection("request").doc(ctx.requestIds[0]).get();
      const accepted = await db.collection("request").doc(ctx.requestIds[1]).get();
      const upcoming = await db.collection("request").doc(ctx.requestIds[2]).get();
      const inProgress = await db.collection("request").doc(ctx.requestIds[3]).get();
      const completed = await db.collection("request").doc(ctx.requestIds[4]).get();
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
  "keeps-terminal-requests": {
    description: "Keep terminal requests unchanged",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test repair", type: "lighting" }),
    preProcess: "create-member-facility-with-terminal-requests",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const completed = await db.collection("request").doc(ctx.requestIds[0]).get();
      const noShow = await db.collection("request").doc(ctx.requestIds[1]).get();
      const rejected = await db.collection("request").doc(ctx.requestIds[2]).get();
      const suggested = await db.collection("request").doc(ctx.requestIds[3]).get();
      const cancelled = await db.collection("request").doc(ctx.requestIds[4]).get();
      return (
        completed.data().status === "completed" &&
        noShow.data().status === "no_show" &&
        rejected.data().status === "rejected" &&
        suggested.data().status === "suggested" &&
        cancelled.data().status === "cancelled"
      );
    },
  },
  "releases-linked-time-slots-by-request-id": {
    description: "Release locked time_slot by request_id",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test repair", type: "lighting" }),
    preProcess: "create-member-facility-with-locked-slot",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const slotDoc = await db.collection("time_slot").doc(ctx.timeSlotIds[0]).get();
      return (
        slotDoc.data().status === "open" &&
        slotDoc.data().request_id === ""
      );
    },
  },
  "does-not-release-unrelated-locked-slot": {
    description: "Do not release unrelated locked slot",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test repair", type: "lighting" }),
    preProcess: "create-member-facility-with-unrelated-locked-slot",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const relatedSlot = await db.collection("time_slot").doc(ctx.timeSlotIds[0]).get();
      const unrelatedSlot = await db.collection("time_slot").doc(ctx.timeSlotIds[1]).get();
      const terminalRequest = await db.collection("request").doc(ctx.terminalRequestId).get();
      return (
        // active request 的 slot 应被释放
        relatedSlot.data().status === "open" &&
        relatedSlot.data().request_id === "" &&
        // terminal request 的 slot 应保持 locked
        unrelatedSlot.data().status === "locked" &&
        unrelatedSlot.data().request_id === ctx.terminalRequestId &&
        // terminal request status 保持不变
        terminalRequest.data().status === "completed"
      );
    },
  },
  "creates-maintenance-cancelled-notifications": {
    description: "Create maintenance_cancelled notifications",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test repair", type: "lighting" }),
    preProcess: "create-member-facility-with-participants",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const notifSnap = await db.collection("notification")
        .where("reference_id", "==", ctx.requestIds[0])
        .get();
      if (notifSnap.size === 0) {
        console.log("  ✗ No notifications found");
        return false;
      }
      // 验证去重后数量
      const members = new Set([ctx.memberId, ...ctx.memberIds.filter(id => id !== ctx.memberId)]);
      members.add(ctx.staffId);
      const expectedCount = members.size;
      if (notifSnap.size !== expectedCount) {
        console.log(`  Expected ${expectedCount} notifications, got ${notifSnap.size}`);
        return false;
      }
      // 验证每个 notification
      for (const doc of notifSnap.docs) {
        const notif = doc.data();
        if (notif.type !== "facility_request") return false;
        if (notif.status_context !== "maintenance_cancelled") return false;
        if (!notif.member_id) return false;
        if (notif.recipient_id) return false; // 不应包含 recipient_id
        if (!notif.created_at) return false;
        if (notif.reference_id !== ctx.requestIds[0]) return false;
      }
      return true;
    },
  },

  // ============ Failure paths ============
  "unauthenticated": {
    description: "Unauthenticated - should fail",
    payload: (ctx) => ({ facility_id: "fake-id", repair_description: "Test", type: "lighting" }),
    preProcess: null,
    cleanup: false,
    expectedError: "unauthenticated",
  },
  "inactive-member": {
    description: "Inactive member - should fail",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test", type: "lighting" }),
    preProcess: "create-inactive-member-and-facility",
    cleanup: true,
    expectedError: "permission-denied",
  },
  "not-member": {
    description: "Not a member - should fail",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test", type: "lighting" }),
    preProcess: "create-no-member",
    cleanup: true,
    expectedError: "permission-denied",
  },
  "missing-facility-id": {
    description: "Missing facility_id - should fail",
    payload: (ctx) => ({ facility_id: "", repair_description: "Test", type: "lighting" }),
    preProcess: "create-member-and-normal-facility",
    cleanup: true,
    expectedError: "invalid-argument",
  },
  "missing-repair-description": {
    description: "Missing repair_description - should fail",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "", type: "lighting" }),
    preProcess: "create-member-and-normal-facility",
    cleanup: true,
    expectedError: "invalid-argument",
  },
  "description-too-long": {
    description: "Description too long - should fail",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "a".repeat(501), type: "lighting" }),
    preProcess: "create-member-and-normal-facility",
    cleanup: true,
    expectedError: "invalid-argument",
  },
  "missing-type": {
    description: "Missing type - should fail",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test", type: "" }),
    preProcess: "create-member-and-normal-facility",
    cleanup: true,
    expectedError: "invalid-argument",
  },
  "facility-not-found": {
    description: "Facility not found - should fail",
    payload: (ctx) => ({ facility_id: "non-existent-id", repair_description: "Test", type: "lighting" }),
    preProcess: "create-member-and-normal-facility",
    cleanup: true,
    expectedError: "not-found",
  },
  "deleted-facility": {
    description: "Deleted facility - should fail",
    payload: (ctx) => ({ facility_id: ctx.facilityId, repair_description: "Test", type: "lighting" }),
    preProcess: "create-member-and-deleted-facility",
    cleanup: true,
    expectedError: "failed-precondition",
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-member-and-normal-facility": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active",
      cancel_times: 0
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Normal Facility",
      status: "normal",
      staff_id: "staff_test",
      start_time: 9,
      end_time: 11
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [];
    ctx.timeSlotIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${memberId} (auth: ${userId})`);
    console.log(`  ✓ Created facility ${facilityId}`);
  },

  "create-member-and-fixing-facility": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;
    const existingRepairId = "srt-repair-" + uuidv4().slice(0, 8);

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Fixing Facility",
      status: "fixing",
      staff_id: "staff_test",
      start_time: 9,
      end_time: 11
    });

    // 创建已有 pending repair
    await db.collection("repair").doc(existingRepairId).set({
      member_id: userId,
      facility_id: facilityId,
      staff_id: "staff_test",
      type: "lighting",
      repair_description: "Existing repair",
      status: "pending",
      completed_at: "",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [];
    ctx.timeSlotIds = [];
    ctx.repairIds = [existingRepairId];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
  },

  "create-member-facility-with-requests": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;
    const requestId1 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId2 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId3 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId4 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId5 = "srt-req-" + uuidv4().slice(0, 8);
    const slotId = "srt-slot-" + uuidv4().slice(0, 8);

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active",
      cancel_times: 3
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: "staff_test",
      start_time: 9,
      end_time: 11
    });

    await db.collection("time_slot").doc(slotId).set({
      facility_id: facilityId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "locked",
      request_id: requestId1,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId1).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "pending",
      participant_ids: [],
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId2).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-11",
      start_time: "10",
      end_time: "11",
      status: "accepted",
      participant_ids: [],
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId3).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-12",
      start_time: "11",
      end_time: "12",
      status: "upcoming",
      participant_ids: [],
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId4).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-13",
      start_time: "14",
      end_time: "15",
      status: "in_progress",
      participant_ids: [],
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId5).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-13",
      start_time: "15",
      end_time: "16",
      status: "completed",
      participant_ids: [],
      created_at: FieldValue.serverTimestamp(),
      completed_at: FieldValue.serverTimestamp()
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [requestId1, requestId2, requestId3, requestId4, requestId5];
    ctx.timeSlotIds = [slotId];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
  },

  "create-member-facility-with-terminal-requests": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;
    const requestId1 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId2 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId3 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId4 = "srt-req-" + uuidv4().slice(0, 8);
    const requestId5 = "srt-req-" + uuidv4().slice(0, 8);

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: "staff_test"
    });

    await db.collection("request").doc(requestId1).set({
      facility_id: facilityId,
      member_id: userId,
      status: "completed",
      created_at: FieldValue.serverTimestamp(),
      completed_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId2).set({
      facility_id: facilityId,
      member_id: userId,
      status: "no_show",
      created_at: FieldValue.serverTimestamp(),
      completed_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId3).set({
      facility_id: facilityId,
      member_id: userId,
      status: "rejected",
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId4).set({
      facility_id: facilityId,
      member_id: userId,
      status: "suggested",
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("request").doc(requestId5).set({
      facility_id: facilityId,
      member_id: userId,
      status: "cancelled",
      created_at: FieldValue.serverTimestamp(),
      completed_at: FieldValue.serverTimestamp()
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [requestId1, requestId2, requestId3, requestId4, requestId5];
    ctx.timeSlotIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
  },

  "create-member-facility-with-locked-slot": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;
    const requestId = "srt-req-" + uuidv4().slice(0, 8);
    const slotId = `${facilityId}-2026-05-10-09`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: "staff_test",
      start_time: 9,
      end_time: 11
    });

    await db.collection("request").doc(requestId).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "accepted",
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("time_slot").doc(slotId).set({
      facility_id: facilityId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "locked",
      request_id: requestId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [requestId];
    ctx.timeSlotIds = [slotId];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
  },

  "create-member-facility-with-unrelated-locked-slot": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;
    const requestId1 = "srt-req-" + uuidv4().slice(0, 8);
    const terminalRequestId = "srt-req-" + uuidv4().slice(0, 8);
    const slotId1 = `${facilityId}-2026-05-10-09`;
    const slotId2 = `${facilityId}-2026-05-10-10`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: "staff_test",
      start_time: 9,
      end_time: 12
    });

    // active request: 应被取消，slot 应释放
    await db.collection("request").doc(requestId1).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "accepted",
      created_at: FieldValue.serverTimestamp()
    });

    // terminal request: 不应被取消，slot 不应释放
    await db.collection("request").doc(terminalRequestId).set({
      facility_id: facilityId,
      member_id: userId,
      date: "2026-05-10",
      start_time: "10",
      end_time: "11",
      status: "completed",
      created_at: FieldValue.serverTimestamp(),
      completed_at: FieldValue.serverTimestamp()
    });

    // active request 的 slot: 应被释放
    await db.collection("time_slot").doc(slotId1).set({
      facility_id: facilityId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "locked",
      request_id: requestId1,
      created_at: FieldValue.serverTimestamp()
    });

    // terminal request 的 slot: 不应释放
    await db.collection("time_slot").doc(slotId2).set({
      facility_id: facilityId,
      date: "2026-05-10",
      start_time: "10",
      end_time: "11",
      status: "locked",
      request_id: terminalRequestId,
      created_at: FieldValue.serverTimestamp()
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [requestId1, terminalRequestId];
    ctx.timeSlotIds = [slotId1, slotId2];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
    ctx.terminalRequestId = terminalRequestId;
  },

  "create-member-facility-with-participants": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;
    const participantId1 = "srt-member-" + uuidv4().slice(0, 8);
    const participantId2 = "srt-member-" + uuidv4().slice(0, 8);
    const staffId = "srt-staff-" + uuidv4().slice(0, 8);
    const requestId = "srt-req-" + uuidv4().slice(0, 8);
    const slotId = `${facilityId}-2026-05-10-09`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active"
    });

    await db.collection("member").doc(participantId1).set({
      name: "Friend 1",
      email: "friend1@example.com",
      status: "active"
    });

    await db.collection("member").doc(participantId2).set({
      name: "Friend 2",
      email: "friend2@example.com",
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
      staff_id: staffId,
      start_time: 9,
      end_time: 11
    });

    await db.collection("request").doc(requestId).set({
      facility_id: facilityId,
      member_id: userId,
      participant_ids: [participantId1, participantId2],
      user_id_list: [participantId1],
      staff_id: staffId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "pending",
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection("time_slot").doc(slotId).set({
      facility_id: facilityId,
      date: "2026-05-10",
      start_time: "09",
      end_time: "10",
      status: "locked",
      request_id: requestId,
      created_at: FieldValue.serverTimestamp()
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.staffId = staffId;
    ctx.memberIds = [userId, participantId1, participantId2];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [requestId];
    ctx.timeSlotIds = [slotId];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
  },

  "create-inactive-member-and-facility": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Inactive Member",
      email: email,
      status: "inactive"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: "staff_test"
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [];
    ctx.timeSlotIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
  },

  "create-no-member": async (ctx) => {
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility",
      status: "normal",
      staff_id: "staff_test"
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [];
    ctx.timeSlotIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.authUsers = [email];
  },

  "create-member-and-deleted-facility": async (ctx) => {
    const memberId = "srt-member-" + uuidv4().slice(0, 8);
    const facilityId = "srt-fac-" + uuidv4().slice(0, 8);
    const email = `test-${uuidv4()}@example.com`;

    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const userId = auth.currentUser.uid;

    await db.collection("member").doc(userId).set({
      name: "Test Member",
      email: email,
      status: "active"
    });

    await db.collection("facility").doc(facilityId).set({
      name: "Deleted Facility",
      status: "deleted",
      staff_id: "staff_test"
    });

    ctx.memberId = userId;
    ctx.facilityId = facilityId;
    ctx.memberIds = [userId];
    ctx.facilityIds = [facilityId];
    ctx.requestIds = [];
    ctx.timeSlotIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
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
  memberIds: [],
  facilityIds: [],
  requestIds: [],
  timeSlotIds: [],
  repairIds: [],
  notificationIds: [],
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
    const submitRepairTicket = httpsCallable(functions, "submitRepairTicket");
    console.log("Calling submitRepairTicket...");

    let result;
    try {
      result = await submitRepairTicket(config.payload(ctx));

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
        ctx.repairId = result.data.repair_id;
        ctx.repairIds.push(result.data.repair_id);

        console.log(`  ✓ Created repair: ${result.data.repair_id}`);
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

    // 2. 删除 time_slot
    for (const id of ctx.timeSlotIds || []) {
      await db.collection("time_slot").doc(id).delete().catch(() => {});
    }

    // 3. 删除 request
    for (const id of ctx.requestIds || []) {
      await db.collection("request").doc(id).delete().catch(() => {});
    }

    // 4. 删除 facility
    for (const id of ctx.facilityIds || []) {
      await db.collection("facility").doc(id).delete().catch(() => {});
    }

    // 5. 删除 member
    for (const id of ctx.memberIds || []) {
      await db.collection("member").doc(id).delete().catch(() => {});
    }

    // 6. 清理 notification（通过 reference_id）
    for (const refId of ctx.requestIds || []) {
      const notifSnap = await db.collection("notification")
        .where("reference_id", "==", refId)
        .get();
      for (const doc of notifSnap.docs) {
        await doc.ref.delete().catch(() => {});
      }
    }

    // 7. 删除 Auth 用户
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

// 显示可用 scenarios
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");
  console.log("\nHappy paths:");
  console.log("  submit-success-normal-facility");
  console.log("  submit-success-fixing-facility");
  console.log("  cancels-active-requests");
  console.log("  keeps-terminal-requests");
  console.log("  releases-linked-time-slots-by-request-id");
  console.log("  does-not-release-unrelated-locked-slot");
  console.log("  creates-maintenance-cancelled-notifications");
  console.log("\nFailure paths:");
  console.log("  unauthenticated");
  console.log("  inactive-member");
  console.log("  not-member");
  console.log("  missing-facility-id");
  console.log("  missing-repair-description");
  console.log("  description-too-long");
  console.log("  missing-type");
  console.log("  facility-not-found");
  console.log("  deleted-facility");
  process.exit(0);
}