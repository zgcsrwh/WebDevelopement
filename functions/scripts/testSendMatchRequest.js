/**
 * testSendMatchRequest.js
 *
 * 本地测试脚本 for sendMatchRequest Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testSendMatchRequest.js --scenario=send-match-success-with-message
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

// ============ Firebase Admin SDK 初始化 ============

admin.initializeApp({
  projectId: "learnfire-e5720",
});
const db = admin.firestore();
db.settings({
  host: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
  ssl: false
});

const adminAuth = getAdminAuth();

// ============ UUID 生成 ============

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============ 命令行参数 ============

const args = process.argv.slice(2);
let scenario = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--scenario" && i + 1 < args.length) {
    scenario = args[i + 1];
    i++;
  } else if (args[i].startsWith("--scenario=")) {
    scenario = args[i].split("=")[1];
  }
}

// 如果没有指定 scenario，默认运行第一个 success 场景
if (!scenario) {
  scenario = "send-match-success-with-message";
}

// ============ --list 支持 ============

if (args.includes("--list")) {
  console.log("Available scenarios:");
  console.log("");
  console.log("Happy:");
  console.log("  send-match-success-with-message");
  console.log("  send-match-success-default-message");
  console.log("  send-match-success-trims-message");
  console.log("  send-match-success-with-receiver-id-compat");
  console.log("  send-match-success-after-rejected");
  console.log("  send-match-success-after-invalidated");
  console.log("");
  console.log("Validation/Failure:");
  console.log("  missing-reciever-id");
  console.log("  self-request-not-allowed");
  console.log("  apply-description-too-long");
  console.log("  apply-description-contains-left-angle");
  console.log("  apply-description-contains-right-angle");
  console.log("  caller-profile-not-found");
  console.log("  caller-matching-disabled");
  console.log("  receiver-member-not-found");
  console.log("  receiver-inactive");
  console.log("  receiver-profile-not-found");
  console.log("  receiver-matching-disabled");
  console.log("");
  console.log("Relation Checks:");
  console.log("  already-friends");
  console.log("  duplicate-pending-same-direction");
  console.log("  duplicate-pending-opposite-direction");
  console.log("  duplicate-accepted");
  console.log("");
  console.log("Permission:");
  console.log("  unauthenticated");
  console.log("  member-not-found");
  console.log("  inactive-member-not-allowed");
  console.log("  staff-not-allowed");
  console.log("  admin-not-allowed");
  console.log("");
  console.log("Security:");
  console.log("  ignores-payload-sender-id-member-id-role-uid");
  console.log("  member-without-role-success");
  process.exit(0);
}

// ============ 工具函数 ============

function normalizeErrorCode(code) {
  if (code && code.startsWith("functions/")) {
    return code.replace("functions/", "");
  }
  return code;
}

async function deleteAuthUserByUid(uid) {
  try {
    await adminAuth.deleteUser(uid);
  } catch (e) {
    // 如果已不存在，忽略
  }
}

function generateUniqueEmail() {
  return `test-${uuidv4()}@example.com`;
}

// ============ Scenario 配置 ============

const scenarios = {
  // ============ Happy ============
  "send-match-success-with-message": {
    description: "Send match with message - success",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: "hello"
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const data = matchingDoc.data();
      if (data.sender_id !== ctx.callerUid) {
        throw new Error(`sender_id should be ${ctx.callerUid}, got ${data.sender_id}`);
      }
      if (data.reciever_id !== ctx.receiverUid) {
        throw new Error(`reciever_id should be ${ctx.receiverUid}, got ${data.reciever_id}`);
      }
      if (data.receiver_id) {
        throw new Error("matching should NOT contain receiver_id field");
      }
      if (data.status !== "pending") {
        throw new Error(`status should be pending, got ${data.status}`);
      }
      if (data.apply_description !== "hello") {
        throw new Error(`apply_description should be hello, got ${data.apply_description}`);
      }
      if (data.respond_message !== "") {
        throw new Error(`respond_message should be empty, got ${data.respond_message}`);
      }
      if (data.completed_at !== "") {
        throw new Error(`completed_at should be empty, got ${data.completed_at}`);
      }
      if (!data.created_at) {
        throw new Error("created_at should exist");
      }
      // Verify no notification created
      const notifications = await db.collection("notification").where("member_id", "==", ctx.callerUid).get();
      if (!notifications.empty) {
        throw new Error("notification should not be created");
      }
      // Verify no friends created
      const friends = await db.collection("friends").where("member_id", "==", ctx.callerUid).get();
      if (!friends.empty) {
        const friendData = friends.docs[0].data();
        if (friendData.friends_ids && friendData.friends_ids.includes(ctx.receiverUid)) {
          throw new Error("friends should not be created");
        }
      }
      return true;
    },
  },

  "send-match-success-default-message": {
    description: "Send match with default message - success",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: ""
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const data = matchingDoc.data();
      if (data.apply_description !== "Would you like to train together?") {
        throw new Error(`apply_description should be default message, got ${data.apply_description}`);
      }
      return true;
    },
  },

  "send-match-success-trims-message": {
    description: "Send match with trimmed message - success",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: "  hello  "
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const data = matchingDoc.data();
      if (data.apply_description !== "hello") {
        throw new Error(`apply_description should be trimmed to hello, got ${data.apply_description}`);
      }
      return true;
    },
  },

  "send-match-success-with-receiver-id-compat": {
    description: "Send match with receiver_id (compat) - success",
    payload: (ctx) => ({
      receiver_id: ctx.receiverUid,  // 使用 receiver_id 而不是 reciever_id
      apply_description: "test"
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const data = matchingDoc.data();
      // 应该是 reciever_id，不是 receiver_id
      if (data.reciever_id !== ctx.receiverUid) {
        throw new Error(`reciever_id should be ${ctx.receiverUid}, got ${data.reciever_id}`);
      }
      if (data.receiver_id) {
        throw new Error("matching should NOT contain receiver_id field");
      }
      return true;
    },
  },

  "send-match-success-after-rejected": {
    description: "Send match after rejected - success",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: "second request"
    }),
    preProcess: "create-caller-and-receiver-with-rejected-matching",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify new matching created with new ID
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("new matching document should exist");
      }
      const data = matchingDoc.data();
      if (data.status !== "pending") {
        throw new Error(`new status should be pending, got ${data.status}`);
      }
      if (data.apply_description !== "second request") {
        throw new Error(`apply_description should be second request, got ${data.apply_description}`);
      }
      // Verify old matching still exists with status=rejected
      const oldMatchingDoc = await db.collection("matching").doc(ctx.oldMatchingId).get();
      if (!oldMatchingDoc.exists) {
        throw new Error("old matching document should still exist");
      }
      if (oldMatchingDoc.data().status !== "rejected") {
        throw new Error("old matching status should still be rejected");
      }
      return true;
    },
  },

  "send-match-success-after-invalidated": {
    description: "Send match after invalidated - success",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: "second request"
    }),
    preProcess: "create-caller-and-receiver-with-invalidated-matching",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify new matching created
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("new matching document should exist");
      }
      const data = matchingDoc.data();
      if (data.status !== "pending") {
        throw new Error(`new status should be pending, got ${data.status}`);
      }
      return true;
    },
  },

  // ============ Validation/Failure ============
  "missing-reciever-id": {
    description: "Missing reciever_id - invalid-argument",
    payload: (ctx) => ({}),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "self-request-not-allowed": {
    description: "Self request not allowed - invalid-argument",
    payload: (ctx) => ({
      reciever_id: ctx.callerUid  // 发送给自己
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "apply-description-too-long": {
    description: "Apply description too long - invalid-argument",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: "a".repeat(501)  // 超过 500 字符
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "apply-description-contains-left-angle": {
    description: "Apply description contains < - invalid-argument",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: "<script>alert(1)</script>"
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "apply-description-contains-right-angle": {
    description: "Apply description contains > - invalid-argument",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      apply_description: "test > test"
    }),
    preProcess: "create-caller-and-receiver",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "caller-profile-not-found": {
    description: "Caller profile not found - failed-precondition",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-without-profile",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  "caller-matching-disabled": {
    description: "Caller matching disabled - failed-precondition",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-with-profile-closed",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  "receiver-member-not-found": {
    description: "Receiver member not found - failed-precondition",
    payload: (ctx) => ({
      reciever_id: "non-existent-member"
    }),
    preProcess: "create-caller-with-profile",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  "receiver-inactive": {
    description: "Receiver inactive - failed-precondition",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-inactive-receiver",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  "receiver-profile-not-found": {
    description: "Receiver profile not found - failed-precondition",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-receiver-without-profile",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  "receiver-matching-disabled": {
    description: "Receiver matching disabled - failed-precondition",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-receiver-with-profile-closed",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  // ============ Relation Checks ============
  "already-friends": {
    description: "Already friends - already-exists",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-receiver-with-friends",
    cleanup: true,
    expectedError: "already-exists",
  },

  "duplicate-pending-same-direction": {
    description: "Duplicate pending same direction - already-exists",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-receiver-with-pending-same",
    cleanup: true,
    expectedError: "already-exists",
  },

  "duplicate-pending-opposite-direction": {
    description: "Duplicate pending opposite direction - already-exists",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-receiver-with-pending-opposite",
    cleanup: true,
    expectedError: "already-exists",
  },

  "duplicate-accepted": {
    description: "Duplicate accepted - already-exists",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-receiver-with-accepted",
    cleanup: true,
    expectedError: "already-exists",
  },

  // ============ Permission ============
  "unauthenticated": {
    description: "Unauthenticated - unauthenticated error",
    payload: (ctx) => ({
      reciever_id: "some-id"
    }),
    preProcess: "create-caller-with-profile",
    cleanup: true,
    expectedError: "unauthenticated",
  },

  "member-not-found": {
    description: "Member not found - permission-denied error",
    payload: (ctx) => ({
      reciever_id: "some-id"
    }),
    preProcess: "create-member-no-member-doc",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "inactive-member-not-allowed": {
    description: "Inactive member not allowed - failed-precondition error",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-inactive-caller-and-receiver",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  "staff-not-allowed": {
    description: "Staff not allowed - permission-denied error",
    payload: (ctx) => ({
      reciever_id: "some-id"
    }),
    preProcess: "create-staff-caller",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "admin-not-allowed": {
    description: "Admin not allowed - permission-denied error",
    payload: (ctx) => ({
      reciever_id: "some-id"
    }),
    preProcess: "create-admin-caller",
    cleanup: true,
    expectedError: "permission-denied",
  },

  // ============ Security ============
  "ignores-payload-sender-id-member-id-role-uid": {
    description: "Ignores payload sender_id/member_id/uid - security",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid,
      sender_id: ctx.otherFakeUid,  // 伪造
      member_id: ctx.otherFakeUid,
      uid: ctx.otherFakeUid,
      role: "Admin",
      status: "active"
    }),
    preProcess: "create-caller-and-receiver-and-fake",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const data = matchingDoc.data();
      // sender_id 应该是 callerUid，不是伪造的 otherFakeUid
      if (data.sender_id !== ctx.callerUid) {
        throw new Error(`sender_id should be ${ctx.callerUid}, got ${data.sender_id}`);
      }
      return true;
    },
  },

  "member-without-role-success": {
    description: "Member without role field success - security",
    payload: (ctx) => ({
      reciever_id: ctx.receiverUid
    }),
    preProcess: "create-caller-and-receiver-no-role",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const matchingDoc = await db.collection("matching").doc(ctx.resultMatchId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const data = matchingDoc.data();
      if (data.status !== "pending") {
        throw new Error(`status should be pending, got ${data.status}`);
      }
      return true;
    },
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-caller-and-receiver": async (ctx) => {
    // Create caller
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
      // 注意：不写 role 字段
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create receiver
    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
      // 注意：不写 role 字段
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created caller profile ${callerProfileId} (open_match: true)`);
    console.log(`  ✓ Created receiver ${receiverUid}`);
    console.log(`  ✓ Created receiver profile ${receiverProfileId} (open_match: true)`);
  },

  "create-caller-with-profile": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.callerEmail = callerEmail;
    ctx.memberIds = [callerUid];
    ctx.profileIds = [callerProfileId];
    ctx.authUsers = [callerEmail];

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created caller profile ${callerProfileId} (open_match: true)`);
  },

  "create-caller-without-profile": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });
    // 注意：不创建 caller profile

    // 创建合法 receiver
    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid} (no profile)`);
    console.log(`  ✓ Created receiver ${receiverUid}`);
  },

  "create-caller-with-profile-closed": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: false,  // closed
      last_updated: new Date().toISOString(),
    });

    // 创建合法 receiver
    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid} (open_match: false)`);
    console.log(`  ✓ Created receiver ${receiverUid}`);
  },

  "create-caller-and-receiver-with-rejected-matching": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create rejected matching
    const oldMatchingId = `matching-${uuidv4()}`;
    await db.collection("matching").doc(oldMatchingId).set({
      sender_id: callerUid,
      reciever_id: receiverUid,
      status: "rejected",
      created_at: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];
    ctx.oldMatchingId = oldMatchingId;

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created rejected matching ${oldMatchingId}`);
  },

  "create-caller-and-receiver-with-invalidated-matching": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create invalidated matching
    const oldMatchingId = `matching-${uuidv4()}`;
    await db.collection("matching").doc(oldMatchingId).set({
      sender_id: callerUid,
      reciever_id: receiverUid,
      status: "invalidated",
      created_at: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];
    ctx.oldMatchingId = oldMatchingId;

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created invalidated matching ${oldMatchingId}`);
  },

  "create-caller-and-inactive-receiver": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    // receiver status = inactive
    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "inactive",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created inactive receiver ${receiverUid}`);
  },

  "create-caller-and-receiver-without-profile": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });
    // 注意：不创建 receiver profile

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created receiver ${receiverUid} (no profile)`);
  },

  "create-caller-and-receiver-with-profile-closed": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: false,  // closed
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created receiver ${receiverUid} (open_match: false)`);
  },

  "create-caller-and-receiver-with-friends": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create friends: caller has receiver in friends_ids
    await db.collection("friends").doc(callerUid).set({
      member_id: callerUid,
      friends_ids: [receiverUid],
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];
    ctx.friendDocIds = [callerUid];

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created friends with receiver ${receiverUid}`);
  },

  "create-caller-and-receiver-with-pending-same": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create pending matching (same direction: caller -> receiver)
    const matchingId = `matching-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: callerUid,
      reciever_id: receiverUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];
    ctx.oldMatchingId = matchingId;

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created pending matching ${matchingId}`);
  },

  "create-caller-and-receiver-with-pending-opposite": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create pending matching (opposite direction: receiver -> caller)
    const matchingId = `matching-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: receiverUid,
      reciever_id: callerUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];
    ctx.oldMatchingId = matchingId;

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created opposite pending matching ${matchingId}`);
  },

  "create-caller-and-receiver-with-accepted": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create accepted matching
    const matchingId = `matching-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: callerUid,
      reciever_id: receiverUid,
      status: "accepted",
      created_at: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];
    ctx.oldMatchingId = matchingId;

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created accepted matching ${matchingId}`);
  },

  "create-member-no-member-doc": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;
    // 注意：这里不创建 member/{uid} 文档

    ctx.callerUid = memberUid;
    ctx.callerEmail = email;
    ctx.authUserIds = [memberUid];
    ctx.memberIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created auth user ${memberUid} (no member doc)`);
  },

  "create-inactive-caller-and-receiver": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "inactive",  // inactive
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created inactive caller ${callerUid}`);
    console.log(`  ✓ Created receiver ${receiverUid}`);
  },

  "create-staff-caller": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffUid = auth.currentUser.uid;

    await db.collection("admin_staff").doc(staffUid).set({
      name: "Test Staff",
      email: email,
      status: "active",
      role: "staff",
    });

    ctx.staffUid = staffUid;
    ctx.callerEmail = email;
    ctx.adminStaffIds = [staffUid];
    ctx.authUsers = [email];

    console.log(`  ✓ Created staff ${staffUid}`);
  },

  "create-admin-caller": async (ctx) => {
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
    ctx.callerEmail = email;
    ctx.adminStaffIds = [adminUid];
    ctx.authUsers = [email];

    console.log(`  ✓ Created admin ${adminUid}`);
  },

  "create-caller-and-receiver-and-fake": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create fake user that payload tries to impersonate
    const otherFakeUid = `fake-${uuidv4()}`;

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.otherFakeUid = otherFakeUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid}`);
    console.log(`  ✓ Created receiver ${receiverUid}`);
    console.log(`  ✓ Created fake uid ${otherFakeUid} for security test`);
  },

  "create-caller-and-receiver-no-role": async (ctx) => {
    const callerEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, callerEmail, "test-password-123");
    const callerUid = auth.currentUser.uid;

    // Member without role field
    await db.collection("member").doc(callerUid).set({
      name: "Test Caller",
      email: callerEmail,
      status: "active",
      // 注意：完全不写 role 字段
    });

    const callerProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(callerProfileId).set({
      member_id: callerUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const receiverEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, receiverEmail, "test-password-123");
    const receiverUid = auth.currentUser.uid;

    // Receiver also without role field
    await db.collection("member").doc(receiverUid).set({
      name: "Test Receiver",
      email: receiverEmail,
      status: "active",
    });

    const receiverProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(receiverProfileId).set({
      member_id: receiverUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.callerUid = callerUid;
    ctx.receiverUid = receiverUid;
    ctx.callerEmail = callerEmail;
    ctx.receiverEmail = receiverEmail;
    ctx.memberIds = [callerUid, receiverUid];
    ctx.profileIds = [callerProfileId, receiverProfileId];
    ctx.authUsers = [callerEmail, receiverEmail];

    console.log(`  ✓ Created caller ${callerUid} (no role)`);
    console.log(`  ✓ Created receiver ${receiverUid} (no role)`);
  },
};

// ============ 全局上下文 ============

const config = scenarios[scenario];
const ctx = {
  callerUid: null,
  receiverUid: null,
  callerEmail: null,
  receiverEmail: null,
  memberIds: [],
  profileIds: [],
  adminStaffIds: [],
  authUsers: [],
  authUserIds: [],
  friendDocIds: [],
  resultMatchId: null,
  oldMatchingId: null,
  staffUid: null,
  adminUid: null,
  otherFakeUid: null,
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
    } else if (config.preProcess !== "create-member-no-member-doc" &&
             config.preProcess !== "create-staff-caller" &&
             config.preProcess !== "create-admin-caller") {
      // 登录为 caller
      await signInWithEmailAndPassword(auth, ctx.callerEmail, "test-password-123");
    }

    // 调用 callable
    const sendMatchRequestCallable = httpsCallable(functions, "sendMatchRequest");
    console.log("Calling sendMatchRequest...");

    let result;
    try {
      result = await sendMatchRequestCallable(config.payload(ctx));

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
        if (!data.match_id) {
          throw new Error("match_id should exist");
        }
        ctx.resultMatchId = data.match_id;

        console.log(`  ✓ success: ${data.success}`);
        console.log(`  ✓ match_id: ${data.match_id}`);
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
        console.log(`  ✓ Expected error: ${errorCode}`);
        console.log("TEST PASSED");
      } else {
        // Unexpected error
        throw callError;
      }
    }
  } catch (error) {
    console.error(`\nTEST FAILED: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // cleanup
    if (config.cleanup) {
      console.log("\nRunning cleanup...");
      try {
        // 删除 Auth users
        for (const email of ctx.authUsers) {
          try {
            // 需要先获取 uid 再删除，因为 Auth Emulator 中没有按 email 删除的 API
          } catch (e) {
            // ignore
          }
        }
        // 使用 uid 删除
        for (const uid of ctx.memberIds) {
          try {
            await deleteAuthUserByUid(uid);
          } catch (e) {
            // ignore
          }
        }
        for (const uid of ctx.adminStaffIds) {
          try {
            await deleteAuthUserByUid(uid);
          } catch (e) {
            // ignore
          }
        }
        for (const uid of ctx.authUserIds || []) {
          try {
            await deleteAuthUserByUid(uid);
          } catch (e) {
            // ignore
          }
        }

        // 删除 Firestore docs
        for (const id of ctx.memberIds) {
          try {
            await db.collection("member").doc(id).delete();
          } catch (e) {
            // ignore
          }
        }
        for (const id of ctx.profileIds || []) {
          try {
            await db.collection("profile").doc(id).delete();
          } catch (e) {
            // ignore
          }
        }
        for (const id of ctx.adminStaffIds) {
          try {
            await db.collection("admin_staff").doc(id).delete();
          } catch (e) {
            // ignore
          }
        }
        for (const id of ctx.friendDocIds || []) {
          try {
            await db.collection("friends").doc(id).delete();
          } catch (e) {
            // ignore
          }
        }
        if (ctx.resultMatchId) {
          try {
            await db.collection("matching").doc(ctx.resultMatchId).delete();
          } catch (e) {
            // ignore
          }
        }
        if (ctx.oldMatchingId) {
          try {
            await db.collection("matching").doc(ctx.oldMatchingId).delete();
          } catch (e) {
            // ignore
          }
        }

        console.log("  ✓ Cleanup completed");
      } catch (cleanupError) {
        console.error(`Cleanup error: ${cleanupError.message}`);
      }
    }
  }
}

// 运行测试
runTest().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});