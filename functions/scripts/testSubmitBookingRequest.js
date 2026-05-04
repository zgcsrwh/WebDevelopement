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
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

// Firebase Admin SDK (用于验证结果)
const admin = require("firebase-admin");

// 本地时间工具
const { getLondonDateOffset, getLondonDateHourFromInstant } = require("../utils/time");

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

// 使用 Europe/London 日期
function getTomorrowDate() {
  return getLondonDateOffset(1);
}

function getDateString(daysOffset = 0) {
  return getLondonDateOffset(daysOffset);
}

/**
 * 获取当前 instant + hourOffset 小时后的 London date 和 hour
 */
function getLondonDateHourAfterHours(hourOffset) {
  const now = new Date();
  const targetInstant = new Date(now.getTime() + hourOffset * 60 * 60 * 1000);
  const { date, hour } = getLondonDateHourFromInstant(targetInstant);
  return { date, hour: parseInt(hour, 10) };
}

/**
 * 获取当前 London 时间信息
 */
function getCurrentLondonInfo() {
  const { date, hour } = getLondonDateHourFromInstant(new Date());
  return { date, hour: parseInt(hour, 10) };
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
    startTime: 9,
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    needsTimeSlot: true,
    needsOpenSlot: true
  },
  "success-iso-date": {
    payload: {
      facility_id: "facility-001",
      date: null, // 运行时填充 ISO date，如 "2026-05-03T00:00:00.000Z"
      start_time: "10:00", // 字符串格式
      end_time: "11:00",   // 字符串格式
      attendent: 2,
      activity_description: "Test booking with ISO date"
    },
    preProcess: null,
    startTime: 10,
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    checkRequestDateNormalized: true,
    needsTimeSlot: true,
    needsOpenSlot: true
  },
  "locked-slot": {
    payload: {
      facility_id: "facility-001",
      date: null,
      start_time: 12,
      end_time: 13,
      attendent: 2,
      activity_description: "Test locked slot"
    },
    preProcess: "locked-slot",
    startTime: 12,
    expectedSuccess: null,
    expectedErrorCode: "resource-exhausted",
    verifyDatabase: false,
    needsTimeSlot: true,
    needsOpenSlot: false
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
    startTime: 9,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false,
    needsTimeSlot: true,
    needsOpenSlot: true
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
    startTime: 9,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false,
    needsTimeSlot: true,
    needsOpenSlot: true
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
    startTime: 9, // 仍需要一个基础 slot 数据存在，但不会验证其状态
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false,
    needsTimeSlot: true,
    needsOpenSlot: false
  },
  // ============ 新增 scenario：2 小时提前规则 ============
  "past-date": {
    payload: {
      facility_id: "facility-001",
      date: null, // 运行时填充昨天
      start_time: 9,
      end_time: 10,
      attendent: 2,
      activity_description: "Test past date"
    },
    preProcess: null,
    startTime: 9,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false,
    needsTimeSlot: false,
    needsOpenSlot: false,
    expectedErrorMessage: "Date must be between today and 7 days from now"
  },
  "past-time-today": {
    payload: {
      facility_id: "facility-001",
      date: null, // 运行时填充今天
      start_time: null, // 动态计算 currentHour - 1
      end_time: null,
      attendent: 2,
      activity_description: "Test past time today"
    },
    preProcess: null,
    startTime: null, // 动态
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false,
    needsTimeSlot: false,
    needsOpenSlot: false,
    expectedErrorMessage: "Bookings must be made at least 2 hours in advance."
  },
  "within-2-hours": {
    payload: {
      facility_id: "facility-001",
      date: null, // 运行时填充 tomorrow 11:00
      start_time: 11,
      end_time: 12,
      attendent: 2,
      activity_description: "Test within 2 hours"
    },
    preProcess: null,
    startTime: 11,
    expectedSuccess: null,
    expectedErrorCode: "invalid-argument",
    verifyDatabase: false,
    needsTimeSlot: true,
    needsOpenSlot: true,
    expectedErrorMessage: "Bookings must be made at least 2 hours in advance."
  },
  "more-than-2-hours-before": {
    payload: {
      facility_id: "facility-001",
      date: null, // 运行时填充 tomorrow 09:00
      start_time: 9,
      end_time: 10,
      attendent: 2,
      activity_description: "Test more than 2 hours before"
    },
    preProcess: null,
    startTime: 9,
    expectedSuccess: true,
    expectedErrorCode: null,
    verifyDatabase: true,
    needsTimeSlot: true,
    needsOpenSlot: true
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
    console.error("Available scenarios: success, success-iso-date, locked-slot, over-capacity, duration-too-long, date-out-of-range, past-date, past-time-today, within-2-hours, more-than-2-hours-before");
    process.exit(1);
  }

  console.log(`Scenario: ${scenario}`);
  console.log("");

  // ============ 0. 初始化用户（在 Auth 中创建或登录） ============
  console.log("Initializing user...");

  let aliceUser = null;
  let aliceUid = null;

  try {
    aliceUser = await signInWithEmailAndPassword(auth, "alice@test.com", "123456");
    aliceUid = aliceUser.user.uid;
    console.log(`  ✓ Logged in as alice@test.com, UID: ${aliceUid}`);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      aliceUser = await createUserWithEmailAndPassword(auth, "alice@test.com", "123456");
      aliceUid = aliceUser.user.uid;
      console.log(`  ✓ Created alice@test.com, UID: ${aliceUid}`);
    } else {
      console.error("ERROR: Login failed:", error.message);
      process.exit(1);
    }
  }

  // 校验 member/{uid} 是否存在
  const memberRef = db.collection("member").doc(aliceUid);
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    console.error(`ERROR: member/${aliceUid} not found. Run seedLocalEmulator.js --member-uid=${aliceUid} first.`);
    process.exit(1);
  }
  console.log(`  ✓ member/${aliceUid} exists, status: ${memberDoc.data().status}`);

  // ============ 0.5. 准备测试数据（对需要新 slot 的 scenario） ============
  // 在检查 seed 数据之前就重置，避免检查时发现 slot 被占用而失败
  const prepConfig = scenarios[scenario];
  if (prepConfig && prepConfig.needsOpenSlot) {
    console.log("Preparing test data...");

    // 确定使用的日期和时间（从 scenario config 读取）
    const testDate = scenario === "success-iso-date"
      ? tomorrowDate + "T00:00:00.000Z"
      : tomorrowDate;
    const normalizedTestDate = testDate.includes("T") ? testDate.split("T")[0] : testDate;
    const testStartTime = prepConfig.startTime || 9;

    // 清理旧的测试 request
    const oldRequests = await db.collection("request")
      .where("member_id", "==", aliceUid)
      .where("facility_id", "==", "facility-001")
      .where("date", "==", normalizedTestDate)
      .where("status", "in", ["pending", "accepted"])
      .get();

    for (const reqDoc of oldRequests.docs) {
      const reqData = reqDoc.data();
      if (reqData.activity_description && reqData.activity_description.includes("Test booking")) {
        await reqDoc.ref.delete();
        const oldNotifs = await db.collection("notification")
          .where("reference_id", "==", reqDoc.id)
          .get();
        for (const notifDoc of oldNotifs.docs) {
          await notifDoc.ref.delete();
        }
      }
    }

    // 重置 time_slot
    const slotRef = db.collection("time_slot").doc(`facility-001-${normalizedTestDate}-${testStartTime}`);
    const slotDoc = await slotRef.get();
    if (slotDoc.exists) {
      await slotRef.update({
        status: "open",
        request_id: "",
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`  ✓ Reset time_slot/${slotRef.id} to open`);
    }
    console.log("  ✓ Test data prepared");
  }

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

  // 根据 scenario 确定要检查的 start_time
  const scenarioConfig = scenarios[scenario];

  // 从 scenario config 读取 start_time（不是硬编码判断）
  // date-out-of-range 不需要检查 time_slot
  const verifyStartTime = scenarioConfig.needsTimeSlot !== false ? (scenarioConfig.startTime || 9) : null;

  // 检查 time_slot（如果需要）
  if (verifyStartTime !== null) {
    const slotQuery = await db.collection("time_slot")
      .where("facility_id", "==", "facility-001")
      .where("date", "==", tomorrowDate)
      .where("start_time", "==", verifyStartTime)
      .get();

    if (slotQuery.empty) {
      console.error(`ERROR: time_slot for date ${tomorrowDate} start ${verifyStartTime} not found. Run seed script first.`);
      process.exit(1);
    }

    const slotData = slotQuery.docs[0].data();
    console.log(`  ✓ time_slot exists (status: ${slotData.status})`);

    // 检查 scenario 是否需要 time_slot 为 open 状态（只有 success 类需要）
    // locked-slot 需要 slot 为 locked，over-capacity 等只做参数校验
    if (scenarioConfig.needsOpenSlot && slotData.status !== "open") {
      console.error(`ERROR: time_slot status is "${slotData.status}", expected "open" for success scenario.`);
      console.error("Please re-run seed script to reset time_slot status.");
      process.exit(1);
    }
  }

  console.log("");
  console.log("Seed data verified. Ready to test submitBookingRequest.");
  console.log("");

  // ============ 2. 执行 preProcess（如果需要） ============
  if (prepConfig && prepConfig.preProcess === "locked-slot") {
    console.log("Pre-processing: setting time_slot to locked...");
    // 使用固定 slot：tomorrow 12:00，避免依赖 dynamicSlotInfo
    const lockedSlotDate = getLondonDateOffset(1);
    const lockedSlotTime = 12;
    const slotId = `facility-001-${lockedSlotDate}-${lockedSlotTime}`;
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
  } else if (scenario === "past-date") {
    payload.date = getLondonDateOffset(-1); // yesterday
  } else if (scenario === "past-time-today") {
    // 动态时间场景，在后面处理
    payload.date = null;
  } else if (scenario === "success-iso-date") {
    // ISO 格式：如 "2026-05-03T00:00:00.000Z"，后端会标准化为 "2026-05-03"
    payload.date = tomorrowDate + "T00:00:00.000Z";
  } else {
    payload.date = tomorrowDate;
  }

  // ============ 动态时间场景处理（需要在 normalizedDate 之前） ============
  let dynamicSlotInfo = null;

  if (scenario === "past-time-today") {
    const now = getCurrentLondonInfo();
    // 边界情况：如果当前 hour 是 0，没有"更早的小时"，跳过测试
    if (now.hour === 0) {
      console.log("WARNING: Current London hour is 0, cannot test past-time-today. Skipping this scenario.");
      console.log("Use past-date scenario instead to test past date rejection.");
      process.exit(0);
    }
    const pastHour = now.hour - 1;
    payload.date = now.date;
    payload.start_time = pastHour;
    payload.end_time = pastHour + 1;
    dynamicSlotInfo = { date: now.date, startTime: pastHour };
  } else if (scenario === "within-2-hours") {
    // 使用稳定时间：tomorrow 11:00（在 facility 营业时间内，但不足以满足 2 小时要求）
    payload.date = getLondonDateOffset(1);
    payload.start_time = 11;
    payload.end_time = 12;
    dynamicSlotInfo = { date: getLondonDateOffset(1), startTime: 11 };
  } else if (scenario === "more-than-2-hours-before") {
    // 使用稳定时间：tomorrow 09:00（确保在 facility 营业时间内）
    payload.date = getLondonDateOffset(1);
    payload.start_time = 9;
    payload.end_time = 10;
    dynamicSlotInfo = { date: getLondonDateOffset(1), startTime: 9 };
  } else if (scenario === "locked-slot") {
    // 使用固定 slot：tomorrow 12:00，避免和 success 冲突
    payload.date = getLondonDateOffset(1);
    payload.start_time = 12;
    payload.end_time = 13;
    dynamicSlotInfo = { date: getLondonDateOffset(1), startTime: 12 };
  }

  // 标准化后的 date（用于数据库验证查询）
  const normalizedDate = payload.date.includes("T") ? payload.date.split("T")[0] : payload.date;

  // 如果有动态 slot 信息，更新 scenarioConfig.startTime 用于后续验证
  if (dynamicSlotInfo && scenarioConfig) {
    scenarioConfig.startTime = dynamicSlotInfo.startTime;
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

        // 5.1 检查 request 是否新增（使用 normalizedDate 查询）
        const requestDocs = await db.collection("request")
          .where("facility_id", "==", "facility-001")
          .where("date", "==", normalizedDate)
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

        // 5.2 检查 time_slot 是否变成 locked（使用 normalizedDate 查询）
        const verifyStartTime = dynamicSlotInfo ? dynamicSlotInfo.startTime : (payload.start_time || 9);
        const lockedSlotQuery = await db.collection("time_slot")
          .where("facility_id", "==", "facility-001")
          .where("date", "==", normalizedDate)
          .where("start_time", "==", verifyStartTime)
          .get();

        if (lockedSlotQuery.empty) {
          console.error("ERROR: time_slot not found!");
          process.exit(1);
        }

        const lockedSlotData = lockedSlotQuery.docs[0].data();
        console.log(`  ✓ time_slot status changed to: ${lockedSlotData.status}`);
        console.log(`    - request_id: ${lockedSlotData.request_id}`);

        // 验证 time_slot.request_id 必须等于当前 request_id
        if (lockedSlotData.request_id !== requestId) {
          console.error("ERROR: time_slot.request_id does not match request_id!");
          console.error(`  Expected: ${requestId}`);
          console.error(`  Got: ${lockedSlotData.request_id}`);
          process.exit(1);
        }

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
        // 可选：验证 error message
        if (config.expectedErrorMessage && !error.message.includes(config.expectedErrorMessage)) {
          console.error("ERROR: Error message does not match.");
          console.error("Expected message to contain:", config.expectedErrorMessage);
          console.error("Got:", error.message);
          process.exit(1);
        }
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