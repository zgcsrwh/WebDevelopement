/**
 * Local Test Script for processBookingApproval
 *
 * 此脚本用于本地 Emulator 测试，验证 processBookingApproval 函数逻辑。
 *
 * 使用方法:
 * 1. 启动 emulators: firebase emulators:start --only auth,firestore,functions
 * 2. 在另一个终端运行 seed: node functions/scripts/seedLocalEmulator.js --member-uid=<生成的用户UID>
 * 3. 先提交一个 booking request
 * 4. 运行测试: node functions/scripts/testProcessBookingApproval.js --scenario=xxx
 *
 * 关键设计:
 * - Staff 登录后会获取真实的 Auth UID
 * - 在 Firestore 中创建/补齐 admin_staff/{kimUid}
 * - 确保 request.staff_id === kimUid
 * - 所有测试使用动态 UID，而不是硬编码
 */

// ============ 安全检查 ============

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(1);
}

// ============ 引入 ============

// Modern Firebase Client SDK
const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

// Firebase Admin SDK
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
let scenario = "approve-success"; // 默认

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// ============ 全局变量 ============

let kimUid = null; // Kim 的真实 Auth UID
let aliceUid = null; // Alice 的真实 Auth UID

// ============ 工具函数 ============

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/**
 * Normalize error code for comparison
 * Firebase Functions SDK 可能返回 "functions/invalid-argument" 格式
 * 需要去掉 "functions/" 前缀再比较
 */
function normalizeErrorCode(code) {
  if (code && code.startsWith("functions/")) {
    return code.replace("functions/", "");
  }
  return code;
}

// ============ Scenario 配置 ============

const scenarios = {
  // 成功场景
  "approve-success": {
    payload: {
      request_id: null,
      status: ["accepted"],
      staff_response: ""
    },
    preProcess: "create-staff-request",
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    checkRequestStatus: "accepted",
    checkSlotStatus: "locked" // approve 时保持 locked
  },
  "reject-success": {
    payload: {
      request_id: null,
      status: ["rejected"],
      staff_response: "场地不可用"
    },
    preProcess: "create-staff-request",
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    checkRequestStatus: "rejected",
    checkSlotStatus: "open" // reject 时释放
  },
  "suggest-success": {
    payload: {
      request_id: null,
      status: ["suggested"],
      staff_response: "建议换到其他时段"
    },
    preProcess: "create-staff-request",
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    checkRequestStatus: "suggested",
    checkSlotStatus: "open" // suggest 时释放
  },
  // 失败场景
  "unauthenticated": {
    payload: {
      request_id: "some-id",
      status: ["accepted"],
      staff_response: ""
    },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "unauthenticated",
    verifyDatabase: false,
    skipLogin: true
  },
  "not-staff": {
    payload: {
      request_id: "some-id",
      status: ["accepted"],
      staff_response: ""
    },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "permission-denied",
    verifyDatabase: false,
    loginAs: "member"
  },
  "permission-denied": {
    payload: {
      request_id: null,
      status: ["accepted"],
      staff_response: ""
    },
    preProcess: "wrong-staff",
    expectedSuccess: null,
    expectedErrorCode: "permission-denied",
    verifyDatabase: false
  },
  "request-not-found": {
    payload: {
      request_id: "non-existent-request-id",
      status: ["accepted"],
      staff_response: ""
    },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "not-found",
    verifyDatabase: false
  },
  "invalid-status": {
    payload: {
      request_id: null,
      status: ["invalid-status"],
      staff_response: ""
    },
    preProcess: "create-staff-request",
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false
  },
  "staff-response-required": {
    payload: {
      request_id: null,
      status: ["rejected"],
      staff_response: ""
    },
    preProcess: "create-staff-request",
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false
  },
  "already-processed": {
    payload: {
      request_id: null,
      status: ["accepted"],
      staff_response: ""
    },
    preProcess: "already-accepted",
    expectedSuccess: null,
    expectedErrorCode: "aborted",
    verifyDatabase: false
  },
  "slot-not-found": {
    payload: {
      request_id: null,
      status: ["rejected"],
      staff_response: "场地不可用"
    },
    preProcess: "slot-missing",
    expectedSuccess: null,
    expectedErrorCode: "failed-precondition",
    verifyDatabase: false
  }
};

// ============ 主函数 ============

async function main() {
  const tomorrowDate = getTomorrowDate();

  console.log("");
  console.log("=".repeat(60));
  console.log("processBookingApproval Test Script");
  console.log("=".repeat(60));
  console.log(`Scenario: ${scenario}`);
  console.log("");

  const currentScenario = scenarios[scenario];
  if (!currentScenario) {
    console.error(`ERROR: Unknown scenario: ${scenario}`);
    console.error("Available scenarios:", Object.keys(scenarios).join(", "));
    process.exit(1);
  }

  // ============ 0. 初始化 Staff 用户（在任何测试前） ============
  // 这一步确保 admin_staff/{kimUid} 存在
  console.log("Initializing Staff user...");

  // 尝试用 kim@test.com 登录，如果不存在则创建
  let kimUser = null;
  try {
    kimUser = await signInWithEmailAndPassword(auth, "kim@test.com", "123456");
    kimUid = kimUser.user.uid;
    console.log(`  ✓ Logged in as kim@test.com, UID: ${kimUid}`);
  } catch (error) {
    // 用户不存在，创建新用户
    if (error.code === "auth/user-not-found") {
      try {
        kimUser = await createUserWithEmailAndPassword(auth, "kim@test.com", "123456");
        kimUid = kimUser.user.uid;
        console.log(`  ✓ Created kim@test.com, UID: ${kimUid}`);
      } catch (createError) {
        console.error("ERROR: Failed to create kim@test.com:", createError.message);
        process.exit(1);
      }
    } else {
      console.error("ERROR: Login failed:", error.message);
      process.exit(1);
    }
  }

  // 在 Firestore 中创建/补齐 admin_staff/{kimUid}
  // 覆盖写入，确保 role 为 staff
  const staffRef = db.collection("admin_staff").doc(kimUid);
  await staffRef.set({
    name: "Kim Smith",
    email: "kim@test.com",
    role: "staff",
    status: "active",
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`  ✓ Created/updated admin_staff/${kimUid}`);

  // 尝试 Alice 登录，获取 UID
  let aliceUser = null;
  try {
    aliceUser = await signInWithEmailAndPassword(auth, "alice@test.com", "123456");
    aliceUid = aliceUser.user.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      aliceUser = await createUserWithEmailAndPassword(auth, "alice@test.com", "123456");
      aliceUid = aliceUser.user.uid;
    }
  }
  console.log(`  ✓ Alice UID: ${aliceUid}`);

  // 确保 alice 存在于 member 集合
  const memberRef = db.collection("member").doc(aliceUid);
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    await memberRef.set({
      name: "Alice",
      email: "alice@test.com",
      status: "active",
      profile_ID: "profile-001",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log(`  ✓ member/${aliceUid} exists`);

  // 先登出，稍后根据需要重新登录
  await signOut(auth);

  // ============ 1. 验证 seed 数据 ============
  console.log("");
  console.log("Verifying seed data...");

  // 验证 facility
  const facilityDoc = await db.collection("facility").doc("facility-001").get();
  if (!facilityDoc.exists) {
    console.error("ERROR: facility/facility-001 not found.");
    process.exit(1);
  }
  console.log("  ✓ facility/facility-001 exists");

  // ============ 2. 执行 preProcess（如果需要） ============
  if (currentScenario.preProcess === "create-staff-request") {
    console.log("Pre-processing: creating request with staff_id = kimUid...");

    // 创建 request，staff_id 必须是 kimUid（当前 Staff 的 UID）
    const requestRef = db.collection("request").doc("test-request-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: kimUid, // 关键：使用 kimUid
      status: "pending",
      date: tomorrowDate,
      start_time: "09",
      end_time: "10",
      attendant: 2,
      activity_description: "Test booking for approval",
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request: ${requestRef.id} with staff_id: ${kimUid}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${tomorrowDate}-9`);
    await slotRef.set({
      facility_id: "facility-001",
      date: tomorrowDate,
      start_time: 9,
      end_time: 10,
      status: "locked", // 预先锁定
      request_id: requestRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Locked time_slot for request: ${requestRef.id}`);

  } else if (currentScenario.preProcess === "wrong-staff") {
    console.log("Pre-processing: creating request with wrong staff_id...");

    // 创建 staff_id 不是 kimUid 的 request
    const otherStaffUid = "staff-999-other";
    const requestRef = db.collection("request").doc("test-wrong-staff-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: otherStaffUid,
      status: "pending",
      date: tomorrowDate,
      start_time: "09",
      end_time: "10",
      attendant: 2,
      activity_description: "Test wrong staff",
      participant_ids: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    currentScenario.payload.request_id = requestRef.id;
    console.log(`  ✓ Created request with staff_id: ${otherStaffUid}`);

    // 锁定 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${tomorrowDate}-9`);
    await slotRef.update({
      status: "locked",
      request_id: requestRef.id
    });
    console.log(`  ✓ Locked time_slot`);

  } else if (currentScenario.preProcess === "already-accepted") {
    console.log("Pre-processing: setting request status to accepted...");

    // 找到一个现有的 pending request
    const requestDocs = await db.collection("request")
      .where("status", "==", "pending")
      .where("facility_id", "==", "facility-001")
      .get();

    if (requestDocs.empty) {
      // 如果没有，创建新的
      const requestRef = db.collection("request").doc("test-accepted-" + Date.now());
      await requestRef.set({
        member_id: aliceUid,
        facility_id: "facility-001",
        staff_id: kimUid,
        status: "accepted",
        completed_at: "",
        date: tomorrowDate,
        start_time: "09",
        end_time: "10",
        attendant: 2,
        activity_description: "Test already accepted"
      });
      currentScenario.payload.request_id = requestRef.id;
    } else {
      const requestDoc = requestDocs.docs[0];
      await requestDoc.ref.update({
        status: "accepted",
        completed_at: ""
      });
      currentScenario.payload.request_id = requestDoc.id;
    }
    console.log(`  ✓ Set request status to accepted`);

  } else if (currentScenario.preProcess === "slot-missing") {
    console.log("Pre-processing: creating request without locked time_slot...");

    // 创建 request，但 time_slot 要么不存在，要么不是 locked
    const requestRef = db.collection("request").doc("test-no-slot-" + Date.now());
    await requestRef.set({
      member_id: aliceUid,
      facility_id: "facility-001",
      staff_id: kimUid,
      status: "pending",
      date: tomorrowDate,
      start_time: "09",
      end_time: "10",
      attendant: 2,
      activity_description: "Test no slot"
    });
    currentScenario.payload.request_id = requestRef.id;

    // time_slot 设为 open（不锁定）
    const slotRef = db.collection("time_slot").doc(`facility-001-${tomorrowDate}-9`);
    await slotRef.set({
      facility_id: "facility-001",
      date: tomorrowDate,
      start_time: 9,
      end_time: 10,
      status: "open",
      request_id: "",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✓ Created request with open time_slot`);
  }

  // ============ 3. 登录用户 ============
  if (!currentScenario.skipLogin) {
    const loginEmail = currentScenario.loginAs === "member" ? "alice@test.com" : "kim@test.com";
    const loginPassword = "123456";

    console.log(`Logging in as ${loginEmail}...`);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      console.log(`  ✓ Logged in as: ${userCredential.user.email}`);
      console.log(`  ✓ UID: ${userCredential.user.uid}`);
    } catch (error) {
      console.error("ERROR: Login failed:", error.message);
      process.exit(1);
    }
  }

  // ============ 4. 构建 payload ============
  console.log("Building payload...");

  const payload = { ...currentScenario.payload };
  console.log(`Payload (${scenario}):`, JSON.stringify(payload, null, 2));
  console.log("");

  // ============ 5. 调用 processBookingApproval ============
  console.log("Calling processBookingApproval...");

  const processBookingApprovalFn = httpsCallable(functions, "processBookingApproval");

  try {
    const result = await processBookingApprovalFn(payload);

    // ============ 6. 验证成功结果 ============
    if (currentScenario.expectedSuccess === true) {
      console.log("");
      console.log("=".repeat(60));
      console.log("Function Result:");
      console.log("=".repeat(60));
      console.log(JSON.stringify(result.data, null, 2));

      // 验证数据库变更
      if (currentScenario.verifyDatabase) {
        console.log("");
        console.log("Verifying results with Admin SDK...");

        // 检查 request 状态
        const requestDoc = await db.collection("request").doc(payload.request_id).get();
        if (!requestDoc.exists) {
          console.error("ERROR: Request not found!");
          process.exit(1);
        }

        const requestData = requestDoc.data();
        const actualStatus = requestData.status;
        const expectedStatus = currentScenario.checkRequestStatus;

        if (actualStatus !== expectedStatus) {
          console.error(`ERROR: Request status is "${actualStatus}", expected "${expectedStatus}"`);
          process.exit(1);
        }
        console.log(`  ✓ Request status: ${actualStatus}`);

        // 检查 time_slot 状态
        const slotRef = db.collection("time_slot").doc(`facility-001-${tomorrowDate}-9`);
        const slotDoc = await slotRef.get();

        if (slotDoc.exists) {
          const slotData = slotDoc.data();
          const actualSlotStatus = slotData.status;
          const expectedSlotStatus = currentScenario.checkSlotStatus;

          if (actualSlotStatus !== expectedSlotStatus) {
            console.error(`ERROR: time_slot status is "${actualSlotStatus}", expected "${expectedSlotStatus}"`);
            process.exit(1);
          }
          console.log(`  ✓ time_slot status: ${actualSlotStatus}`);
        }

        // 检查 notification
        const notifDocs = await db.collection("notification")
          .where("reference_id", "==", payload.request_id)
          .get();

        if (!notifDocs.empty) {
          console.log(`  ✓ ${notifDocs.size} notification(s) created`);
        }
      }

      console.log("");
      console.log("=".repeat(60));
      console.log(`TEST PASSED: ${scenario}`);
      console.log("=".repeat(60));
      process.exit(0);
    }

  } catch (error) {
    // ============ 7. 验证失败结果 ============
    if (currentScenario.expectedErrorCode) {
      const errorCode = normalizeErrorCode(error.code);
      const expectedCode = currentScenario.expectedErrorCode;

      if (errorCode === expectedCode) {
        console.log("");
        console.log("Function Error:");
        console.log(`  Code: ${errorCode}`);
        console.log(`  Message: ${error.message}`);

        console.log("");
        console.log("=".repeat(60));
        console.log(`TEST PASSED: ${scenario} (got expected error: ${expectedCode})`);
        console.log("=".repeat(60));
        process.exit(0);
      } else {
        console.error("");
        console.error("ERROR: Unexpected error code!");
        console.error(`  Expected: ${expectedCode}`);
        console.error(`  Got: ${errorCode}`);
        console.error(`  Message: ${error.message}`);
        process.exit(1);
      }
    }

    // 未预期的错误
    console.error("");
    console.error("ERROR: Unexpected error!");
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    process.exit(1);
  }
}

// 运行
main().catch((error) => {
  console.error("Test script failed:", error);
  process.exit(1);
});