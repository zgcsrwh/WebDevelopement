/**
 * testRespondToMatchRequest.js
 *
 * 本地测试脚本 for respondToMatchRequest Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testRespondToMatchRequest.js --scenario=accept-success-basic
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

console.log("  ✓ Firebase Client SDK initialized");
console.log(`  ✓ Connected to Auth Emulator: ${authEmulatorUrl}`);
console.log("  ✓ Connected to Functions Emulator: http://127.0.0.1:5001");

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
  scenario = "accept-success-basic";
}

// ============ --list 支持 ============

if (args.includes("--list")) {
  console.log("Available scenarios:");
  console.log("");
  console.log("Happy:");
  console.log("  accept-success-basic");
  console.log("  reject-success-basic");
  console.log("  accept-success-with-respond-message");
  console.log("  reject-success-with-respond-message");
  console.log("  respond-message-trimmed");
  console.log("  accept-creates-bidirectional-friends");
  console.log("  accept-appends-existing-friends");
  console.log("  accept-invalidates-other-pending-same-direction");
  console.log("  accept-invalidates-other-pending-opposite-direction");
  console.log("  accept-does-not-touch-rejected-invalidated");
  console.log("  reject-does-not-create-friends");
  console.log("  reject-does-not-invalidate-other-pending");
  console.log("  accept-with-id-compat");
  console.log("");
  console.log("Validation/Failure:");
  console.log("  missing-match-id");
  console.log("  invalid-status");
  console.log("  missing-status");
  console.log("  matching-not-found");
  console.log("  matching-not-pending-accepted");
  console.log("  matching-not-pending-rejected");
  console.log("  matching-not-pending-invalidated");
  console.log("  caller-not-reciever");
  console.log("  sender-cannot-respond");
  console.log("");
  console.log("Permission:");
  console.log("  unauthenticated");
  console.log("  member-not-found");
  console.log("  inactive-member-not-allowed");
  console.log("  staff-not-allowed");
  console.log("  admin-not-allowed");
  console.log("");
  console.log("Security:");
  console.log("  ignores-payload-sender-id-reciever-id-member-id-role-uid");
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

// ============ 统一 cleanup 函数 ============

const TEST_CLEANUP = {
  authUserIds: [],
  memberDocIds: [],
  adminStaffDocIds: [],
  matchingDocIds: [],
  friendDocIds: [],
  notificationDocIds: []
};

function registerAuthUser(uid) {
  if (uid && !TEST_CLEANUP.authUserIds.includes(uid)) {
    TEST_CLEANUP.authUserIds.push(uid);
  }
}

function registerMemberDoc(uid) {
  if (uid && !TEST_CLEANUP.memberDocIds.includes(uid)) {
    TEST_CLEANUP.memberDocIds.push(uid);
  }
}

function registerAdminStaffDoc(uid) {
  if (uid && !TEST_CLEANUP.adminStaffDocIds.includes(uid)) {
    TEST_CLEANUP.adminStaffDocIds.push(uid);
  }
}

function registerMatchingDoc(id) {
  if (id && !TEST_CLEANUP.matchingDocIds.includes(id)) {
    TEST_CLEANUP.matchingDocIds.push(id);
  }
}

function registerFriendDoc(id) {
  if (id && !TEST_CLEANUP.friendDocIds.includes(id)) {
    TEST_CLEANUP.friendDocIds.push(id);
  }
}

function registerNotificationDoc(id) {
  if (id && !TEST_CLEANUP.notificationDocIds.includes(id)) {
    TEST_CLEANUP.notificationDocIds.push(id);
  }
}

async function cleanupAllTestData() {
  // 不等待 cleanup 完成
  try {
    await signOut(auth);
  } catch (e) {
    // 忽略 signOut 错误
  }

  // 删除 Auth users
  for (const uid of TEST_CLEANUP.authUserIds) {
    try {
      await adminAuth.deleteUser(uid);
    } catch (e) {
      // user 不存在，忽略
    }
  }

  // 删除 member 文档
  if (TEST_CLEANUP.memberDocIds.length > 0) {
    const batch = db.batch();
    TEST_CLEANUP.memberDocIds.forEach((id) => {
      batch.delete(db.collection("member").doc(id));
    });
    try {
      await batch.commit();
    } catch (e) {
      // 忽略
    }
  }

  // 删除 admin_staff 文档
  if (TEST_CLEANUP.adminStaffDocIds.length > 0) {
    const batch = db.batch();
    TEST_CLEANUP.adminStaffDocIds.forEach((id) => {
      batch.delete(db.collection("admin_staff").doc(id));
    });
    try {
      await batch.commit();
    } catch (e) {
      // 忽略
    }
  }

  // 删除 matching 文档
  if (TEST_CLEANUP.matchingDocIds.length > 0) {
    const batch = db.batch();
    TEST_CLEANUP.matchingDocIds.forEach((id) => {
      batch.delete(db.collection("matching").doc(id));
    });
    try {
      await batch.commit();
    } catch (e) {
      // 忽略
    }
  }

  // 删除 friends 文档
  if (TEST_CLEANUP.friendDocIds.length > 0) {
    const batch = db.batch();
    TEST_CLEANUP.friendDocIds.forEach((id) => {
      batch.delete(db.collection("friends").doc(id));
    });
    try {
      await batch.commit();
    } catch (e) {
      // 忽略
    }
  }

  // 删除 notification 文档
  if (TEST_CLEANUP.notificationDocIds.length > 0) {
    const batch = db.batch();
    TEST_CLEANUP.notificationDocIds.forEach((id) => {
      batch.delete(db.collection("notification").doc(id));
    });
    try {
      await batch.commit();
    } catch (e) {
      // 忽略
    }
  }

  // 重置 cleanup 状态
  TEST_CLEANUP.authUserIds = [];
  TEST_CLEANUP.memberDocIds = [];
  TEST_CLEANUP.adminStaffDocIds = [];
  TEST_CLEANUP.matchingDocIds = [];
  TEST_CLEANUP.friendDocIds = [];
  TEST_CLEANUP.notificationDocIds = [];
}

// ============ 主函数 ============

async function runScenario() {
  const respondToMatchRequest = httpsCallable(functions, "respondToMatchRequest");

  let senderUid = null;
  let receiverUid = null;
  let senderAuthUser = null;
  let receiverAuthUser = null;
  let matchId = null;

  try {
    // ========== Happy scenarios ==========

    if (scenario === "accept-success-basic" || scenario === "accept-success-with-respond-message" ||
        scenario === "accept-creates-bidirectional-friends" || scenario === "accept-appends-existing-friends" ||
        scenario === "accept-invalidates-other-pending-same-direction" || scenario === "accept-invalidates-other-pending-opposite-direction" ||
        scenario === "accept-does-not-touch-rejected-invalidated" || scenario === "accept-with-id-compat" ||
        scenario === "respond-message-trimmed" || scenario === "member-without-role-success" ||
        scenario === "ignores-payload-sender-id-reciever-id-member-id-role-uid" ||
        scenario === "sender-cannot-respond" || scenario === "caller-not-reciever" ||
        scenario === "missing-match-id" || scenario === "invalid-status" || scenario === "missing-status" ||
        scenario === "matching-not-found" || scenario === "matching-not-pending-accepted" ||
        scenario === "matching-not-pending-rejected" || scenario === "matching-not-pending-invalidated" ||
        scenario === "unauthenticated" || scenario === "member-not-found" ||
        scenario === "inactive-member-not-allowed" || scenario === "staff-not-allowed" ||
        scenario === "admin-not-allowed" || scenario === "reject-success-basic" ||
        scenario === "reject-success-with-respond-message" || scenario === "reject-does-not-create-friends" ||
        scenario === "reject-does-not-invalidate-other-pending") {

      // 创建 sender Auth user
      const senderEmail = `sender-${uuidv4()}@test.com`;
      senderAuthUser = await createUserWithEmailAndPassword(auth, senderEmail, "123456");
      senderUid = senderAuthUser.user.uid;
      registerAuthUser(senderUid);

      // 创建 receiver Auth user
      const receiverEmail = `receiver-${uuidv4()}@test.com`;
      receiverAuthUser = await createUserWithEmailAndPassword(auth, receiverEmail, "123456");
      receiverUid = receiverAuthUser.user.uid;
      registerAuthUser(receiverUid);

      // 创建 member 文档（sender）
      await db.collection("member").doc(senderUid).set({
        status: "active",
        name: "Sender User"
      });
      registerMemberDoc(senderUid);
      registerFriendDoc(senderUid);

      // 创建 member 文档（receiver）
      await db.collection("member").doc(receiverUid).set({
        status: "active",
        name: "Receiver User"
      });
      registerMemberDoc(receiverUid);
      registerFriendDoc(receiverUid);
    }

    // ========== Happy: accept-success-basic ==========

    if (scenario === "accept-success-basic") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建 pending matching
      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 登录 receiver
      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      // 调用 respondToMatchRequest
      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: ""
      });

      // 断言
      if (!result.data.success) {
        throw new Error("Expected success, got: " + JSON.stringify(result.data));
      }

      const matchingDoc = await db.collection("matching").doc(matchId).get();
      const matchingData = matchingDoc.data();
      if (matchingData.status !== "accepted") {
        throw new Error("Expected status accepted, got: " + matchingData.status);
      }
      if (matchingData.respond_message !== "") {
        throw new Error("Expected empty respond_message, got: " + matchingData.respond_message);
      }
      if (!matchingData.completed_at || !Date.parse(matchingData.completed_at)) {
        throw new Error("Expected completed_at to be parseable date, got: " + matchingData.completed_at);
      }

      // 验证双向 friends
      const senderFriendsDoc = await db.collection("friends").doc(senderUid).get();
      const senderFriends = senderFriendsDoc.data();
      if (!senderFriends || !senderFriends.friends_ids || !senderFriends.friends_ids.includes(receiverUid)) {
        throw new Error("Expected sender friends to contain receiver");
      }

      const receiverFriendsDoc = await db.collection("friends").doc(receiverUid).get();
      const receiverFriends = receiverFriendsDoc.data();
      if (!receiverFriends || !receiverFriends.friends_ids || !receiverFriends.friends_ids.includes(senderUid)) {
        throw new Error("Expected receiver friends to contain sender");
      }

      console.log("  ✓ accept-success-basic PASSED");
    }

    // ========== Happy: reject-success-basic ==========

    if (scenario === "reject-success-basic") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建 pending matching
      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 登录 receiver
      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      // 调用 respondToMatchRequest
      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "rejected",
        respond_message: ""
      });

      // 断言
      if (!result.data.success) {
        throw new Error("Expected success, got: " + JSON.stringify(result.data));
      }

      const matchingDoc = await db.collection("matching").doc(matchId).get();
      const matchingData = matchingDoc.data();
      if (matchingData.status !== "rejected") {
        throw new Error("Expected status rejected, got: " + matchingData.status);
      }
      if (matchingData.respond_message !== "") {
        throw new Error("Expected empty respond_message, got: " + matchingData.respond_message);
      }
      if (!matchingData.completed_at || !Date.parse(matchingData.completed_at)) {
        throw new Error("Expected completed_at to be parseable date, got: " + matchingData.completed_at);
      }

      // 验证不创建 friends
      const senderFriendsDoc = await db.collection("friends").doc(senderUid).get();
      if (senderFriendsDoc.exists) {
        const senderFriends = senderFriendsDoc.data();
        if (senderFriends && senderFriends.friends_ids && senderFriends.friends_ids.includes(receiverUid)) {
          throw new Error("Expected sender not to have receiver as friend after reject");
        }
      }

      const receiverFriendsDoc = await db.collection("friends").doc(receiverUid).get();
      if (receiverFriendsDoc.exists) {
        const receiverFriends = receiverFriendsDoc.data();
        if (receiverFriends && receiverFriends.friends_ids && receiverFriends.friends_ids.includes(senderUid)) {
          throw new Error("Expected receiver not to have sender as friend after reject");
        }
      }

      console.log("  ✓ reject-success-basic PASSED");
    }

    // ========== Happy: accept-success-with-respond-message ==========

    if (scenario === "accept-success-with-respond-message") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: "Great! Let's play together!"
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const matchingDoc = await db.collection("matching").doc(matchId).get();
      const matchingData = matchingDoc.data();
      if (matchingData.respond_message !== "Great! Let's play together!") {
        throw new Error("Expected respond_message to match, got: " + matchingData.respond_message);
      }

      console.log("  ✓ accept-success-with-respond-message PASSED");
    }

    // ========== Happy: reject-success-with-respond-message ==========

    if (scenario === "reject-success-with-respond-message") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "rejected",
        respond_message: "Sorry, I'm busy."
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const matchingDoc = await db.collection("matching").doc(matchId).get();
      const matchingData = matchingDoc.data();
      if (matchingData.respond_message !== "Sorry, I'm busy.") {
        throw new Error("Expected respond_message to match, got: " + matchingData.respond_message);
      }

      console.log("  ✓ reject-success-with-respond-message PASSED");
    }

    // ========== Happy: respond-message-trimmed ==========

    if (scenario === "respond-message-trimmed") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: "  ok  "
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const matchingDoc = await db.collection("matching").doc(matchId).get();
      const matchingData = matchingDoc.data();
      if (matchingData.respond_message !== "ok") {
        throw new Error("Expected respond_message to be trimmed to 'ok', got: " + matchingData.respond_message);
      }

      console.log("  ✓ respond-message-trimmed PASSED");
    }

    // ========== Happy: accept-creates-bidirectional-friends ==========

    if (scenario === "accept-creates-bidirectional-friends") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const senderFriendsDoc = await db.collection("friends").doc(senderUid).get();
      if (!senderFriendsDoc.exists) {
        throw new Error("Expected sender friends doc to exist");
      }
      const senderFriends = senderFriendsDoc.data();
      if (!senderFriends.friends_ids || !senderFriends.friends_ids.includes(receiverUid)) {
        throw new Error("Expected sender friends to contain receiver");
      }
      if (!senderFriends.member_id) {
        throw new Error("Expected friends doc to have member_id");
      }

      const receiverFriendsDoc = await db.collection("friends").doc(receiverUid).get();
      if (!receiverFriendsDoc.exists) {
        throw new Error("Expected receiver friends doc to exist");
      }
      const receiverFriends = receiverFriendsDoc.data();
      if (!receiverFriends.friends_ids || !receiverFriends.friends_ids.includes(senderUid)) {
        throw new Error("Expected receiver friends to contain sender");
      }

      console.log("  ✓ accept-creates-bidirectional-friends PASSED");
    }

    // ========== Happy: accept-appends-existing-friends ==========

    if (scenario === "accept-appends-existing-friends") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 预先创建 sender 的 existing friend
      const existingFriendUid = `existing-${uuidv4()}`;
      await db.collection("member").doc(existingFriendUid).set({ status: "active", name: "Existing Friend" });
      registerMemberDoc(existingFriendUid);
      await db.collection("friends").doc(senderUid).set({
        member_id: senderUid,
        friends_ids: [existingFriendUid]
      });
      registerFriendDoc(senderUid);

      // 预先创建 receiver 的 existing friend
      const existingReceiverFriendUid = `existing-receiver-${uuidv4()}`;
      await db.collection("member").doc(existingReceiverFriendUid).set({ status: "active", name: "Existing Receiver Friend" });
      registerMemberDoc(existingReceiverFriendUid);
      await db.collection("friends").doc(receiverUid).set({
        member_id: receiverUid,
        friends_ids: [existingReceiverFriendUid]
      });
      registerFriendDoc(receiverUid);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      // 验证 sender friends
      const senderFriendsDoc = await db.collection("friends").doc(senderUid).get();
      const senderFriends = senderFriendsDoc.data();
      if (!senderFriends.friends_ids.includes(existingFriendUid)) {
        throw new Error("Expected existing friend to still be present");
      }
      if (!senderFriends.friends_ids.includes(receiverUid)) {
        throw new Error("Expected new friend to be added");
      }
      if (senderFriends.friends_ids.filter((id) => id === receiverUid).length !== 1) {
        throw new Error("Expected no duplicate friends");
      }

      // 验证 receiver friends
      const receiverFriendsDoc = await db.collection("friends").doc(receiverUid).get();
      const receiverFriends = receiverFriendsDoc.data();
      if (!receiverFriends.friends_ids.includes(existingReceiverFriendUid)) {
        throw new Error("Expected existing receiver friend to still be present");
      }
      if (!receiverFriends.friends_ids.includes(senderUid)) {
        throw new Error("Expected new friend to be added to receiver");
      }

      console.log("  ✓ accept-appends-existing-friends PASSED");
    }

    // ========== Happy: accept-invalidates-other-pending-same-direction ==========

    if (scenario === "accept-invalidates-other-pending-same-direction") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 另一个同向 pending
      const otherMatchId = `other-match-${uuidv4()}`;
      await db.collection("matching").doc(otherMatchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(otherMatchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const otherMatchingDoc = await db.collection("matching").doc(otherMatchId).get();
      const otherMatchingData = otherMatchingDoc.data();
      if (otherMatchingData.status !== "invalidated") {
        throw new Error("Expected other matching to be invalidated, got: " + otherMatchingData.status);
      }
      if (!otherMatchingData.respond_message.includes("Automatically invalidated")) {
        throw new Error("Expected invalidation message, got: " + otherMatchingData.respond_message);
      }

      console.log("  ✓ accept-invalidates-other-pending-same-direction PASSED");
    }

    // ========== Happy: accept-invalidates-other-pending-opposite-direction ==========

    if (scenario === "accept-invalidates-other-pending-opposite-direction") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 反向 pending
      const otherMatchId = `other-match-${uuidv4()}`;
      await db.collection("matching").doc(otherMatchId).set({
        sender_id: receiverUid,
        reciever_id: senderUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(otherMatchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const otherMatchingDoc = await db.collection("matching").doc(otherMatchId).get();
      const otherMatchingData = otherMatchingDoc.data();
      if (otherMatchingData.status !== "invalidated") {
        throw new Error("Expected other matching to be invalidated, got: " + otherMatchingData.status);
      }

      console.log("  ✓ accept-invalidates-other-pending-opposite-direction PASSED");
    }

    // ========== Happy: accept-does-not-touch-rejected-invalidated ==========

    if (scenario === "accept-does-not-touch-rejected-invalidated") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 已有 rejected matching
      const rejectedMatchId = `rejected-${uuidv4()}`;
      await db.collection("matching").doc(rejectedMatchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "rejected",
        respond_message: "Rejected",
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(rejectedMatchId);

      // 已有 invalidated matching
      const invalidatedMatchId = `invalidated-${uuidv4()}`;
      await db.collection("matching").doc(invalidatedMatchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "invalidated",
        respond_message: "Invalidated",
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(invalidatedMatchId);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      // 验证 rejected matching 不变
      const rejectedMatchingDoc = await db.collection("matching").doc(rejectedMatchId).get();
      const rejectedMatchingData = rejectedMatchingDoc.data();
      if (rejectedMatchingData.status !== "rejected") {
        throw new Error("Expected rejected matching to stay rejected");
      }
      if (rejectedMatchingData.respond_message !== "Rejected") {
        throw new Error("Expected rejected respond_message to remain");
      }

      // 验证 invalidated matching 不变
      const invalidatedMatchingDoc = await db.collection("matching").doc(invalidatedMatchId).get();
      const invalidatedMatchingData = invalidatedMatchingDoc.data();
      if (invalidatedMatchingData.status !== "invalidated") {
        throw new Error("Expected invalidated matching to stay invalidated");
      }
      if (invalidatedMatchingData.respond_message !== "Invalidated") {
        throw new Error("Expected invalidated respond_message to remain");
      }

      console.log("  ✓ accept-does-not-touch-rejected-invalidated PASSED");
    }

    // ========== Happy: reject-does-not-create-friends ==========

    if (scenario === "reject-does-not-create-friends") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "rejected",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const senderFriendsDoc = await db.collection("friends").doc(senderUid).get();
      if (senderFriendsDoc.exists) {
        const senderFriends = senderFriendsDoc.data();
        if (senderFriends.friends_ids && senderFriends.friends_ids.includes(receiverUid)) {
          throw new Error("Expected sender not to have receiver as friend");
        }
      }

      console.log("  ✓ reject-does-not-create-friends PASSED");
    }

    // ========== Happy: reject-does-not-invalidate-other-pending ==========

    if (scenario === "reject-does-not-invalidate-other-pending") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      const otherMatchId = `other-${uuidv4()}`;
      await db.collection("matching").doc(otherMatchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(otherMatchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "rejected",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const otherMatchingDoc = await db.collection("matching").doc(otherMatchId).get();
      const otherMatchingData = otherMatchingDoc.data();
      if (otherMatchingData.status !== "pending") {
        throw new Error("Expected other pending to stay pending");
      }

      console.log("  ✓ reject-does-not-invalidate-other-pending PASSED");
    }

    // ========== Happy: accept-with-id-compat ==========

    if (scenario === "accept-with-id-compat") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      // 使用 id 而不是 match_id
      const result = await respondToMatchRequest({
        id: matchId,
        status: "accepted",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      const matchingDoc = await db.collection("matching").doc(matchId).get();
      const matchingData = matchingDoc.data();
      if (matchingData.status !== "accepted") {
        throw new Error("Expected status accepted");
      }

      console.log("  ✓ accept-with-id-compat PASSED");
    }

    // ========== Validation/Failure: missing-match-id ==========

    if (scenario === "missing-match-id") {
      console.log(`\nRunning scenario: ${scenario}`);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "invalid-argument") {
          throw new Error("Expected invalid-argument, got: " + code);
        }
      }

      console.log("  ✓ missing-match-id PASSED");
    }

    // ========== Validation/Failure: invalid-status ==========

    if (scenario === "invalid-status") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "cancelled",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "invalid-argument") {
          throw new Error("Expected invalid-argument, got: " + code);
        }
      }

      console.log("  ✓ invalid-status PASSED");
    }

    // ========== Validation/Failure: missing-status ==========

    if (scenario === "missing-status") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "invalid-argument") {
          throw new Error("Expected invalid-argument, got: " + code);
        }
      }

      console.log("  ✓ missing-status PASSED");
    }

    // ========== Validation/Failure: matching-not-found ==========

    if (scenario === "matching-not-found") {
      console.log(`\nRunning scenario: ${scenario}`);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          match_id: "non-existent-match-id",
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "not-found") {
          throw new Error("Expected not-found, got: " + code);
        }
      }

      console.log("  ✓ matching-not-found PASSED");
    }

    // ========== Validation/Failure: matching-not-pending-accepted ==========

    if (scenario === "matching-not-pending-accepted") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "accepted",
        respond_message: "",
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "failed-precondition") {
          throw new Error("Expected failed-precondition, got: " + code);
        }
      }

      console.log("  ✓ matching-not-pending-accepted PASSED");
    }

    // ========== Validation/Failure: matching-not-pending-rejected ==========

    if (scenario === "matching-not-pending-rejected") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "rejected",
        respond_message: "",
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "failed-precondition") {
          throw new Error("Expected failed-precondition, got: " + code);
        }
      }

      console.log("  ✓ matching-not-pending-rejected PASSED");
    }

    // ========== Validation/Failure: matching-not-pending-invalidated ==========

    if (scenario === "matching-not-pending-invalidated") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "invalidated",
        respond_message: "",
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "failed-precondition") {
          throw new Error("Expected failed-precondition, got: " + code);
        }
      }

      console.log("  ✓ matching-not-pending-invalidated PASSED");
    }

    // ========== Validation/Failure: caller-not-reciever ==========

    if (scenario === "caller-not-reciever") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建第三个用户作为 caller
      const thirdEmail = `third-${uuidv4()}@test.com`;
      const thirdAuthUser = await createUserWithEmailAndPassword(auth, thirdEmail, "123456");
      const thirdUid = thirdAuthUser.user.uid;
      registerAuthUser(thirdUid);
      await db.collection("member").doc(thirdUid).set({ status: "active", name: "Third User" });
      registerMemberDoc(thirdUid);
      registerFriendDoc(thirdUid);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 以 third user 登录
      await signInWithEmailAndPassword(auth, thirdEmail, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "permission-denied") {
          throw new Error("Expected permission-denied, got: " + code);
        }
      }

      console.log("  ✓ caller-not-reciever PASSED");
    }

    // ========== Validation/Failure: sender-cannot-respond ==========

    if (scenario === "sender-cannot-respond") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 以 sender 登录
      await signInWithEmailAndPassword(auth, senderAuthUser.user.email, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "permission-denied") {
          throw new Error("Expected permission-denied, got: " + code);
        }
      }

      console.log("  ✓ sender-cannot-respond PASSED");
    }

    // ========== Permission: unauthenticated ==========

    if (scenario === "unauthenticated") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建 matching
      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 确保未登录
      try {
        await signOut(auth);
      } catch (e) {
        // 忽略
      }

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "unauthenticated") {
          throw new Error("Expected unauthenticated, got: " + code);
        }
      }

      console.log("  ✓ unauthenticated PASSED");
    }

    // ========== Permission: member-not-found ==========

    if (scenario === "member-not-found") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建一个 Auth user 但不创建 member 文档
      const noMemberEmail = `nomember-${uuidv4()}@test.com`;
      const noMemberUser = await createUserWithEmailAndPassword(auth, noMemberEmail, "123456");
      registerAuthUser(noMemberUser.user.uid);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      // 以无 member 文档的用户登录
      await signInWithEmailAndPassword(auth, noMemberEmail, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "permission-denied") {
          throw new Error("Expected permission-denied, got: " + code);
        }
      }

      console.log("  ✓ member-not-found PASSED");
    }

    // ========== Permission: inactive-member-not-allowed ==========

    if (scenario === "inactive-member-not-allowed") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建 inactive member
      const inactiveEmail = `inactive-${uuidv4()}@test.com`;
      const inactiveAuthUser = await createUserWithEmailAndPassword(auth, inactiveEmail, "123456");
      const inactiveUserUid = inactiveAuthUser.user.uid;
      registerAuthUser(inactiveUserUid);

      await db.collection("member").doc(inactiveUserUid).set({
        status: "inactive",
        name: "Inactive User"
      });
      registerMemberDoc(inactiveUserUid);
      registerFriendDoc(inactiveUserUid);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, inactiveEmail, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "failed-precondition") {
          throw new Error("Expected failed-precondition, got: " + code);
        }
      }

      console.log("  ✓ inactive-member-not-allowed PASSED");
    }

    // ========== Permission: staff-not-allowed ==========

    if (scenario === "staff-not-allowed") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建 staff 用户（只有 admin_staff 文档，没有 member 文档）
      const staffEmail = `staff-${uuidv4()}@test.com`;
      const staffAuthUser = await createUserWithEmailAndPassword(auth, staffEmail, "123456");
      const staffUserUid = staffAuthUser.user.uid;
      registerAuthUser(staffUserUid);

      await db.collection("admin_staff").doc(staffUserUid).set({
        role: "staff",
        name: "Staff User"
      });
      registerAdminStaffDoc(staffUserUid);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, staffEmail, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "permission-denied") {
          throw new Error("Expected permission-denied, got: " + code);
        }
      }

      console.log("  ✓ staff-not-allowed PASSED");
    }

    // ========== Permission: admin-not-allowed ==========

    if (scenario === "admin-not-allowed") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 创建 admin 用户（只有 admin_staff 文档，没有 member 文档）
      const adminEmail = `admin-${uuidv4()}@test.com`;
      const adminAuthUser = await createUserWithEmailAndPassword(auth, adminEmail, "123456");
      const adminUserUid = adminAuthUser.user.uid;
      registerAuthUser(adminUserUid);

      await db.collection("admin_staff").doc(adminUserUid).set({
        role: "admin",
        name: "Admin User"
      });
      registerAdminStaffDoc(adminUserUid);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, adminEmail, "123456");

      try {
        await respondToMatchRequest({
          match_id: matchId,
          status: "accepted",
          respond_message: ""
        });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const code = normalizeErrorCode(error.code);
        if (code !== "permission-denied") {
          throw new Error("Expected permission-denied, got: " + code);
        }
      }

      console.log("  ✓ admin-not-allowed PASSED");
    }

    // ========== Security: ignores-payload-sender-id-reciever-id-member-id-role-uid ==========

    if (scenario === "ignores-payload-sender-id-reciever-id-member-id-role-uid") {
      console.log(`\nRunning scenario: ${scenario}`);

      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      // payload 中传入伪造的 sender_id / reciever_id / receiver_id
      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: "",
        sender_id: "fake-sender-id",
        reciever_id: "fake-receiver-id",
        receiver_id: "fake-correct-spelling-receiver-id",
        member_id: "fake-member-id",
        uid: "fake-uid",
        role: "fake-role"
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      // 验证 matching 中的 sender_id/reciever_id 没有被改写
      const matchingDoc = await db.collection("matching").doc(matchId).get();
      const matchingData = matchingDoc.data();
      if (matchingData.sender_id !== senderUid) {
        throw new Error("Expected sender_id to remain original");
      }
      if (matchingData.reciever_id !== receiverUid) {
        throw new Error("Expected reciever_id to remain original");
      }

      console.log("  ✓ ignores-payload-sender-id-reciever-id-member-id-role-uid PASSED");
    }

    // ========== Security: member-without-role-success ==========

    if (scenario === "member-without-role-success") {
      console.log(`\nRunning scenario: ${scenario}`);

      // 不写 role 字段
      matchId = `match-${uuidv4()}`;
      await db.collection("matching").doc(matchId).set({
        sender_id: senderUid,
        reciever_id: receiverUid,
        status: "pending",
        respond_message: "",
        completed_at: "",
        created_at: new Date().toISOString()
      });
      registerMatchingDoc(matchId);

      await signInWithEmailAndPassword(auth, receiverAuthUser.user.email, "123456");

      const result = await respondToMatchRequest({
        match_id: matchId,
        status: "accepted",
        respond_message: ""
      });

      if (!result.data.success) {
        throw new Error("Expected success");
      }

      console.log("  ✓ member-without-role-success PASSED");
    }

    // ========== 成功消息 ==========

    console.log(`\n✓ Scenario '${scenario}' PASSED`);

  } catch (error) {
    console.error(`\n✗ Scenario '${scenario}' FAILED: ${error.message}`);
    await cleanupAllTestData();
    process.exit(1);
  } finally {
    // Cleanup
    await cleanupAllTestData();
  }
}

// 运行场景
runScenario().catch((error) => {
  console.error("\n✗ Unexpected error:", error.message);
  process.exit(1);
});