/**
 * testMaintainTimeSlotWindow.js - 测试 maintainTimeSlotWindow
 *
 * 用法：
 *   node functions/scripts/testMaintainTimeSlotWindow.js --scenario=<scenario>
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

const { processTimeSlotWindow } = require("../maintainTimeSlotWindow");
const { getLondonDateOffset } = require("../utils/time");

// ============ 辅助函数 ============

/**
 * 清理测试数据
 *
 * @param {string[]} facilityIds - 要清理的 facility doc ids
 */
async function cleanupTestData(facilityIds) {
  if (!facilityIds || facilityIds.length === 0) return;

  const batch = db.batch();

  // 1. 删除 facility collection 中以 mtw-facility- 开头的 doc
  for (const facilityId of facilityIds) {
    batch.delete(db.collection("facility").doc(facilityId));
  }

  // 2. 删除 time_slot collection 中 facility_id 以 mtw-facility- 开头的
  const slotsSnap = await db
    .collection("time_slot")
    .where("facility_id", "in", facilityIds)
    .get();

  for (const slotDoc of slotsSnap.docs) {
    batch.delete(slotDoc.ref);
  }

  // 3. 提交删除
  await batch.commit();
}

/**
 * 断言 stats
 */
function assertStats(actual, expected) {
  if (expected.scannedFacilities !== undefined && actual.scannedFacilities !== expected.scannedFacilities) {
    throw new Error(`scannedFacilities expected ${expected.scannedFacilities}, got ${actual.scannedFacilities}`);
  }
  if (expected.skippedNonNormalFacilities !== undefined && actual.skippedNonNormalFacilities !== expected.skippedNonNormalFacilities) {
    throw new Error(`skippedNonNormalFacilities expected ${expected.skippedNonNormalFacilities}, got ${actual.skippedNonNormalFacilities}`);
  }
  if (expected.appliedScheduledChanges !== undefined && actual.appliedScheduledChanges !== expected.appliedScheduledChanges) {
    throw new Error(`appliedScheduledChanges expected ${expected.appliedScheduledChanges}, got ${actual.appliedScheduledChanges}`);
  }
  if (expected.createdSlots !== undefined && actual.createdSlots !== expected.createdSlots) {
    throw new Error(`createdSlots expected ${expected.createdSlots}, got ${actual.createdSlots}`);
  }
  if (expected.skippedExistingSlots !== undefined && actual.skippedExistingSlots !== expected.skippedExistingSlots) {
    throw new Error(`skippedExistingSlots expected ${expected.skippedExistingSlots}, got ${actual.skippedExistingSlots}`);
  }
}

// ============ 测试场景 ============

/**
 * daily-create-target-date-slots
 */
async function testDailyCreateTargetDateSlots() {
  const facilityId = "mtw-facility-daily";
  const facilityIds = [facilityId];

  console.log("\n=== Test: daily-create-target-date-slots ===");

  try {
    // Setup
    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility Daily",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 12,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created facility: ${facilityId}`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify stats
    assertStats(result, {
      scannedFacilities: 1,
      skippedNonNormalFacilities: 0,
      appliedScheduledChanges: 0,
      createdSlots: 3,
      skippedExistingSlots: 0
    });

    // Verify slot created at today+7
    const targetDate = getLondonDateOffset(7);
    const slotsSnap = await db
      .collection("time_slot")
      .where("facility_id", "==", facilityId)
      .where("date", "==", targetDate)
      .get();

    if (slotsSnap.size !== 3) {
      throw new Error(`Expected 3 slots at ${targetDate}, got ${slotsSnap.size}`);
    }

    // Verify slot times
    const slots = slotsSnap.docs.map(d => d.data());
    const times = slots.map(s => s.start_time).sort();
    if (JSON.stringify(times) !== JSON.stringify(["09", "10", "11"])) {
      throw new Error(`Expected times ["09", "10", "11"], got ${JSON.stringify(times)}`);
    }

    console.log("PASS: daily-create-target-date-slots");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * fill-window-create-missing-slots
 */
async function testFillWindowCreateMissingSlots() {
  const facilityId = "mtw-facility-fill";
  const facilityIds = [facilityId];

  console.log("\n=== Test: fill-window-create-missing-slots ===");

  try {
    // Setup
    await db.collection("facility").doc(facilityId).set({
      name: "Test Facility Fill",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 11,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created facility: ${facilityId}`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "fillWindow",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify stats: 8 days × 2 hours = 16 slots
    assertStats(result, {
      scannedFacilities: 1,
      skippedNonNormalFacilities: 0,
      createdSlots: 16
    });

    console.log("PASS: fill-window-create-missing-slots");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * skip-existing-open-slot
 */
async function testSkipExistingOpenSlot() {
  const facilityId = "mtw-facility-skip-open";
  const facilityIds = [facilityId];

  console.log("\n=== Test: skip-existing-open-slot ===");

  try {
    // Setup facility
    await db.collection("facility").doc(facilityId).set({
      name: "Test Skip Open",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 12,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // Pre-seed slot at hour 9
    const targetDate = getLondonDateOffset(7);
    const slotId = `${facilityId}-${targetDate}-09`;

    await db.collection("time_slot").doc(slotId).set({
      facility_id: facilityId,
      date: targetDate,
      start_time: 9,
      end_time: 10,
      status: "open",
      request_id: "",
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created existing slot: ${slotId}`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify: hour 9 skipped, hours 10, 11 created
    assertStats(result, {
      scannedFacilities: 1,
      createdSlots: 2,
      skippedExistingSlots: 1
    });

    // Verify original slot not overwritten
    const slotDoc = await db.collection("time_slot").doc(slotId).get();
    const slotData = slotDoc.data();

    if (slotData.status !== "open") {
      throw new Error(`Status should remain "open", got "${slotData.status}"`);
    }
    if (slotData.request_id !== "") {
      throw new Error(`request_id should remain "", got "${slotData.request_id}"`);
    }

    console.log("PASS: skip-existing-open-slot");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * skip-existing-locked-slot
 */
async function testSkipExistingLockedSlot() {
  const facilityId = "mtw-facility-skip-locked";
  const facilityIds = [facilityId];
  const requestId = "mtw-request-123";

  console.log("\n=== Test: skip-existing-locked-slot ===");

  try {
    // Setup facility
    await db.collection("facility").doc(facilityId).set({
      name: "Test Skip Locked",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 12,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // Pre-seed locked slot at hour 10
    const targetDate = getLondonDateOffset(7);
    const slotId = `${facilityId}-${targetDate}-10`;

    await db.collection("time_slot").doc(slotId).set({
      facility_id: facilityId,
      date: targetDate,
      start_time: 10,
      end_time: 11,
      status: "locked",
      request_id: requestId,
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created locked slot: ${slotId}`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify: hour 10 skipped, hours 9, 11 created
    assertStats(result, {
      scannedFacilities: 1,
      createdSlots: 2,
      skippedExistingSlots: 1
    });

    // Verify locked slot not overwritten
    const slotDoc = await db.collection("time_slot").doc(slotId).get();
    const slotData = slotDoc.data();

    if (slotData.status !== "locked") {
      throw new Error(`Status should remain "locked", got "${slotData.status}"`);
    }
    if (slotData.request_id !== requestId) {
      throw new Error(`request_id should remain ${requestId}, got "${slotData.request_id}"`);
    }

    console.log("PASS: skip-existing-locked-slot");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * apply-scheduled-change-before-generation
 */
async function testApplyScheduledChangeBeforeGeneration() {
  const facilityId = "mtw-facility-schedule";
  const facilityIds = [facilityId];
  const today = getLondonDateOffset(0);

  console.log("\n=== Test: apply-scheduled-change-before-generation ===");

  try {
    // Setup facility with due scheduled_change
    await db.collection("facility").doc(facilityId).set({
      name: "Test Schedule",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 12,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: {
        type: "update",
        effective_on: today,
        payload: { start_time: 10, end_time: 13 }
      },
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created facility with scheduled_change effective_on: ${today}`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify: scheduled_change applied
    assertStats(result, {
      scannedFacilities: 1,
      appliedScheduledChanges: 1,
      createdSlots: 3
    });

    // Verify facility updated
    const facilityDoc = await db.collection("facility").doc(facilityId).get();
    const facilityData = facilityDoc.data();

    if (facilityData.start_time !== 10) {
      throw new Error(`start_time should be 10, got ${facilityData.start_time}`);
    }
    if (facilityData.end_time !== 13) {
      throw new Error(`end_time should be 13, got ${facilityData.end_time}`);
    }
    if (facilityData.scheduled_change !== null) {
      throw new Error(`scheduled_change should be null, got ${JSON.stringify(facilityData.scheduled_change)}`);
    }

    // Verify slots created with new hours: 10, 11, 12
    const targetDate = getLondonDateOffset(7);
    const slotsSnap = await db
      .collection("time_slot")
      .where("facility_id", "==", facilityId)
      .where("date", "==", targetDate)
      .get();

    const times = slotsSnap.docs.map(d => d.data().start_time).sort();
    if (JSON.stringify(times) !== JSON.stringify(["10", "11", "12"])) {
      throw new Error(`Expected times ["10", "11", "12"], got ${JSON.stringify(times)}`);
    }

    console.log("PASS: apply-scheduled-change-before-generation");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * future-scheduled-change-not-applied
 */
async function testFutureScheduledChangeNotApplied() {
  const facilityId = "mtw-facility-future";
  const facilityIds = [facilityId];
  const tomorrow = getLondonDateOffset(1);

  console.log("\n=== Test: future-scheduled-change-not-applied ===");

  try {
    // Setup facility with future scheduled_change
    await db.collection("facility").doc(facilityId).set({
      name: "Test Future",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 12,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: {
        type: "update",
        effective_on: tomorrow,
        payload: { start_time: 14, end_time: 17 }
      },
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created facility with scheduled_change effective_on: ${tomorrow}`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify: scheduled_change NOT applied
    assertStats(result, {
      scannedFacilities: 1,
      appliedScheduledChanges: 0,
      createdSlots: 3
    });

    // Verify facility NOT updated
    const facilityDoc = await db.collection("facility").doc(facilityId).get();
    const facilityData = facilityDoc.data();

    if (facilityData.start_time !== 9) {
      throw new Error(`start_time should remain 9, got ${facilityData.start_time}`);
    }
    if (facilityData.end_time !== 12) {
      throw new Error(`end_time should remain 12, got ${facilityData.end_time}`);
    }
    if (!facilityData.scheduled_change) {
      throw new Error(`scheduled_change should still exist`);
    }

    console.log("PASS: future-scheduled-change-not-applied");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * skip-non-normal-facility
 */
async function testSkipNonNormalFacility() {
  const statuses = ["normal", "deleted", "fixing", "outdated", "closed"];
  const facilityIds = statuses.map(s => `mtw-facility-${s}`);

  console.log("\n=== Test: skip-non-normal-facility ===");

  try {
    // Setup facilities with different statuses
    for (const status of statuses) {
      await db.collection("facility").doc(`mtw-facility-${status}`).set({
        name: `Test Facility ${status}`,
        sport_type: "tennis",
        description: "Test",
        usage_guidelines: "Test",
        capacity: 4,
        location: "Test",
        start_time: 9,
        end_time: 11,
        staff_id: "staff_test",
        status: status,
        scheduled_change: null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    console.log(`Created ${statuses.length} facilities with different statuses`);

    // Test each facility separately
    for (const status of statuses) {
      const facilityId = `mtw-facility-${status}`;

      const result = await processTimeSlotWindow({
        mode: "daily",
        facilityId: facilityId
      });

      if (status === "normal") {
        assertStats(result, {
          scannedFacilities: 1,
          skippedNonNormalFacilities: 0,
          createdSlots: 2
        });
      } else {
        assertStats(result, {
          scannedFacilities: 1,
          skippedNonNormalFacilities: 1,
          createdSlots: 0
        });
      }
    }

    console.log("PASS: skip-non-normal-facility");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * legacy-doc-id-compatibility
 */
async function testLegacyDocIdCompatibility() {
  const facilityId = "mtw-facility-legacy";
  const facilityIds = [facilityId];

  console.log("\n=== Test: legacy-doc-id-compatibility ===");

  try {
    // Setup facility with narrow hours (9-10 only)
    await db.collection("facility").doc(facilityId).set({
      name: "Test Legacy",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 10,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // Pre-seed existing slot with old doc id format (hour not padded)
    const targetDate = getLondonDateOffset(7);
    const oldSlotId = `${facilityId}-${targetDate}-9`;

    await db.collection("time_slot").doc(oldSlotId).set({
      facility_id: facilityId,
      date: targetDate,
      start_time: 9,  // number, not string
      end_time: 10,      // number, not string
      status: "open",
      request_id: "",
      created_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created legacy slot: ${oldSlotId} (start_time: number)`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId,
      targetDate: targetDate
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify: hour 9 skipped, no new slot created (hour 10 not in range 9-10)
    assertStats(result, {
      scannedFacilities: 1,
      createdSlots: 0,
      skippedExistingSlots: 1
    });

    // Verify new slot not created
    const newSlotId = `${facilityId}-${targetDate}-09`;
    const newSlotDoc = await db.collection("time_slot").doc(newSlotId).get();

    if (newSlotDoc.exists) {
      throw new Error(`New slot ${newSlotId} should not exist`);
    }

    console.log("PASS: legacy-doc-id-compatibility");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * unknown-mode
 */
async function testUnknownMode() {
  console.log("\n=== Test: unknown-mode ===");

  try {
    // Try with invalid mode
    await processTimeSlotWindow({
      mode: "bad-mode",
      facilityId: "mtw-facility-test"
    });

    throw new Error("Should have thrown");
  } catch (e) {
    if (!e.message.includes("Invalid mode")) {
      console.error("Error:", e.message);
      throw e;
    }
    console.log(`Expected error: ${e.message}`);
  }

  console.log("PASS: unknown-mode");
}

/**
 * unknown-scheduled-change-type
 */
async function testUnknownScheduledChangeType() {
  const facilityId = "mtw-facility-unknown-type";
  const facilityIds = [facilityId];

  console.log("\n=== Test: unknown-scheduled-change-type ===");

  try {
    // Setup facility with unknown scheduled_change type
    await db.collection("facility").doc(facilityId).set({
      name: "Test Unknown Type",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 9,
      end_time: 11,
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: {
        type: "delete",
        effective_on: getLondonDateOffset(0),
        payload: {}
      },
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created facility with scheduled_change type: delete`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify: warning logged, scheduled_change NOT cleared
    assertStats(result, {
      scannedFacilities: 1,
      appliedScheduledChanges: 0,
      createdSlots: 2
    });

    if (result.warnings.length === 0) {
      throw new Error("Expected warning for unknown scheduled_change type");
    }

    // Verify scheduled_change still exists
    const facilityDoc = await db.collection("facility").doc(facilityId).get();
    const facilityData = facilityDoc.data();

    if (!facilityData.scheduled_change) {
      throw new Error(`scheduled_change should still exist`);
    }
    if (facilityData.scheduled_change.type !== "delete") {
      throw new Error(`scheduled_change.type should be "delete", got "${facilityData.scheduled_change.type}"`);
    }

    console.log("PASS: unknown-scheduled-change-type");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

/**
 * invalid-facility-hours
 */
async function testInvalidFacilityHours() {
  const facilityId = "mtw-facility-invalid-hours";
  const facilityIds = [facilityId];

  console.log("\n=== Test: invalid-facility-hours ===");

  try {
    // Setup facility with invalid hours
    await db.collection("facility").doc(facilityId).set({
      name: "Test Invalid Hours",
      sport_type: "tennis",
      description: "Test",
      usage_guidelines: "Test",
      capacity: 4,
      location: "Test",
      start_time: 12,
      end_time: 12,  // invalid: start >= end
      staff_id: "staff_test",
      status: "normal",
      scheduled_change: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`Created facility with invalid hours: 12-12`);

    // Execute
    const result = await processTimeSlotWindow({
      mode: "daily",
      facilityId: facilityId
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify: warning logged, no slots created
    assertStats(result, {
      scannedFacilities: 1,
      skippedNonNormalFacilities: 0,
      createdSlots: 0
    });

    if (result.warnings.length === 0) {
      throw new Error("Expected warning for invalid hours");
    }

    console.log("PASS: invalid-facility-hours");
  } finally {
    await cleanupTestData(facilityIds);
  }
}

// ============ Main ============

async function main() {
  const args = process.argv.slice(2);
  let scenario = null;

  for (const arg of args) {
    if (arg.startsWith("--scenario=")) {
      scenario = arg.replace("--scenario=", "");
    }
  }

  if (!scenario) {
    console.log("Usage: node functions/scripts/testMaintainTimeSlotWindow.js --scenario=<scenario>");
    console.log("\nHappy paths:");
    console.log("  daily-create-target-date-slots");
    console.log("  fill-window-create-missing-slots");
    console.log("  skip-existing-open-slot");
    console.log("  skip-existing-locked-slot");
    console.log("  apply-scheduled-change-before-generation");
    console.log("  future-scheduled-change-not-applied");
    console.log("  skip-non-normal-facility");
    console.log("  legacy-doc-id-compatibility");
    console.log("\nFailure / edge paths:");
    console.log("  unknown-mode");
    console.log("  unknown-scheduled-change-type");
    console.log("  invalid-facility-hours");
    process.exit(1);
  }

  console.log(`Testing scenario: ${scenario}`);
  console.log(`Today (London): ${getLondonDateOffset(0)}`);

  try {
    switch (scenario) {
      case "daily-create-target-date-slots":
        await testDailyCreateTargetDateSlots();
        break;
      case "fill-window-create-missing-slots":
        await testFillWindowCreateMissingSlots();
        break;
      case "skip-existing-open-slot":
        await testSkipExistingOpenSlot();
        break;
      case "skip-existing-locked-slot":
        await testSkipExistingLockedSlot();
        break;
      case "apply-scheduled-change-before-generation":
        await testApplyScheduledChangeBeforeGeneration();
        break;
      case "future-scheduled-change-not-applied":
        await testFutureScheduledChangeNotApplied();
        break;
      case "skip-non-normal-facility":
        await testSkipNonNormalFacility();
        break;
      case "legacy-doc-id-compatibility":
        await testLegacyDocIdCompatibility();
        break;
      case "unknown-mode":
        await testUnknownMode();
        break;
      case "unknown-scheduled-change-type":
        await testUnknownScheduledChangeType();
        break;
      case "invalid-facility-hours":
        await testInvalidFacilityHours();
        break;
      default:
        console.error(`Unknown scenario: ${scenario}`);
        process.exit(1);
    }

    console.log("\n=== TEST PASSED ===");
    process.exit(0);
  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error.message);
    process.exit(1);
  }
}

main();