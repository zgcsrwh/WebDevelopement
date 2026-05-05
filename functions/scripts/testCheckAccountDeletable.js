/**
 * testCheckAccountDeletable.js
 *
 * 本地测试脚本 for checkAccountDeletable Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testCheckAccountDeletable.js --scenario=deletable-member-no-blockers
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

// ============ 常量 ============

const OWN_REQUEST_REASON = "You still have an unfinished booking request or active booking.";
const PARTICIPANT_REASON = "You are still listed as a participant in another active booking.";

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
let scenario = "deletable-member-no-blockers";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// --list 在解析参数后立即处理
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");
  console.log("\nAllowed:");
  console.log("  deletable-member-no-blockers");
  console.log("\nBlocking:");
  console.log("  blocked-own-pending-request");
  console.log("  blocked-own-accepted-request");
  console.log("  blocked-own-suggested-request");
  console.log("  blocked-participant-pending-request");
  console.log("  multiple-blocking-reasons");
  console.log("\nNon-blocking:");
  console.log("  ignores-cancelled-rejected-completed-requests");
  console.log("  ignores-repair");
  console.log("  ignores-notifications");
  console.log("  ignores-matching-friends");
  console.log("\nSecurity/Failure:");
  console.log("  unauthenticated");
  console.log("  member-not-found");
  console.log("  staff-not-supported");
  console.log("  admin-not-supported");
  console.log("  ignores-payload-identity");
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
  // ============ Allowed ============
  "deletable-member-no-blockers": {
    description: "Member with no blocking requests - deletable",
    payload: (ctx) => ({}),
    preProcess: "create-member-no-blockers",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return memberDoc.exists;
    },
  },

  // ============ Blocking ============
  "blocked-own-pending-request": {
    description: "Own request status=pending - blocked",
    payload: (ctx) => ({}),
    preProcess: "create-own-pending-request",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const requestDoc = await db.collection("request").doc(ctx.requestIds[0]).get();
      return requestDoc.exists && requestDoc.data().status === "pending";
    },
  },

  "blocked-own-accepted-request": {
    description: "Own request status=accepted - blocked",
    payload: (ctx) => ({}),
    preProcess: "create-own-accepted-request",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const requestDoc = await db.collection("request").doc(ctx.requestIds[0]).get();
      return requestDoc.exists && requestDoc.data().status === "accepted";
    },
  },

  "blocked-own-suggested-request": {
    description: "Own request status=suggested - blocked",
    payload: (ctx) => ({}),
    preProcess: "create-own-suggested-request",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const requestDoc = await db.collection("request").doc(ctx.requestIds[0]).get();
      return requestDoc.exists && requestDoc.data().status === "suggested";
    },
  },

  "blocked-participant-pending-request": {
    description: "As participant status=pending - blocked",
    payload: (ctx) => ({}),
    preProcess: "create-participant-pending-request",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const requestDoc = await db.collection("request").doc(ctx.requestIds[0]).get();
      return requestDoc.exists &&
        requestDoc.data().status === "pending" &&
        (requestDoc.data().participant_ids || []).includes(ctx.staffId);
    },
  },

  "multiple-blocking-reasons": {
    description: "Multiple blocking reasons - both own and participant",
    payload: (ctx) => ({}),
    preProcess: "create-multiple-blocking-reasons",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证两个 request 都存在
      const req1 = await db.collection("request").doc(ctx.requestIds[0]).get();
      const req2 = await db.collection("request").doc(ctx.requestIds[1]).get();
      return req1.exists && req2.exists;
    },
  },

  // ============ Non-blocking ============
  "ignores-cancelled-rejected-completed-requests": {
    description: "Cancelled/rejected/completed requests - not blocking",
    payload: (ctx) => ({}),
    preProcess: "create-completed-requests",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // 验证都是非 blocking status
      for (const reqId of ctx.requestIds) {
        const doc = await db.collection("request").doc(reqId).get();
        if (doc.exists) {
          const status = String(doc.data().status || "").toLowerCase();
          if (["pending", "accepted", "suggested"].includes(status)) {
            return false;
          }
        }
      }
      return true;
    },
  },

  "ignores-repair": {
    description: "Repair pending - not blocking (repair not check)",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-repair",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const repairDoc = await db.collection("repair").doc(ctx.repairIds[0]).get();
      return repairDoc.exists;
    },
  },

  "ignores-notifications": {
    description: "Has notifications - not blocking",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-notifications",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const notifDoc = await db.collection("notification").doc(ctx.notificationIds[0]).get();
      return notifDoc.exists;
    },
  },

  "ignores-matching-friends": {
    description: "Has matching/friends - not blocking",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-matching-friends",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const matchDoc = await db.collection("matching").doc(ctx.matchIds[0]).get();
      return matchDoc.exists;
    },
  },

  // ============ Security / Failure ============
  "unauthenticated": {
    description: "Not logged in - should return error",
    payload: (ctx) => ({}),
    preProcess: null,
    cleanup: false,
    expectedError: "unauthenticated",
  },

  "member-not-found": {
    description: "Auth user exists but member doc does not",
    payload: (ctx) => ({}),
    preProcess: "create-no-member",
    cleanup: true,
    expectedError: "permission-denied",
    verifyDatabase: async (ctx) => {
      // 验证 member 不存在
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return !memberDoc.exists;
    },
  },

  "staff-not-supported": {
    description: "Staff not supported for self-deletion",
    payload: (ctx) => ({}),
    preProcess: "create-staff",
    cleanup: true,
    expectedError: "permission-denied",
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return staffDoc.exists && staffDoc.data().role === "Staff";
    },
  },

  "admin-not-supported": {
    description: "Admin not supported for self-deletion",
    payload: (ctx) => ({}),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "permission-denied",
    verifyDatabase: async (ctx) => {
      const staffDoc = await db.collection("admin_staff").doc(ctx.staffId).get();
      return staffDoc.exists && String(staffDoc.data().role || "").toLowerCase() === "admin";
    },
  },

  "ignores-payload-identity": {
    description: "Payload identity fields ignored",
    payload: (ctx) => ({ uid: "fake-uid", role: "Admin", member_id: "fake-member", staff_id: "fake-staff", email: "fake@example.com" }),
    preProcess: "create-member-no-blockers",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return memberDoc.exists;
    },
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-member-no-blockers": async (ctx) => {
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
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} (no blockers)`);
  },

  "create-own-pending-request": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const requestId = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId).set({
      member_id: staffId,
      status: "pending",
      participant_ids: [],
      date: "2025-01-01",
      start_time: "10:00",
      end_time: "11:00",
      facility_id: "test-facility"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [requestId];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with pending request ${requestId}`);
  },

  "create-own-accepted-request": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const requestId = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId).set({
      member_id: staffId,
      status: "accepted",
      participant_ids: [],
      date: "2025-01-01",
      start_time: "10:00",
      end_time: "11:00",
      facility_id: "test-facility"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [requestId];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with accepted request ${requestId}`);
  },

  "create-own-suggested-request": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const requestId = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId).set({
      member_id: staffId,
      status: "suggested",
      participant_ids: [],
      date: "2025-01-01",
      start_time: "10:00",
      end_time: "11:00",
      facility_id: "test-facility"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [requestId];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with suggested request ${requestId}`);
  },

  "create-participant-pending-request": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    // 不需要创建另一个 Auth user，直接使用确定的其他用户 ID
    const otherMemberId = "other-member-" + uuidv4().slice(0, 8);

    // 创建 request，current 用户作为 participant
    const requestId = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId).set({
      member_id: otherMemberId,
      status: "pending",
      participant_ids: [staffId],
      date: "2025-01-01",
      start_time: "10:00",
      end_time: "11:00",
      facility_id: "test-facility"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [requestId];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created pending request ${requestId} with participant ${staffId}`);
  },

  "create-multiple-blocking-reasons": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    // 自己发起的 pending request
    const requestId1 = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId1).set({
      member_id: staffId,
      status: "pending",
      participant_ids: [],
      date: "2025-01-01",
      start_time: "10:00",
      end_time: "11:00",
      facility_id: "test-facility"
    });

    // 使用确定的其他用户 ID 作为 participant request 的 owner
    const otherMemberId = "other-member-" + uuidv4().slice(0, 8);

    const requestId2 = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId2).set({
      member_id: otherMemberId,
      status: "pending",
      participant_ids: [staffId],
      date: "2025-01-02",
      start_time: "14:00",
      end_time: "15:00",
      facility_id: "test-facility"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [requestId1, requestId2];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created multiple blocking for ${staffId}`);
  },

  "create-completed-requests": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    // 创建 completed request (自己的)
    const requestId1 = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId1).set({
      member_id: staffId,
      status: "completed",
      participant_ids: [],
      date: "2025-01-01",
      start_time: "10:00",
      end_time: "11:00",
      facility_id: "test-facility"
    });

    // 使用确定的其他用户 ID
    const otherMemberId = "other-member-" + uuidv4().slice(0, 8);

    // 创建 rejected request (participant)
    const requestId2 = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId2).set({
      member_id: otherMemberId,
      status: "rejected",
      participant_ids: [staffId],
      date: "2025-01-02",
      start_time: "14:00",
      end_time: "15:00",
      facility_id: "test-facility"
    });

    // 创建 cancelled request
    const requestId3 = `cad-req-${uuidv4()}`;
    await db.collection("request").doc(requestId3).set({
      member_id: staffId,
      status: "cancelled",
      participant_ids: [],
      date: "2025-01-03",
      start_time: "16:00",
      end_time: "17:00",
      facility_id: "test-facility"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [requestId1, requestId2, requestId3];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created completed/cancelled/rejected requests`);
  },

  "create-member-with-repair": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const repairId = `cad-repair-${uuidv4()}`;
    await db.collection("repair").doc(repairId).set({
      member_id: staffId,
      status: "pending",
      facility_id: "test-facility",
      description: "Test repair"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [];
    ctx.repairIds = [repairId];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with repair ${repairId}`);
  },

  "create-member-with-notifications": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const notifId = `cad-notif-${uuidv4()}`;
    await db.collection("notification").doc(notifId).set({
      member_id: staffId,
      message: "Test notification",
      type: "system",
      is_read: false
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [notifId];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with notification ${notifId}`);
  },

  "create-member-with-matching-friends": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    // matching
    const matchId = `cad-match-${uuidv4()}`;
    await db.collection("matching").doc(matchId).set({
      sender_id: staffId,
      receiver_id: "other-uid",
      status: "pending"
    });

    // friends
    const friendId = `cad-friends-${uuidv4()}`;
    await db.collection("friends").doc(friendId).set({
      friends_ids: [staffId, "other-uid"]
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [matchId];
    ctx.friendIds = [friendId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with matching/friends`);
  },

  "create-no-member": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    // 不创建 member 文档

    ctx.staffId = staffId;
    ctx.memberIds = [];
    ctx.adminStaffIds = [];
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created auth user ${staffId} without member doc`);
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
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created staff ${staffId}`);
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
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created admin ${staffId}`);
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
  requestIds: [],
  repairIds: [],
  notificationIds: [],
  matchIds: [],
  friendIds: [],
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
    const checkAccountDeletableCallable = httpsCallable(functions, "checkAccountDeletable");
    console.log("Calling checkAccountDeletable...");

    let result;
    try {
      result = await checkAccountDeletableCallable(config.payload(ctx));

      // 检查是否有错误但 call 成功的情况
      if (config.expectedError) {
        throw new Error(`Expected error ${config.expectedError}, but got success`);
      }

      // 验证返回值
      if (config.expectedSuccess) {
        const data = result.data;

        // 断言 isDeletable
        if (data.isDeletable === undefined) {
          throw new Error("Missing isDeletable in response");
        }

        // 断言 blockingReasons
        if (!Array.isArray(data.blockingReasons)) {
          throw new Error("blockingReasons should be an array");
        }

        // 根据 scenario 类型断言
        if (scenario === "deletable-member-no-blockers" ||
            scenario === "ignores-cancelled-rejected-completed-requests" ||
            scenario === "ignores-repair" ||
            scenario === "ignores-notifications" ||
            scenario === "ignores-matching-friends" ||
            scenario === "ignores-payload-identity") {
          if (data.isDeletable !== true) {
            throw new Error(`Expected isDeletable=true, got ${data.isDeletable}`);
          }
          if (data.blockingReasons.length !== 0) {
            throw new Error(`Expected empty blockingReasons, got ${JSON.stringify(data.blockingReasons)}`);
          }
        } else if (scenario.startsWith("blocked-own")) {
          if (data.isDeletable !== false) {
            throw new Error(`Expected isDeletable=false, got ${data.isDeletable}`);
          }
          if (!data.blockingReasons.includes(OWN_REQUEST_REASON)) {
            throw new Error(`Expected to include "${OWN_REQUEST_REASON}", got ${JSON.stringify(data.blockingReasons)}`);
          }
        } else if (scenario === "blocked-participant-pending-request") {
          if (data.isDeletable !== false) {
            throw new Error(`Expected isDeletable=false, got ${data.isDeletable}`);
          }
          if (!data.blockingReasons.includes(PARTICIPANT_REASON)) {
            throw new Error(`Expected to include "${PARTICIPANT_REASON}", got ${JSON.stringify(data.blockingReasons)}`);
          }
        } else if (scenario === "multiple-blocking-reasons") {
          if (data.isDeletable !== false) {
            throw new Error(`Expected isDeletable=false, got ${data.isDeletable}`);
          }
          if (!data.blockingReasons.includes(OWN_REQUEST_REASON)) {
            throw new Error(`Expected to include "${OWN_REQUEST_REASON}", got ${JSON.stringify(data.blockingReasons)}`);
          }
          if (!data.blockingReasons.includes(PARTICIPANT_REASON)) {
            throw new Error(`Expected to include "${PARTICIPANT_REASON}", got ${JSON.stringify(data.blockingReasons)}`);
          }
        }

        console.log(`  ✓ isDeletable: ${data.isDeletable}`);
        console.log(`  ✓ blockingReasons: ${JSON.stringify(data.blockingReasons)}`);
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

    // 3. 删除 request
    for (const id of ctx.requestIds || []) {
      await db.collection("request").doc(id).delete().catch(() => {});
    }

    // 4. 删除 repair
    for (const id of ctx.repairIds || []) {
      await db.collection("repair").doc(id).delete().catch(() => {});
    }

    // 5. 删除 notification
    for (const id of ctx.notificationIds || []) {
      await db.collection("notification").doc(id).delete().catch(() => {});
    }

    // 6. 删除 matching
    for (const id of ctx.matchIds || []) {
      await db.collection("matching").doc(id).delete().catch(() => {});
    }

    // 7. 删除 friends
    for (const id of ctx.friendIds || []) {
      await db.collection("friends").doc(id).delete().catch(() => {});
    }

    // 8. 删除 Auth 用户
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