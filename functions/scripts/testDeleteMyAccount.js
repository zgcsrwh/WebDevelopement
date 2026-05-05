/**
 * testDeleteMyAccount.js
 *
 * 本地测试脚本 for deleteMyAccount Cloud Function
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/testDeleteMyAccount.js --scenario=delete-success-basic
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
let scenario = "delete-success-basic";

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// --list 在解析参数后立即处理
if (args.includes("--list")) {
  console.log("\nAvailable scenarios:");
  console.log("\nHappy:");
  console.log("  delete-success-basic");
  console.log("  delete-success-with-profile-notification");
  console.log("  delete-success-invalidates-matching");
  console.log("  delete-success-updates-friends");
  console.log("  delete-success-anonymizes-repair");
  console.log("  delete-success-ignores-terminal-requests");
  console.log("\nFailure:");
  console.log("  unauthenticated");
  console.log("  member-not-found");
  console.log("  staff-not-supported");
  console.log("  admin-not-supported");
  console.log("  blocked-own-pending-request");
  console.log("  blocked-participant-pending-request");
  console.log("\nSecurity:");
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

// ============ Scenario 配置 ============

const scenarios = {
  // ============ Happy ============
  "delete-success-basic": {
    description: "Basic delete - success",
    payload: (ctx) => ({}),
    preProcess: "create-member-basic",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return !memberDoc.exists;
    },
    verifyAuthDeleted: true,
  },

  "delete-success-with-profile-notification": {
    description: "Delete with profile and notification - success",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-profile-notification",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const profileDocs = await db.collection("profile").where("member_id", "==", ctx.staffId).get();
      const notifDocs = await db.collection("notification").where("member_id", "==", ctx.staffId).get();
      return profileDocs.empty && notifDocs.empty;
    },
    verifyAuthDeleted: true,
  },

  "delete-success-invalidates-matching": {
    description: "Delete invalidates matching - success",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-matching",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const match1 = await db.collection("matching").doc(ctx.matchIds[0]).get();
      const match2 = await db.collection("matching").doc(ctx.matchIds[1]).get();
      if (!match1.exists || !match2.exists) return false;
      return match1.data().status === "invalidated" &&
             match2.data().status === "invalidated" &&
             match1.data().respond_message === "User account deleted." &&
             match2.data().respond_message === "User account deleted.";
    },
    verifyAuthDeleted: true,
  },

  "delete-success-updates-friends": {
    description: "Delete updates friends - success",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-friends",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const friendsDoc = await db.collection("friends").doc(ctx.staffId).get();
      const friendsOther = await db.collection("friends").doc(ctx.friendIds[0]).get();
      if (friendsDoc.exists) return false;
      if (!friendsOther.exists) return false;
      const otherData = friendsOther.data();
      return !otherData.friends_ids.includes(ctx.staffId);
    },
    verifyAuthDeleted: true,
  },

  "delete-success-anonymizes-repair": {
    description: "Delete anonymizes repair - success",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-repair",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const repairDoc = await db.collection("repair").doc(ctx.repairIds[0]).get();
      if (!repairDoc.exists) return false;
      const data = repairDoc.data();
      return data.member_id === "" &&
             data.reporter_deleted === true &&
             data.reporter_name === "Deleted user" &&
             data.status === "pending" &&
             data.facility_id === "test-facility";
    },
    verifyAuthDeleted: true,
  },

  "delete-success-ignores-terminal-requests": {
    description: "Delete ignores terminal requests - success",
    payload: (ctx) => ({}),
    preProcess: "create-member-with-terminal-requests",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return !memberDoc.exists;
    },
    verifyAuthDeleted: true,
  },

  // ============ Failure ============
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
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return !memberDoc.exists;
    },
    verifyAuthStillExists: true,
  },

  "staff-not-supported": {
    description: "Staff not supported for self-deletion",
    payload: (ctx) => ({}),
    preProcess: "create-staff",
    cleanup: true,
    expectedError: "permission-denied",
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return !memberDoc.exists;
    },
    verifyAuthStillExists: true,
  },

  "admin-not-supported": {
    description: "Admin not supported for self-deletion",
    payload: (ctx) => ({}),
    preProcess: "create-admin",
    cleanup: true,
    expectedError: "permission-denied",
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return !memberDoc.exists;
    },
    verifyAuthStillExists: true,
  },

  "blocked-own-pending-request": {
    description: "Own request status=pending - blocked",
    payload: (ctx) => ({}),
    preProcess: "create-own-pending-request",
    cleanup: true,
    expectedError: "failed-precondition",
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return memberDoc.exists;
    },
    verifyAuthStillExists: true,
  },

  "blocked-participant-pending-request": {
    description: "As participant status=pending - blocked",
    payload: (ctx) => ({}),
    preProcess: "create-participant-pending-request",
    cleanup: true,
    expectedError: "failed-precondition",
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      return memberDoc.exists;
    },
    verifyAuthStillExists: true,
  },

  // ============ Security ============
  "ignores-payload-identity": {
    description: "Payload identity fields ignored",
    payload: (ctx) => ({ uid: "fake-uid", role: "Admin", member_id: "fake-member", staff_id: "fake-staff", email: "fake@example.com" }),
    preProcess: "create-member-basic",
    cleanup: true,
    expectedSuccess: true,
    verifyDatabase: async (ctx) => {
      const memberDoc = await db.collection("member").doc(ctx.staffId).get();
      // 删除了当前用户 member
      return !memberDoc.exists;
    },
    verifyAuthDeleted: true,
  },
};

// ============ PreProcess 函数 ============

const preProcesses = {
  "create-member-basic": async (ctx) => {
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
    ctx.profileIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId}`);
  },

  "create-member-with-profile-notification": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const profileId = `dma-profile-${uuidv4()}`;
    await db.collection("profile").doc(profileId).set({
      member_id: staffId,
      name: "Test Profile"
    });

    const notifId = `dma-notif-${uuidv4()}`;
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
    ctx.profileIds = [profileId];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with profile and notification`);
  },

  "create-member-with-matching": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const matchId1 = `dma-match-${uuidv4()}`;
    await db.collection("matching").doc(matchId1).set({
      sender_id: staffId,
      receiver_id: "other-user",
      status: "pending"
    });

    const matchId2 = `dma-match-${uuidv4()}`;
    await db.collection("matching").doc(matchId2).set({
      sender_id: "other-user",
      reciever_id: staffId,
      status: "pending"
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.profileIds = [];
    ctx.matchIds = [matchId1, matchId2];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with matching`);
  },

  "create-member-with-friends": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    await db.collection("friends").doc(staffId).set({
      friends_ids: ["other-user-1", "other-user-2"]
    });

    const friendDocId = `dma-friends-${uuidv4()}`;
    await db.collection("friends").doc(friendDocId).set({
      friends_ids: [staffId, "other-user-3"]
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [];
    ctx.repairIds = [];
    ctx.notificationIds = [];
    ctx.profileIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [friendDocId];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with friends`);
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

    const repairId = `dma-repair-${uuidv4()}`;
    await db.collection("repair").doc(repairId).set({
      member_id: staffId,
      status: "pending",
      facility_id: "test-facility",
      repair_description: "Broken equipment",
      name: "Test User",
      email: email
    });

    ctx.staffId = staffId;
    ctx.memberIds = [staffId];
    ctx.adminStaffIds = [];
    ctx.requestIds = [];
    ctx.repairIds = [repairId];
    ctx.notificationIds = [];
    ctx.profileIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with repair`);
  },

  "create-member-with-terminal-requests": async (ctx) => {
    const email = `test-${uuidv4()}@example.com`;
    await createUserWithEmailAndPassword(auth, email, "test-password-123");
    const staffId = auth.currentUser.uid;

    await db.collection("member").doc(staffId).set({
      name: "Test Member",
      email: email,
      status: "active",
      role: "Member"
    });

    const requestId = `dma-req-${uuidv4()}`;
    await db.collection("request").doc(requestId).set({
      member_id: staffId,
      status: "completed",
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
    ctx.profileIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with terminal request`);
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
    ctx.profileIds = [];
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
    ctx.profileIds = [];
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
    ctx.profileIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created admin ${staffId}`);
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

    const requestId = `dma-req-${uuidv4()}`;
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
    ctx.profileIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created member ${staffId} with pending request`);
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

    const otherMemberId = "other-member-" + uuidv4().slice(0, 8);

    const requestId = `dma-req-${uuidv4()}`;
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
    ctx.profileIds = [];
    ctx.matchIds = [];
    ctx.friendIds = [];
    ctx.authUsers = [email];

    console.log(`  ✓ Created pending request with participant ${staffId}`);
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
  profileIds: [],
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
    const deleteMyAccountCallable = httpsCallable(functions, "deleteMyAccount");
    console.log("Calling deleteMyAccount...");

    let result;
    try {
      result = await deleteMyAccountCallable(config.payload(ctx));

      // 检查是否有错误但 call 成功的情况
      if (config.expectedError) {
        throw new Error(`Expected error ${config.expectedError}, but got success`);
      }

      // 验证返回值
      if (config.expectedSuccess) {
        if (result.data.success !== true) {
          throw new Error(`Expected success=true, got ${result.data.success}`);
        }

        console.log(`  ✓ success: ${result.data.success}`);
      }

      // 验证数据库
      if (config.verifyDatabase) {
        const verified = await config.verifyDatabase(ctx);
        if (!verified) {
          throw new Error("Database verification failed");
        }
        console.log("  ✓ Database verification passed");
      }

      // 验证 Auth 删除
      if (config.verifyAuthDeleted) {
        const authDeleted = await verifyAuthDeleted(ctx.staffId);
        if (!authDeleted) {
          throw new Error("Auth user should be deleted");
        }
        console.log("  ✓ Auth user deleted");
      }

    } catch (error) {
      // 处理 callable 抛出的错误
      const errorCode = normalizeErrorCode(error.code);

      if (config.expectedError) {
        if (errorCode === config.expectedError) {
          console.log(`  ✓ Got expected error: ${errorCode}`);
          console.log(`  ✓ Error message: ${error.message}`);

          // expectedError 场景也要执行 verifyDatabase
          if (config.verifyDatabase) {
            const verified = await config.verifyDatabase(ctx);
            if (!verified) {
              throw new Error("Database verification failed after expected error");
            }
            console.log("  ✓ Database verification passed after expected error");
          }

          // expectedError 场景也要执行 verifyAuthStillExists
          if (config.verifyAuthStillExists && ctx.staffId) {
            const authStillExists = await verifyAuthStillExists(ctx.staffId);
            if (!authStillExists) {
              throw new Error("Auth user should still exist after blocked delete");
            }
            console.log("  ✓ Auth user still exists after expected error");
          }
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

    // 6. 删除 profile
    for (const id of ctx.profileIds || []) {
      await db.collection("profile").doc(id).delete().catch(() => {});
    }

    // 7. 删除 matching
    for (const id of ctx.matchIds || []) {
      await db.collection("matching").doc(id).delete().catch(() => {});
    }

    // 8. 删除 friends
    for (const id of ctx.friendIds || []) {
      await db.collection("friends").doc(id).delete().catch(() => {});
    }

    // 9. 删除自己的 friends doc (如果存在)
    if (ctx.staffId) {
      await db.collection("friends").doc(ctx.staffId).delete().catch(() => {});
    }

    // 10. 删除 Auth 用户
    if (config.verifyAuthStillExists) {
      // failure 场景：尝试删除 Auth user
      for (const email of ctx.authUsers || []) {
        await deleteAuthUser(email);
      }
      // 也尝试删除 ctx.staffId
      if (ctx.staffId) {
        await deleteAuthUserByUid(ctx.staffId);
      }
    } else {
      // success 场景：可能已删除，忽略错误
      for (const email of ctx.authUsers || []) {
        await deleteAuthUser(email).catch(() => {});
      }
      if (ctx.staffId) {
        await deleteAuthUserByUid(ctx.staffId).catch(() => {});
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