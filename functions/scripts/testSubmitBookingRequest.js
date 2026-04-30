/**
 * Local Test Script for submitBookingRequest
 *
 * 此脚本用于本地 Emulator 测试，验证 submitBookingRequest 函数逻辑。
 *
 * 使用方法:
 * 1. 启动 emulators: firebase emulators:start --only auth,firestore,functions
 * 2. 在另一个终端运行 seed: node functions/scripts/seedLocalEmulator.js --member-uid=<生成的用户UID>
 * 3. 运行测试: node functions/scripts/testSubmitBookingRequest.js
 */

// ============ 安全检查 ============

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(1);
}

// ============ 引入 ============

// Modern Firebase Client SDK (使用主项目已有的 firebase ^12.11.0)
const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require("firebase/auth");
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
let scenario = "success"; // 默认

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    scenario = arg.replace("--scenario=", "");
  }
}

// ============ 工具函数 ============

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function getDateString(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
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
  "success": {
    payload: {
      facility_id: "facility-001",
      date: null, // 运行时填充
      start_time: 9,
      end_time: 10,
      attendent: 2,
      activity_description: "Test booking"
    },
    preProcess: null,
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true
  },
  "locked-slot": {
    payload: {
      facility_id: "facility-001",
      date: null,
      start_time: 9,
      end_time: 10,
      attendent: 2,
      activity_description: "Test locked slot"
    },
    preProcess: "locked-slot",
    expectedSuccess: null,
    expectedErrorCode: "resource-exhausted",
    verifyDatabase: false
  },
  "over-capacity": {
    payload: {
      facility_id: "facility-001",
      date: null,
      start_time: 9,
      end_time: 10,
      attendent: 5, // facility.capacity = 4
      activity_description: "Test over capacity"
    },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false
  },
  "duration-too-long": {
    payload: {
      facility_id: "facility-001",
      date: null,
      start_time: 9,
      end_time: 14, // 5 hours > 4 hours
      attendent: 2,
      activity_description: "Test duration too long"
    },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false
  },
  "date-out-of-range": {
    payload: {
      facility_id: "facility-001",
      date: null, // 运行时填充 getDateString(8)
      start_time: 9,
      end_time: 10,
      attendent: 2,
      activity_description: "Test date out of range"
    },
    preProcess: null,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false
  }
};

// ============ 主测试函数 ============

async function testSubmitBookingRequest() {
  const tomorrowDate = getTomorrowDate();

  // ============ 验证 scenario 参数 ============
  console.log("");
  console.log("=".repeat(60));
  console.log("Testing submitBookingRequest (Local Emulator)");
  console.log("=".repeat(60));
  console.log("");

  if (!scenarios[scenario]) {
    console.error(`ERROR: Unknown scenario: ${scenario}`);
    console.error("Available scenarios: success, locked-slot, over-capacity, duration-too-long, date-out-of-range");
    process.exit(1);
  }

  console.log(`Scenario: ${scenario}`);
  console.log("");

  // ============ 1. 检查 seed 数据是否存在 ============
  console.log("Checking seed data...");

  const facilityDoc = await db.collection("facility").doc("facility-001").get();
  if (!facilityDoc.exists) {
    console.error("ERROR: facility/facility-001 not found. Run seed script first.");
    process.exit(1);
  }
  console.log("  ✓ facility/facility-001 exists");

  const staffDoc = await db.collection("admin_staff").doc("staff-001").get();
  if (!staffDoc.exists) {
    console.error("ERROR: admin_staff/staff-001 not found. Run seed script first.");
    process.exit(1);
  }
  console.log("  ✓ admin_staff/staff-001 exists");

  const memberDocs = await db.collection("member").limit(1).get();
  if (memberDocs.empty) {
    console.error("ERROR: No member found. Run seed script with --member-uid first.");
    process.exit(1);
  }
  const memberUid = memberDocs.docs[0].id;
  const memberData = memberDocs.docs[0].data();
  console.log(`  ✓ member/${memberUid} exists (status: ${memberData.status})`);

  // 检查 time_slot
  const slotQuery = await db.collection("time_slot")
    .where("facility_id", "==", "facility-001")
    .where("date", "==", tomorrowDate)
    .where("start_time", "==", 9)
    .get();

  if (slotQuery.empty) {
    console.error(`ERROR: time_slot for date ${tomorrowDate} not found. Run seed script first.`);
    process.exit(1);
  }

  const slotData = slotQuery.docs[0].data();
  console.log(`  ✓ time_slot exists (status: ${slotData.status})`);

  // 检查 scenario 是否需要 time_slot 为 open 状态
  const currentScenario = scenarios[scenario];
  if (currentScenario.verifyDatabase && slotData.status !== "open") {
    console.error(`ERROR: time_slot status is "${slotData.status}", expected "open" for success scenario.`);
    console.error("Please re-run seed script to reset time_slot status.");
    process.exit(1);
  }

  console.log("");
  console.log("Seed data verified. Ready to test submitBookingRequest.");
  console.log("");

  // ============ 2. 执行 preProcess（如果需要） ============
  if (currentScenario.preProcess === "locked-slot") {
    console.log("Pre-processing: setting time_slot to locked...");
    // 使用与 seedLocalEmulator.js 一致的 doc ID 格式
    const slotId = `facility-001-${tomorrowDate}-9`;
    const slotRef = db.collection("time_slot").doc(slotId);
    await slotRef.update({
      status: "locked",
      request_id: "some-other-request-id"
    });
    console.log("  ✓ Pre-processed: time_slot set to locked");
    console.log("");
  }

  // ============ 3. 登录 Auth Emulator ============
  console.log("Logging in to Auth Emulator...");
  console.log("  Email: alice@test.com");

  try {
    const userCredential = await signInWithEmailAndPassword(auth, "alice@test.com", "123456");
    console.log(`  ✓ Logged in as: ${userCredential.user.email}`);
    console.log(`  ✓ UID: ${userCredential.user.uid}`);
  } catch (error) {
    console.error("ERROR: Login failed:", error.message);
    console.error("Make sure to create user alice@test.com / 123456 in Auth Emulator first.");
    process.exit(1);
  }

  // ============ 3. 构建 payload ============
  console.log("Building payload...");

  const config = scenarios[scenario];
  const payload = { ...config.payload };

  // 动态填充 date 字段
  if (scenario === "date-out-of-range") {
    payload.date = getDateString(8); // today + 8
  } else {
    payload.date = tomorrowDate;
  }

  console.log(`Payload (${scenario}):`, JSON.stringify(payload, null, 2));
  console.log("");

  // ============ 4. 调用 submitBookingRequest ============
  console.log("Calling submitBookingRequest...");

  const submitBookingRequest = httpsCallable(functions, "submitBookingRequest");

  try {
    const result = await submitBookingRequest(payload);

    // ============ 5. 验证成功结果 ============
    if (config.expectedSuccess === true) {
      console.log("");
      console.log("=".repeat(60));
      console.log("Function Result:");
      console.log("=".repeat(60));
      console.log(JSON.stringify(result.data, null, 2));

      // 只对 success scenario 验证数据库变更
      if (config.verifyDatabase) {
        console.log("");
        console.log("Verifying results with Admin SDK...");

        // 5.1 检查 request 是否新增
        const requestDocs = await db.collection("request")
          .where("facility_id", "==", "facility-001")
          .where("date", "==", payload.date)
          .get();

        if (requestDocs.empty) {
          console.error("ERROR: No request created!");
          process.exit(1);
        }

        const requestData = requestDocs.docs[0].data();
        const requestId = requestDocs.docs[0].id;
        console.log(`  ✓ request/${requestId} created`);
        console.log(`    - status: ${requestData.status}`);
        console.log(`    - member_id: ${requestData.member_id}`);
        console.log(`    - date: ${requestData.date}`);
        console.log(`    - start_time: ${requestData.start_time}`);
        console.log(`    - end_time: ${requestData.end_time}`);

        // 5.2 检查 time_slot 是否变成 locked
        const lockedSlotQuery = await db.collection("time_slot")
          .where("facility_id", "==", "facility-001")
          .where("date", "==", payload.date)
          .where("start_time", "==", 9)
          .get();

        if (lockedSlotQuery.empty) {
          console.error("ERROR: time_slot not found!");
          process.exit(1);
        }

        const lockedSlotData = lockedSlotQuery.docs[0].data();
        console.log(`  ✓ time_slot status changed to: ${lockedSlotData.status}`);
        console.log(`    - request_id: ${lockedSlotData.request_id}`);

        // 5.3 检查 notification 是否新增
        const notificationDocs = await db.collection("notification")
          .where("related_id", "==", requestId)
          .get();

        console.log(`  ✓ notification/ created: ${notificationDocs.size} documents`);
        for (const notifDoc of notificationDocs.docs) {
          const notifData = notifDoc.data();
          console.log(`    - recipient_id: ${notifData.recipient_id}, type: ${notifData.type}`);
        }
      }

      console.log("");
      console.log("=".repeat(60));
      console.log("TEST PASSED");
      console.log("=".repeat(60));
      console.log("");

    } else {
      // 意外成功（预期失败但实际成功）
      console.error("ERROR: Expected error but function succeeded:", JSON.stringify(result.data));
      process.exit(1);
    }

  } catch (error) {
    // ============ 6. 验证失败结果 ============
    if (config.expectedErrorCode) {
      const normalizedCode = normalizeErrorCode(error.code);
      if (normalizedCode === config.expectedErrorCode) {
        console.log("");
        console.log("=".repeat(60));
        console.log("Function Result (Expected Error):");
        console.log("=".repeat(60));
        console.log("  Raw Code:", error.code);
        console.log("  Normalized Code:", normalizedCode);
        console.log("  Message:", error.message);
        console.log("");
        console.log("TEST PASSED");
        console.log("=".repeat(60));
        console.log("");
      } else {
        console.error("ERROR: Unexpected error code:", error.code);
        console.error("Expected:", config.expectedErrorCode);
        console.error("Got:", error.message);
        process.exit(1);
      }
    } else {
      // 意外失败（预期成功但实际失败）
      console.error("ERROR: Function call failed:");
      console.error("  Code:", error.code);
      console.error("  Message:", error.message);
      console.error("  Details:", error.details);
      process.exit(1);
    }
  }

  process.exit(0);
}

// 运行
testSubmitBookingRequest().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});