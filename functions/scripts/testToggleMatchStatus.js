/**
 * testToggleMatchStatus.js
 *
 * 本地测试脚本 for toggleMatchStatus Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testToggleMatchStatus.js --scenario=enable-matching-success
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
  projectId: "learnfire-e5720"
});

const db = admin.firestore();
const adminAuth = getAdminAuth();
const { v4: uuidv4 } = require("uuid");

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
let scenario = "enable-matching-success";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// --list 在解析参数后立即处理
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");

  console.log("\nHappy:");
  console.log("  enable-matching-success");
  console.log("  disable-matching-success");
  console.log("  disable-invalidates-sent-pending");
  console.log("  disable-invalidates-received-pending");
  console.log("  disable-invalidates-both-directions-and-dedupes");
  console.log("  disable-does-not-touch-accepted-rejected-invalidated");
  console.log("  enable-does-not-restore-invalidated");
  console.log("  disable-does-not-touch-friends-or-notifications");

  console.log("\nValidation/Failure:");
  console.log("  missing-open-match");
  console.log("  non-boolean-open-match-string");
  console.log("  non-boolean-open-match-number");
  console.log("  profile-not-found");

  console.log("\nPermission:");
  console.log("  unauthenticated");
  console.log("  member-not-found");
  console.log("  inactive-member-not-allowed");
  console.log("  staff-not-allowed");
  console.log("  admin-not-allowed");

  console.log("\nSecurity:");
  console.log("  ignores-payload-member-id-role-uid");

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
  "enable-matching-success": {
    description: "Enable matching - success",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-member-with-profile-closed",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const data = profileDoc.data();
      if (data.open_match !== true) {
        throw new Error(`open_match should be true, got ${data.open_match}`);
      }
      if (!data.last_updated) {
        throw new Error("last_updated should exist");
      }
      if (Number.isNaN(Date.parse(data.last_updated))) {
        throw new Error(`last_updated should be parseable date: ${data.last_updated}`);
      }
      return true;
    },
  },

  "disable-matching-success": {
    description: "Disable matching - success",
    payload: (ctx) => ({
      open_match: false,
    }),
    preProcess: "create-member-with-profile-open",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const data = profileDoc.data();
      if (data.open_match !== false) {
        throw new Error(`open_match should be false, got ${data.open_match}`);
      }
      if (!data.last_updated) {
        throw new Error("last_updated should exist");
      }
      if (Number.isNaN(Date.parse(data.last_updated))) {
        throw new Error(`last_updated should be parseable date: ${data.last_updated}`);
      }
      return true;
    },
  },

  "disable-invalidates-sent-pending": {
    description: "Disable matching - invalidates sent pending",
    payload: (ctx) => ({
      open_match: false,
    }),
    preProcess: "create-member-with-profile-open-and-sent-pending",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify profile
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const profileData = profileDoc.data();
      if (profileData.open_match !== false) {
        throw new Error(`open_match should be false, got ${profileData.open_match}`);
      }

      // Verify matching invalidated
      const matchingDoc = await db.collection("matching").doc(ctx.matchingId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const matchingData = matchingDoc.data();
      if (matchingData.status !== "invalidated") {
        throw new Error(`matching status should be invalidated, got ${matchingData.status}`);
      }
      if (matchingData.respond_message !== "Automatically invalidated because matching was closed.") {
        throw new Error(`respond_message incorrect: ${matchingData.respond_message}`);
      }
      if (!matchingData.updated_at) {
        throw new Error("updated_at should exist");
      }

      return true;
    },
  },

  "disable-invalidates-received-pending": {
    description: "Disable matching - invalidates received pending",
    payload: (ctx) => ({
      open_match: false,
    }),
    preProcess: "create-member-with-profile-open-and-received-pending",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify profile
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const profileData = profileDoc.data();
      if (profileData.open_match !== false) {
        throw new Error(`open_match should be false, got ${profileData.open_match}`);
      }

      // Verify matching invalidated
      const matchingDoc = await db.collection("matching").doc(ctx.matchingId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const matchingData = matchingDoc.data();
      if (matchingData.status !== "invalidated") {
        throw new Error(`matching status should be invalidated, got ${matchingData.status}`);
      }

      return true;
    },
  },

  "disable-invalidates-both-directions-and-dedupes": {
    description: "Disable matching - invalidates both directions and dedupes",
    payload: (ctx) => ({
      open_match: false,
    }),
    preProcess: "create-member-with-profile-open-and-both-directions-pending",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify profile
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const profileData = profileDoc.data();
      if (profileData.open_match !== false) {
        throw new Error(`open_match should be false, got ${profileData.open_match}`);
      }

      // Verify matching invalidated (only one, deduped)
      const matchingDoc = await db.collection("matching").doc(ctx.matchingId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      const matchingData = matchingDoc.data();
      if (matchingData.status !== "invalidated") {
        throw new Error(`matching status should be invalidated, got ${matchingData.status}`);
      }

      return true;
    },
  },

  "disable-does-not-touch-accepted-rejected-invalidated": {
    description: "Disable matching - does not touch accepted/rejected/invalidated",
    payload: (ctx) => ({
      open_match: false,
    }),
    preProcess: "create-member-with-profile-open-and-various-matching",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify profile
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const profileData = profileDoc.data();
      if (profileData.open_match !== false) {
        throw new Error(`open_match should be false, got ${profileData.open_match}`);
      }

      // Verify accepted matching unchanged
      const acceptedDoc = await db.collection("matching").doc(ctx.matchingIds.accepted).get();
      if (!acceptedDoc.exists) {
        throw new Error("accepted matching should exist");
      }
      if (acceptedDoc.data().status !== "accepted") {
        throw new Error("accepted status should not change");
      }
      if (acceptedDoc.data().respond_message === "Automatically invalidated because matching was closed.") {
        throw new Error("respond_message should not be overwritten for accepted");
      }

      // Verify rejected matching unchanged
      const rejectedDoc = await db.collection("matching").doc(ctx.matchingIds.rejected).get();
      if (!rejectedDoc.exists) {
        throw new Error("rejected matching should exist");
      }
      if (rejectedDoc.data().status !== "rejected") {
        throw new Error("rejected status should not change");
      }

      // Verify invalidated matching unchanged
      const invalidatedDoc = await db.collection("matching").doc(ctx.matchingIds.invalidated).get();
      if (!invalidatedDoc.exists) {
        throw new Error("invalidated matching should exist");
      }
      if (invalidatedDoc.data().status !== "invalidated") {
        throw new Error("invalidated status should not change");
      }

      return true;
    },
  },

  "enable-does-not-restore-invalidated": {
    description: "Enable matching - does not restore invalidated",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-member-with-profile-closed-and-invalidated-matching",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify profile
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const profileData = profileDoc.data();
      if (profileData.open_match !== true) {
        throw new Error(`open_match should be true, got ${profileData.open_match}`);
      }

      // Verify matching still invalidated
      const matchingDoc = await db.collection("matching").doc(ctx.matchingId).get();
      if (!matchingDoc.exists) {
        throw new Error("matching document should exist");
      }
      if (matchingDoc.data().status !== "invalidated") {
        throw new Error(`matching status should still be invalidated, got ${matchingDoc.data().status}`);
      }

      return true;
    },
  },

  "disable-does-not-touch-friends-or-notifications": {
    description: "Disable matching - does not touch friends or notifications",
    payload: (ctx) => ({
      open_match: false,
    }),
    preProcess: "create-member-with-profile-open-friends-and-notifications",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify profile
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should exist");
      }
      const profileData = profileDoc.data();
      if (profileData.open_match !== false) {
        throw new Error(`open_match should be false, got ${profileData.open_match}`);
      }

      // Verify friends unchanged
      if (ctx.friendId) {
        const friendDoc = await db.collection("friends").doc(ctx.friendId).get();
        if (!friendDoc.exists) {
          throw new Error("friends document should still exist");
        }
      }

      // Verify notifications unchanged
      if (ctx.notificationId) {
        const notificationDoc = await db.collection("notification").doc(ctx.notificationId).get();
        if (!notificationDoc.exists) {
          throw new Error("notification document should still exist");
        }
      }

      return true;
    },
  },

  // ============ Validation/Failure ============
  "missing-open-match": {
    description: "Missing open_match - invalid-argument",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-profile-open",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "non-boolean-open-match-string": {
    description: "Non-boolean open_match (string) - invalid-argument",
    payload: (ctx) => ({
      open_match: "true",
    }),
    preProcess: "create-member-with-profile-open",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "non-boolean-open-match-number": {
    description: "Non-boolean open_match (number) - invalid-argument",
    payload: (ctx) => ({
      open_match: 1,
    }),
    preProcess: "create-member-with-profile-open",
    cleanup: true,
    expectedError: "invalid-argument",
  },

  "profile-not-found": {
    description: "Profile not found - failed-precondition",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-member-without-profile",
    cleanup: true,
    expectedError: "failed-precondition",
  },

  // ============ Permission ============
  "unauthenticated": {
    description: "Unauthenticated - unauthenticated error",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-member-with-profile-open",
    cleanup: true,
    expectedError: "unauthenticated",
  },

  "member-not-found": {
    description: "Member not found - permission-denied error",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-member-no-member-doc",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "inactive-member-not-allowed": {
    description: "Inactive member not allowed - failed-precondition error",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-inactive-member-with-profile",
    cleanup: true,
    expectedError: "failed-precondition",
    verifyDatabase: async (ctx) => {
      // Verify profile unchanged
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("profile document should still exist");
      }
      if (profileDoc.data().open_match !== false) {
        throw new Error("profile open_match should not change");
      }

      // Verify matching unchanged
      if (ctx.matchingId) {
        const matchingDoc = await db.collection("matching").doc(ctx.matchingId).get();
        if (matchingDoc.exists && matchingDoc.data().status !== "pending") {
          throw new Error("matching status should not change");
        }
      }

      return true;
    },
  },

  "staff-not-allowed": {
    description: "Staff not allowed - permission-denied error",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-staff-caller",
    cleanup: true,
    expectedError: "permission-denied",
  },

  "admin-not-allowed": {
    description: "Admin not allowed - permission-denied error",
    payload: (ctx) => ({
      open_match: true,
    }),
    preProcess: "create-admin-caller",
    cleanup: true,
    expectedError: "permission-denied",
  },

  // ============ Security ============
  "ignores-payload-member-id-role-uid": {
    description: "Ignores payload member_id/role/uid - security",
    payload: (ctx) => ({
      open_match: false,
      member_id: ctx.otherMemberUid,
      uid: ctx.otherMemberUid,
      role: "Admin",
      status: "active",
    }),
    preProcess: "create-member-with-profile-open-other-member-matching",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      // Verify caller's profile disabled
      const profileDoc = await db.collection("profile").doc(ctx.profileId).get();
      if (!profileDoc.exists) {
        throw new Error("caller profile should exist");
      }
      if (profileDoc.data().open_match !== false) {
        throw new Error("caller open_match should be false");
      }

      // Verify other member's profile unchanged
      const otherProfileDoc = await db.collection("profile").doc(ctx.otherProfileId).get();
      if (!otherProfileDoc.exists) {
        throw new Error("other profile should exist");
      }
      if (otherProfileDoc.data().open_match !== true) {
        throw new Error("other member open_match should not change");
      }

      // Verify caller's pending matching invalidated
      if (ctx.matchingId) {
        const matchingDoc = await db.collection("matching").doc(ctx.matchingId).get();
        if (!matchingDoc.exists) {
          throw new Error("caller matching should exist");
        }
        if (matchingDoc.data().status !== "invalidated") {
          throw new Error("caller matching should be invalidated");
        }
      }

      // Verify other member's matching unchanged
      if (ctx.otherMatchingId) {
        const otherMatchingDoc = await db.collection("matching").doc(ctx.otherMatchingId).get();
        if (!otherMatchingDoc.exists) {
          throw new Error("other matching should exist");
        }
        if (otherMatchingDoc.data().status !== "pending") {
          throw new Error("other matching status should not change");
        }
      }

      return true;
    },
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-member-with-profile-closed": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    // member 文档本身代表 Member 身份，没有 role 字段
    // role 只存在于 admin_staff，用来区分 Staff/Admin
    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: false,
      last_updated: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingIds = [];

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: false)`);
  },

  "create-member-with-profile-open": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingIds = [];

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: true)`);
  },

  "create-member-without-profile": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${memberUid} (no profile)`);
  },

  "create-member-with-profile-open-and-sent-pending": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create sent pending matching
    const matchingId = `matching-${uuidv4()}`;
    const otherMemberUid = `other-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: memberUid,
      reciever_id: otherMemberUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid, otherMemberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingId = matchingId;

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: true)`);
    console.log(`  ✓ Created sent pending matching ${matchingId}`);
  },

  "create-member-with-profile-open-and-received-pending": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create received pending matching
    const matchingId = `matching-${uuidv4()}`;
    const otherMemberUid = `other-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: otherMemberUid,
      reciever_id: memberUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid, otherMemberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingId = matchingId;

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: true)`);
    console.log(`  ✓ Created received pending matching ${matchingId}`);
  },

  "create-member-with-profile-open-and-both-directions-pending": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create matching where sender_id and reciever_id are both memberUid
    const matchingId = `matching-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: memberUid,
      reciever_id: memberUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingId = matchingId;

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: true)`);
    console.log(`  ✓ Created both-directions matching ${matchingId}`);
  },

  "create-member-with-profile-open-and-various-matching": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const otherMemberUid = `other-${uuidv4()}`;
    const acceptedMatchingId = `matching-accepted-${uuidv4()}`;
    const rejectedMatchingId = `matching-rejected-${uuidv4()}`;
    const invalidatedMatchingId = `matching-invalidated-${uuidv4()}`;

    await db.collection("matching").doc(acceptedMatchingId).set({
      sender_id: memberUid,
      reciever_id: otherMemberUid,
      status: "accepted",
      respond_message: "Nice!",
      created_at: new Date().toISOString(),
    });

    await db.collection("matching").doc(rejectedMatchingId).set({
      sender_id: memberUid,
      reciever_id: otherMemberUid,
      status: "rejected",
      respond_message: "No thanks",
      created_at: new Date().toISOString(),
    });

    await db.collection("matching").doc(invalidatedMatchingId).set({
      sender_id: memberUid,
      reciever_id: otherMemberUid,
      status: "invalidated",
      respond_message: "Old message",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid, otherMemberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingIds = {
      accepted: acceptedMatchingId,
      rejected: rejectedMatchingId,
      invalidated: invalidatedMatchingId,
    };

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: true)`);
    console.log(`  ✓ Created various matching (accepted, rejected, invalidated)`);
  },

  "create-member-with-profile-closed-and-invalidated-matching": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: false,
      last_updated: new Date().toISOString(),
    });

    // Create invalidated matching
    const matchingId = `matching-${uuidv4()}`;
    const otherMemberUid = `other-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: memberUid,
      reciever_id: otherMemberUid,
      status: "invalidated",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid, otherMemberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingId = matchingId;

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: false)`);
    console.log(`  ✓ Created invalidated matching ${matchingId}`);
  },

  "create-member-with-profile-open-friends-and-notifications": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    const friendId = `friend-${uuidv4()}`;
    await db.collection("friends").doc(friendId).set({
      member_id: memberUid,
      friend_id: "friend-member-id",
      status: "active",
      created_at: new Date().toISOString(),
    });

    const notificationId = `notif-${uuidv4()}`;
    await db.collection("notification").doc(notificationId).set({
      member_id: memberUid,
      type: "test",
      status: "unread",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.friendId = friendId;
    ctx.notificationId = notificationId;

    console.log(`  ✓ Created member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: true)`);
    console.log(`  ✓ Created friend ${friendId}`);
    console.log(`  ✓ Created notification ${notificationId}`);
  },

  "create-inactive-member-with-profile": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "inactive",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: false,
      last_updated: new Date().toISOString(),
    });

    const matchingId = `matching-${uuidv4()}`;
    const otherMemberUid = `other-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: memberUid,
      reciever_id: otherMemberUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid, otherMemberUid];
    ctx.profileId = profileId;
    ctx.authUsers = [email];
    ctx.matchingId = matchingId;

    console.log(`  ✓ Created inactive member ${memberUid}`);
    console.log(`  ✓ Created profile ${profileId} (open_match: false)`);
    console.log(`  ✓ Created pending matching ${matchingId}`);
  },

  "create-member-no-member-doc": async (ctx) => {
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;
    // 注意：这里不创建 member/{uid} 文档

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.authUsers = [email];

    console.log(`  ✓ Created auth user ${memberUid} (no member doc)`);
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
    ctx.email = email;
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
    ctx.email = email;
    ctx.adminStaffIds = [adminUid];
    ctx.authUsers = [email];

    console.log(`  ✓ Created admin ${adminUid}`);
  },

  "create-member-with-profile-open-other-member-matching": async (ctx) => {
    // Create caller member
    const email = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const memberUid = auth.currentUser.uid;

    await db.collection("member").doc(memberUid).set({
      name: "Test Member",
      email: email,
      status: "active",
    });

    const profileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: memberUid,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create caller's pending matching
    const matchingId = `matching-${uuidv4()}`;
    const otherMemberUid = `other-${uuidv4()}`;
    await db.collection("matching").doc(matchingId).set({
      sender_id: memberUid,
      reciever_id: otherMemberUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    // Create other member (the one payload tries to target)
    const otherEmail = generateUniqueEmail();
    await createUserWithEmailAndPassword(auth, otherEmail, "test-password-123");
    const otherMemberUid2 = auth.currentUser.uid;

    await db.collection("member").doc(otherMemberUid2).set({
      name: "Other Member",
      email: otherEmail,
      status: "active",
      role: "Member",
    });

    const otherProfileId = `profile-${uuidv4()}`;
    await db.collection("profile").doc(otherProfileId).set({
      member_id: otherMemberUid2,
      open_match: true,
      last_updated: new Date().toISOString(),
    });

    // Create other member's pending matching (unrelated to caller)
    const otherMatchingId = `matching-${uuidv4()}`;
    const unrelatedMemberUid = `unrelated-${uuidv4()}`;
    await db.collection("matching").doc(otherMatchingId).set({
      sender_id: otherMemberUid2,
      reciever_id: unrelatedMemberUid,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    ctx.memberUid = memberUid;
    ctx.email = email;
    ctx.memberIds = [memberUid, otherMemberUid2];
    ctx.profileId = profileId;
    ctx.authUsers = [email, otherEmail];
    ctx.matchingId = matchingId;
    ctx.otherMemberUid = otherMemberUid2;
    ctx.otherProfileId = otherProfileId;
    ctx.otherMatchingId = otherMatchingId;

    console.log(`  ✓ Created caller member ${memberUid}`);
    console.log(`  ✓ Created caller profile ${profileId} (open_match: true)`);
    console.log(`  ✓ Created caller pending matching ${matchingId}`);
    console.log(`  ✓ Created other member ${otherMemberUid2}`);
    console.log(`  ✓ Created other profile ${otherProfileId} (open_match: true)`);
    console.log(`  ✓ Created other pending matching ${otherMatchingId}`);
  },
};

// ============ 全局上下文 ============

const config = scenarios[scenario];
const ctx = {
  memberUid: null,
  email: null,
  profileId: null,
  memberIds: [],
  adminStaffIds: [],
  authUsers: [],
  matchingId: null,
  matchingIds: {},
  friendId: null,
  notificationId: null,
  staffUid: null,
  adminUid: null,
  otherMemberUid: null,
  otherProfileId: null,
  otherMatchingId: null,
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
      await signInWithEmailAndPassword(auth, ctx.email, "test-password-123");
    }

    // 调用 callable
    const toggleMatchStatusCallable = httpsCallable(functions, "toggleMatchStatus");
    console.log("Calling toggleMatchStatus...");

    let result;
    try {
      result = await toggleMatchStatusCallable(config.payload(ctx));

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
    // 1. 删除 profile docs
    if (ctx.profileId) {
      await db.collection("profile").doc(ctx.profileId).delete().catch(() => {});
    }
    if (ctx.otherProfileId) {
      await db.collection("profile").doc(ctx.otherProfileId).delete().catch(() => {});
    }

    // 2. 删除 matching docs
    if (ctx.matchingId) {
      await db.collection("matching").doc(ctx.matchingId).delete().catch(() => {});
    }
    if (ctx.otherMatchingId) {
      await db.collection("matching").doc(ctx.otherMatchingId).delete().catch(() => {});
    }
    if (ctx.matchingIds) {
      for (const id of Object.values(ctx.matchingIds)) {
        await db.collection("matching").doc(id).delete().catch(() => {});
      }
    }

    // 3. 删除 friends
    if (ctx.friendId) {
      await db.collection("friends").doc(ctx.friendId).delete().catch(() => {});
    }

    // 4. 删除 notifications
    if (ctx.notificationId) {
      await db.collection("notification").doc(ctx.notificationId).delete().catch(() => {});
    }

    // 5. 删除 member
    for (const id of ctx.memberIds || []) {
      await db.collection("member").doc(id).delete().catch(() => {});
    }

    // 6. 删除 admin_staff
    for (const id of ctx.adminStaffIds || []) {
      await db.collection("admin_staff").doc(id).delete().catch(() => {});
    }

    // 7. 删除 Auth users
    for (const email of ctx.authUsers || []) {
      try {
        const user = await adminAuth.getUserByEmail(email);
        if (user) {
          await adminAuth.deleteUser(user.uid);
        }
      } catch (e) {
        // 用户不存在，忽略
      }
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