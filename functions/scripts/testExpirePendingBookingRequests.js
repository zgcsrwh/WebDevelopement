/**
 * testExpirePendingBookingRequests.js
 *
 * expirePendingBookingRequests 测试脚本
 */

const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();

const db = admin.firestore();

// 导入 core function
const { processExpiredPendingBookings } = require("../expirePendingBookingRequests");

// 固定时间
const FIXED_NOW = new Date("2026-05-04T08:00:00Z");

// ============ Helper 函数 ============

async function createRequest(id, data) {
  const requestRef = db.collection("request").doc(id);
  await requestRef.set({
    ...data,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });
  return id;
}

async function createTimeSlot(id, data) {
  const slotRef = db.collection("time_slot").doc(id);
  await slotRef.set({
    ...data,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });
  return id;
}

async function cleanupTestData() {
  // 清理 request（id 前缀 exp-pending-）
  const requestSnap = await db.collection("request")
    .where("__name__", ">=", "exp-pending-")
    .where("__name__", "<", "exp-pending-\ufff0")
    .get();
  const requestBatch = db.batch();
  requestSnap.docs.forEach(doc => requestBatch.delete(doc.ref));
  await requestBatch.commit();

  // 清理 time_slot（id 前缀 exp-pending-slot-）
  const slotSnap = await db.collection("time_slot")
    .where("__name__", ">=", "exp-pending-slot-")
    .where("__name__", "<", "exp-pending-slot-\ufff0")
    .get();
  const slotBatch = db.batch();
  slotSnap.docs.forEach(doc => slotBatch.delete(doc.ref));
  await slotBatch.commit();

  // 清理 notification（reference_id 前缀 exp-pending-）
  const notifSnap = await db.collection("notification")
    .where("reference_id", ">=", "exp-pending-")
    .where("reference_id", "<", "exp-pending-\ufff0")
    .get();
  const notifBatch = db.batch();
  notifSnap.docs.forEach(doc => notifBatch.delete(doc.ref));
  await notifBatch.commit();
}

async function seedBaseData() {
  // member/alice
  const memberRef = db.collection("member").doc("alice");
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    await memberRef.set({
      email: "alice@test.com",
      name: "Alice",
      status: "active",
      created_at: FieldValue.serverTimestamp()
    });
  }

  // admin_staff/staff-001
  const staffRef = db.collection("admin_staff").doc("staff-001");
  const staffDoc = await staffRef.get();
  if (!staffDoc.exists) {
    await staffRef.set({
      name: "Staff One",
      status: "active",
      facility_ids: ["facility-001"],
      created_at: FieldValue.serverTimestamp()
    });
  }

  // facility/facility-001
  const facilityRef = db.collection("facility").doc("facility-001");
  const facilityDoc = await facilityRef.get();
  if (!facilityDoc.exists) {
    await facilityRef.set({
      name: "Test Facility",
      status: "normal",
      created_at: FieldValue.serverTimestamp()
    });
  }
}

// ============ Test Scenarios ============

async function testPendingExpiredAutoCancelled() {
  console.log("\n=== Test: pending-expired-auto-cancelled ===");

  const requestId = "exp-pending-success";
  const slotId = "exp-pending-slot-1";

  await seedBaseData();
  await createRequest(requestId, {
    member_id: "alice",
    staff_id: "staff-001",
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "11",
    end_time: "12",
    status: "pending"
  });

  await createTimeSlot(slotId, {
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "11",
    end_time: "12",
    status: "locked",
    request_id: requestId
  });

  const stats = await processExpiredPendingBookings(FIXED_NOW);

  console.log("Stats:", stats);

  // 断言 stats
  if (stats.scanned !== 1) {
    console.error("FAIL: expected scanned=1, got", stats.scanned);
    process.exit(1);
  }
  if (stats.expired !== 1) {
    console.error("FAIL: expected expired=1, got", stats.expired);
    process.exit(1);
  }
  if (stats.skipped !== 0) {
    console.error("FAIL: expected skipped=0, got", stats.skipped);
    process.exit(1);
  }
  if (stats.slotMissing !== 0) {
    console.error("FAIL: expected slotMissing=0, got", stats.slotMissing);
    process.exit(1);
  }
  if (stats.notificationFailures !== 0) {
    console.error("FAIL: expected notificationFailures=0, got", stats.notificationFailures);
    process.exit(1);
  }
  if (stats.failures !== 0) {
    console.error("FAIL: expected failures=0, got", stats.failures);
    process.exit(1);
  }

  // 验证 request
  const requestDoc = await db.collection("request").doc(requestId).get();
  if (requestDoc.data().status !== "cancelled") {
    console.error("FAIL: request.status expected cancelled, got", requestDoc.data().status);
    process.exit(1);
  }
  if (!requestDoc.data().completed_at) {
    console.error("FAIL: request.completed_at should be set");
    process.exit(1);
  }

  // 验证 time_slot
  const slotDoc = await db.collection("time_slot").doc(slotId).get();
  if (slotDoc.data().status !== "open") {
    console.error("FAIL: slot.status expected open, got", slotDoc.data().status);
    process.exit(1);
  }
  if (slotDoc.data().request_id !== "") {
    console.error("FAIL: slot.request_id expected empty, got", slotDoc.data().request_id);
    process.exit(1);
  }

  // 验证 notification
  const notifSnap = await db.collection("notification")
    .where("reference_id", "==", requestId)
    .get();
  if (notifSnap.size === 0) {
    console.error("FAIL: notification not created");
    process.exit(1);
  }

  console.log("PASS");
}

async function testPendingFutureNotTouched() {
  console.log("\n=== Test: pending-future-not-touched ===");

  const requestId = "exp-pending-future";
  const slotId = "exp-pending-slot-2";

  await seedBaseData();
  await createRequest(requestId, {
    member_id: "alice",
    staff_id: "staff-001",
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "12",
    end_time: "13",
    status: "pending"
  });

  await createTimeSlot(slotId, {
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "12",
    end_time: "13",
    status: "locked",
    request_id: requestId
  });

  const stats = await processExpiredPendingBookings(FIXED_NOW);

  console.log("Stats:", stats);

  // 断言 stats
  if (stats.scanned !== 0) {
    console.error("FAIL: expected scanned=0, got", stats.scanned);
    process.exit(1);
  }
  if (stats.expired !== 0) {
    console.error("FAIL: expected expired=0, got", stats.expired);
    process.exit(1);
  }

  // 验证 request 未被修改
  const requestDoc = await db.collection("request").doc(requestId).get();
  if (requestDoc.data().status !== "pending") {
    console.error("FAIL: request.status expected pending, got", requestDoc.data().status);
    process.exit(1);
  }

  // 验证 slot 未被修改
  const slotDoc = await db.collection("time_slot").doc(slotId).get();
  if (slotDoc.data().status !== "locked") {
    console.error("FAIL: slot.status expected locked, got", slotDoc.data().status);
    process.exit(1);
  }
  if (slotDoc.data().request_id !== requestId) {
    console.error("FAIL: slot.request_id expected", requestId, "got", slotDoc.data().request_id);
    process.exit(1);
  }

  console.log("PASS");
}

async function testAcceptedExpiredNotTouched() {
  console.log("\n=== Test: accepted-expired-not-touched ===");

  const requestId = "exp-pending-accepted";
  const slotId = "exp-pending-slot-3";

  await seedBaseData();
  await createRequest(requestId, {
    member_id: "alice",
    staff_id: "staff-001",
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "11",
    end_time: "12",
    status: "accepted"
  });

  await createTimeSlot(slotId, {
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "11",
    end_time: "12",
    status: "locked",
    request_id: requestId
  });

  const stats = await processExpiredPendingBookings(FIXED_NOW);

  console.log("Stats:", stats);

  // 断言 stats
  if (stats.scanned !== 0) {
    console.error("FAIL: expected scanned=0, got", stats.scanned);
    process.exit(1);
  }
  if (stats.expired !== 0) {
    console.error("FAIL: expected expired=0, got", stats.expired);
    process.exit(1);
  }

  // 验证 request 保持 accepted
  const requestDoc = await db.collection("request").doc(requestId).get();
  if (requestDoc.data().status !== "accepted") {
    console.error("FAIL: request.status expected accepted, got", requestDoc.data().status);
    process.exit(1);
  }

  // 验证 slot 保持 locked
  const slotDoc = await db.collection("time_slot").doc(slotId).get();
  if (slotDoc.data().status !== "locked") {
    console.error("FAIL: slot.status expected locked, got", slotDoc.data().status);
    process.exit(1);
  }

  console.log("PASS");
}

async function testAlreadyCancelledNotTouched() {
  console.log("\n=== Test: already-cancelled-not-touched ===");

  const requestId = "exp-pending-cancelled";

  await seedBaseData();
  await createRequest(requestId, {
    member_id: "alice",
    staff_id: "staff-001",
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "11",
    end_time: "12",
    status: "cancelled"
  });

  const stats = await processExpiredPendingBookings(FIXED_NOW);

  console.log("Stats:", stats);

  // 断言 stats
  if (stats.scanned !== 0) {
    console.error("FAIL: expected scanned=0, got", stats.scanned);
    process.exit(1);
  }
  if (stats.expired !== 0) {
    console.error("FAIL: expected expired=0, got", stats.expired);
    process.exit(1);
  }

  // 验证 request 保持 cancelled
  const requestDoc = await db.collection("request").doc(requestId).get();
  if (requestDoc.data().status !== "cancelled") {
    console.error("FAIL: request.status expected cancelled, got", requestDoc.data().status);
    process.exit(1);
  }

  console.log("PASS");
}

async function testSlotMissingHandling() {
  console.log("\n=== Test: slot-missing-handling ===");

  const requestId = "exp-pending-no-slot";

  await seedBaseData();
  await createRequest(requestId, {
    member_id: "alice",
    staff_id: "staff-001",
    facility_id: "facility-001",
    date: "2026-05-04",
    start_time: "11",
    end_time: "12",
    status: "pending"
  });

  const stats = await processExpiredPendingBookings(FIXED_NOW);

  console.log("Stats:", stats);

  // 断言 stats
  if (stats.scanned !== 1) {
    console.error("FAIL: expected scanned=1, got", stats.scanned);
    process.exit(1);
  }
  if (stats.expired !== 1) {
    console.error("FAIL: expected expired=1, got", stats.expired);
    process.exit(1);
  }
  if (stats.slotMissing !== 1) {
    console.error("FAIL: expected slotMissing=1, got", stats.slotMissing);
    process.exit(1);
  }
  if (stats.notificationFailures !== 0) {
    console.error("FAIL: expected notificationFailures=0, got", stats.notificationFailures);
    process.exit(1);
  }

  // 验证 request 被 cancelled
  const requestDoc = await db.collection("request").doc(requestId).get();
  if (requestDoc.data().status !== "cancelled") {
    console.error("FAIL: request.status expected cancelled, got", requestDoc.data().status);
    process.exit(1);
  }

  // 验证 notification 仍创建
  const notifSnap = await db.collection("notification")
    .where("reference_id", "==", requestId)
    .get();
  if (notifSnap.size === 0) {
    console.error("FAIL: notification not created");
    process.exit(1);
  }

  console.log("PASS");
}

// ============ Main ============

async function main() {
  const scenario = process.argv[2]?.replace("--scenario=", "") || "all";

  try {
    switch (scenario) {
      case "pending-expired-auto-cancelled":
        await cleanupTestData();
        await testPendingExpiredAutoCancelled();
        break;
      case "pending-future-not-touched":
        await cleanupTestData();
        await testPendingFutureNotTouched();
        break;
      case "accepted-expired-not-touched":
        await cleanupTestData();
        await testAcceptedExpiredNotTouched();
        break;
      case "already-cancelled-not-touched":
        await cleanupTestData();
        await testAlreadyCancelledNotTouched();
        break;
      case "slot-missing-handling":
        await cleanupTestData();
        await testSlotMissingHandling();
        break;
      case "all":
        await cleanupTestData();
        await testPendingExpiredAutoCancelled();
        await cleanupTestData();
        await testPendingFutureNotTouched();
        await cleanupTestData();
        await testAcceptedExpiredNotTouched();
        await cleanupTestData();
        await testAlreadyCancelledNotTouched();
        await cleanupTestData();
        await testSlotMissingHandling();
        console.log("\n=== All Tests Passed ===");
        break;
      default:
        console.error("Unknown scenario:", scenario);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await cleanupTestData();
  }
}

main();