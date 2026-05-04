/**
 * testScheduledBookingJobs.js - 测试 sendBookingReminders 和 settleNoShowBookings
 *
 * 用法（从项目根目录运行）：
 *   # Reminder 测试
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=reminder-success
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=reminder-already-sent
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=reminder-status-not-accepted
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=reminder-target-miss
 *
 *   # No-show 测试
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=no-show-success
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=no-show-already-in-progress
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=no-show-status-not-accepted
 *   node functions/scripts/testScheduledBookingJobs.js --scenario=no-show-target-miss
 *
 * 需要先启动 Firebase Emulator:
 *   firebase emulators:start --only functions,firestore,auth
 */

// ============ 安全检查 ============

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(1);
}

// ============ 引入 ============

const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// ============ Firebase Admin SDK 初始化 ============

admin.initializeApp({
  projectId: "learnfire-e5720"
});

const db = admin.firestore();

// ============ 引入待测模块 ============

const { getReminderTarget } = require("../utils/time");
const { getNoShowTarget } = require("../utils/time");
const { processBookingReminders } = require("../sendBookingReminders");
const { processNoShowSettlements } = require("../settleNoShowBookings");

// 测试用固定时间：2026-05-02T08:00:00Z (London 09:00 BST)
// 这样 getReminderTarget(now) 会返回 targetDate="2026-05-02", targetHour="11"
const FIXED_NOW = new Date("2026-05-02T08:00:00Z");

// 测试用户
const TEST_EMAIL = "alice@test.com";
const TEST_STAFF_ID = "staff_001";

// 测试状态变量
let testMemberId = null;
let createdAuthUser = false;

// ============ 辅助函数 ============

async function ensureAuthUser() {
  // 先按 email 查找用户
  try {
    const user = await admin.auth().getUserByEmail(TEST_EMAIL);
    testMemberId = user.uid;
    console.log("  Existing auth user found by email");
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      // 不存在，创建新用户
      const user = await admin.auth().createUser({
        email: TEST_EMAIL,
        password: "123456",
      });
      testMemberId = user.uid;
      createdAuthUser = true;
      console.log("  Auth user created");
    } else {
      throw e;
    }
  }

  return testMemberId;
}

async function cleanupTestData(requestId) {
  // 删除 request
  if (requestId) {
    try {
      await db.collection("request").doc(requestId).delete();
    } catch (e) {
      // ignore
    }
  }

  // 删除 notification（按 reference_id）
  if (requestId) {
    try {
      const notifSnapshot = await db
        .collection("notification")
        .where("reference_id", "==", requestId)
        .get();
      const batch = db.batch();
      notifSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (e) {
      // ignore
    }
  }

  // 删除 member
  if (testMemberId) {
    try {
      await db.collection("member").doc(testMemberId).delete();
    } catch (e) {
      // ignore
    }
  }

  // 删除 staff
  try {
    await db.collection("admin_staff").doc(TEST_STAFF_ID).delete();
  } catch (e) {
    // ignore
  }

  // 仅删除本测试创建的 Auth 用户
  if (createdAuthUser && testMemberId) {
    try {
      await admin.auth().deleteUser(testMemberId);
    } catch (e) {
      // ignore if not found
    }
  }

  // 重置状态
  testMemberId = null;
  createdAuthUser = false;
}

// ============ 测试场景 ============

async function testReminderSuccess() {
  let requestId = null;
  console.log("\n=== Test: reminder-success ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getReminderTarget(FIXED_NOW);

    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;

    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: targetHour,
      end_time: String(parseInt(targetHour) + 1).padStart(2, "0"),
      status: "accepted",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId}`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute
    const result = await processBookingReminders(FIXED_NOW);
    console.log("Result:", result);

    // Verify
    const requestDoc = await db.collection("request").doc(requestId).get();
    const updatedRequest = requestDoc.data();

    if (!updatedRequest.reminder_sent_at) {
      throw new Error("FAIL: reminder_sent_at not set");
    }

    if (result.reminded !== 1) {
      throw new Error(`FAIL: expected reminded=1, got ${result.reminded}`);
    }

    const notifSnapshot = await db
      .collection("notification")
      .where("reference_id", "==", requestId)
      .get();

    if (notifSnapshot.size !== 1) {
      throw new Error(`FAIL: expected 1 notification, got ${notifSnapshot.size}`);
    }

    const notif = notifSnapshot.docs[0].data();
    if (!notif.message.includes("2 hours")) {
      throw new Error("FAIL: notification message incorrect");
    }

    console.log("PASS: reminder-success");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

async function testReminderAlreadySent() {
  let requestId = null;
  console.log("\n=== Test: reminder-already-sent ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getReminderTarget(FIXED_NOW);

    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;

    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: targetHour,
      end_time: String(parseInt(targetHour) + 1).padStart(2, "0"),
      status: "accepted",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      reminder_sent_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId} (reminder_sent_at already exists)`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute
    const result = await processBookingReminders(FIXED_NOW);
    console.log("Result:", result);

    // Verify: scanned=1 but skipped=1, not reminded
    if (result.scanned !== 1) {
      throw new Error(`FAIL: expected scanned=1, got ${result.scanned}`);
    }

    if (result.skipped !== 1) {
      throw new Error(`FAIL: expected skipped=1, got ${result.skipped}`);
    }

    if (result.reminded !== 0) {
      throw new Error(`FAIL: expected reminded=0, got ${result.reminded}`);
    }

    console.log("PASS: reminder-already-sent");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

async function testReminderStatusNotAccepted() {
  let requestId = null;
  console.log("\n=== Test: reminder-status-not-accepted ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getReminderTarget(FIXED_NOW);

    // 创建 pending request（不会被 query 扫描到）
    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;

    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: targetHour,
      end_time: String(parseInt(targetHour) + 1).padStart(2, "0"),
      status: "pending",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId} (status=pending)`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute: pending request 不会被 status==accepted 的查询扫描到
    const result = await processBookingReminders(FIXED_NOW);
    console.log("Result:", result);

    // Verify: scanned=0 because query filters by status==accepted
    if (result.scanned !== 0) {
      throw new Error(`FAIL: expected scanned=0, got ${result.scanned}`);
    }

    if (result.reminded !== 0) {
      throw new Error(`FAIL: expected reminded=0, got ${result.reminded}`);
    }

    // 验证 request 未被修改
    const requestDoc = await db.collection("request").doc(requestId).get();
    const updatedRequest = requestDoc.data();

    if (updatedRequest.reminder_sent_at) {
      throw new Error("FAIL: reminder_sent_at should not be set");
    }

    if (updatedRequest.status !== "pending") {
      throw new Error("FAIL: status should remain pending");
    }

    console.log("PASS: reminder-status-not-accepted");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

async function testReminderTargetMiss() {
  let requestId = null;
  console.log("\n=== Test: reminder-target-miss ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getReminderTarget(FIXED_NOW);

    // 创建 accepted request，但 start_time 是 targetHour + 1（不在扫描范围内）
    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;
    const wrongHour = String(parseInt(targetHour) + 1).padStart(2, "0");

    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: wrongHour, // 不匹配 targetHour
      end_time: String(parseInt(wrongHour) + 1).padStart(2, "0"),
      status: "accepted",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId} (start_time=${wrongHour}, not ${targetHour})`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute
    const result = await processBookingReminders(FIXED_NOW);
    console.log("Result:", result);

    // Verify: scanned=0 because start_time doesn't match
    if (result.scanned !== 0) {
      throw new Error(`FAIL: expected scanned=0, got ${result.scanned}`);
    }

    if (result.reminded !== 0) {
      throw new Error(`FAIL: expected reminded=0, got ${result.reminded}`);
    }

    // 验证 request 未被修改
    const requestDoc = await db.collection("request").doc(requestId).get();
    const updatedRequest = requestDoc.data();

    if (updatedRequest.reminder_sent_at) {
      throw new Error("FAIL: reminder_sent_at should not be set");
    }

    if (updatedRequest.status !== "accepted") {
      throw new Error("FAIL: status should remain accepted");
    }

    console.log("PASS: reminder-target-miss");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

// ============ No-show 测试场景 ============

async function testNoShowSuccess() {
  let requestId = null;
  console.log("\n=== Test: no-show-success ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getNoShowTarget(FIXED_NOW);

    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;

    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: targetHour,
      end_time: String(parseInt(targetHour) + 1).padStart(2, "0"),
      status: "accepted",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId}`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute
    const result = await processNoShowSettlements(FIXED_NOW);
    console.log("Result:", result);

    // Verify
    const requestDoc = await db.collection("request").doc(requestId).get();
    const updatedRequest = requestDoc.data();

    if (updatedRequest.status !== "no_show") {
      throw new Error(`FAIL: expected status=no_show, got ${updatedRequest.status}`);
    }

    if (!updatedRequest.completed_at) {
      throw new Error("FAIL: completed_at not set");
    }

    if (!updatedRequest.updated_at) {
      throw new Error("FAIL: updated_at not set");
    }

    if (result.settled !== 1) {
      throw new Error(`FAIL: expected settled=1, got ${result.settled}`);
    }

    const notifSnapshot = await db
      .collection("notification")
      .where("reference_id", "==", requestId)
      .get();

    if (notifSnapshot.size !== 1) {
      throw new Error(`FAIL: expected 1 notification, got ${notifSnapshot.size}`);
    }

    const notif = notifSnapshot.docs[0].data();
    if (notif.type !== "facility_request") {
      throw new Error(`FAIL: expected type=facility_request, got ${notif.type}`);
    }

    if (notif.status_context !== "no_show") {
      throw new Error(`FAIL: expected status_context=no_show, got ${notif.status_context}`);
    }

    if (notif.member_id !== testMemberId) {
      throw new Error(`FAIL: expected member_id=${testMemberId}, got ${notif.member_id}`);
    }

    if (notif.is_read !== false) {
      throw new Error(`FAIL: expected is_read=false, got ${notif.is_read}`);
    }

    console.log("PASS: no-show-success");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

async function testNoShowAlreadyInProgress() {
  let requestId = null;
  console.log("\n=== Test: no-show-already-in-progress ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getNoShowTarget(FIXED_NOW);

    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;

    // 创建 in_progress request（不会被 status==accepted 的 query 扫描到）
    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: targetHour,
      end_time: String(parseInt(targetHour) + 1).padStart(2, "0"),
      status: "in_progress",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId} (status=in_progress)`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute
    const result = await processNoShowSettlements(FIXED_NOW);
    console.log("Result:", result);

    // Verify: scanned=0 because query filters by status==accepted
    if (result.scanned !== 0) {
      throw new Error(`FAIL: expected scanned=0, got ${result.scanned}`);
    }

    if (result.settled !== 0) {
      throw new Error(`FAIL: expected settled=0, got ${result.settled}`);
    }

    // 验证 request 未被修改
    const requestDoc = await db.collection("request").doc(requestId).get();
    const updatedRequest = requestDoc.data();

    if (updatedRequest.status !== "in_progress") {
      throw new Error("FAIL: status should remain in_progress");
    }

    if (updatedRequest.completed_at) {
      throw new Error("FAIL: completed_at should not be set");
    }

    console.log("PASS: no-show-already-in-progress");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

async function testNoShowStatusNotAccepted() {
  let requestId = null;
  console.log("\n=== Test: no-show-status-not-accepted ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getNoShowTarget(FIXED_NOW);

    // 创建 cancelled request（不会被 status==accepted 的 query 扫描到）
    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;

    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: targetHour,
      end_time: String(parseInt(targetHour) + 1).padStart(2, "0"),
      status: "cancelled",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId} (status=cancelled)`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute
    const result = await processNoShowSettlements(FIXED_NOW);
    console.log("Result:", result);

    // Verify: scanned=0 because query filters by status==accepted
    if (result.scanned !== 0) {
      throw new Error(`FAIL: expected scanned=0, got ${result.scanned}`);
    }

    if (result.settled !== 0) {
      throw new Error(`FAIL: expected settled=0, got ${result.settled}`);
    }

    // 验证 request 未被修改
    const requestDoc = await db.collection("request").doc(requestId).get();
    const updatedRequest = requestDoc.data();

    if (updatedRequest.status !== "cancelled") {
      throw new Error("FAIL: status should remain cancelled");
    }

    if (updatedRequest.completed_at) {
      throw new Error("FAIL: completed_at should not be set");
    }

    console.log("PASS: no-show-status-not-accepted");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

async function testNoShowTargetMiss() {
  let requestId = null;
  console.log("\n=== Test: no-show-target-miss ===");

  try {
    // Setup
    await ensureAuthUser();

    await db.collection("member").doc(testMemberId).set({
      email: TEST_EMAIL,
      first_name: "Alice",
      last_name: "Test",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("admin_staff").doc(TEST_STAFF_ID).set({
      email: "staff@test.com",
      role: "Staff",
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    });

    const { targetDate, targetHour } = getNoShowTarget(FIXED_NOW);

    // 创建 accepted request，但 start_time 是 targetHour + 1（不在扫描范围内）
    const requestRef = db.collection("request").doc();
    requestId = requestRef.id;
    const wrongHour = String(parseInt(targetHour) + 1).padStart(2, "0");

    await requestRef.set({
      member_id: testMemberId,
      facility_id: "facility_001",
      date: targetDate,
      start_time: wrongHour, // 不匹配 targetHour
      end_time: String(parseInt(wrongHour) + 1).padStart(2, "0"),
      status: "accepted",
      payment_status: "paid",
      staff_id: TEST_STAFF_ID,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created request: ${requestId} (start_time=${wrongHour}, not ${targetHour})`);
    console.log(`Target: date=${targetDate}, hour=${targetHour}`);

    // Execute
    const result = await processNoShowSettlements(FIXED_NOW);
    console.log("Result:", result);

    // Verify: scanned=0 because start_time doesn't match
    if (result.scanned !== 0) {
      throw new Error(`FAIL: expected scanned=0, got ${result.scanned}`);
    }

    if (result.settled !== 0) {
      throw new Error(`FAIL: expected settled=0, got ${result.settled}`);
    }

    // 验证 request 未被修改
    const requestDoc = await db.collection("request").doc(requestId).get();
    const updatedRequest = requestDoc.data();

    if (updatedRequest.status !== "accepted") {
      throw new Error("FAIL: status should remain accepted");
    }

    if (updatedRequest.completed_at) {
      throw new Error("FAIL: completed_at should not be set");
    }

    console.log("PASS: no-show-target-miss");
  } finally {
    await cleanupTestData(requestId);
  }

  return true;
}

// ============ Main ============

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  let scenario = null;

  for (const arg of args) {
    if (arg.startsWith("--scenario=")) {
      scenario = arg.replace("--scenario=", "");
    }
  }

  if (!scenario) {
    console.log("Usage: node functions/scripts/testScheduledBookingJobs.js --scenario=<scenario>");
    console.log("Reminder scenarios:");
    console.log("  reminder-success");
    console.log("  reminder-already-sent");
    console.log("  reminder-status-not-accepted");
    console.log("  reminder-target-miss");
    console.log("No-show scenarios:");
    console.log("  no-show-success");
    console.log("  no-show-already-in-progress");
    console.log("  no-show-status-not-accepted");
    console.log("  no-show-target-miss");
    process.exit(1);
  }

  console.log(`Testing scenario: ${scenario}`);
  console.log(`Fixed now: ${FIXED_NOW.toISOString()}`);

  try {
    switch (scenario) {
      // Reminder scenarios
      case "reminder-success":
        await testReminderSuccess();
        break;
      case "reminder-already-sent":
        await testReminderAlreadySent();
        break;
      case "reminder-status-not-accepted":
        await testReminderStatusNotAccepted();
        break;
      case "reminder-target-miss":
        await testReminderTargetMiss();
        break;
      // No-show scenarios
      case "no-show-success":
        await testNoShowSuccess();
        break;
      case "no-show-already-in-progress":
        await testNoShowAlreadyInProgress();
        break;
      case "no-show-status-not-accepted":
        await testNoShowStatusNotAccepted();
        break;
      case "no-show-target-miss":
        await testNoShowTargetMiss();
        break;
      default:
        console.error(`Unknown scenario: ${scenario}`);
        process.exit(1);
    }

    console.log("\n=== ALL TESTS PASSED ===");
    process.exit(0);
  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error.message);
    process.exit(1);
  }
}

main();