/**
 * maintainTimeSlotWindow Scheduled Cloud Function
 *
 * Maintains real time_slot window
 *
 * Two modes:
 * - fillWindow: today ~ today+7 (8 dates), for initial deployment/manual fix/test
 * - daily: today+7 (only 1 day at window end), for scheduled daily run
 *
 * Business rules:
 * - only create missing slots, never overwrite existing slots
 * - only generate new slots for facility with status === "normal" or "fixing"
 * - Apply due scheduled_change
 * - Old doc id compatible
 * - Batch writes
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// Import time.js helper
const { getLondonDateOffset } = require("./utils/time");

/**
 * Standardize time_slot.start_time/end_time to hour number
 *
 * Compatible with historical number/string mixed usage
 *
 * @param {number|string} value - Time value
 * @returns {number} hour number
 */
function toHourNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // "09" -> 9, "09:00" -> 9
    return parseInt(value.replace(/(:\d{2})?$/, ""), 10);
  }
  return parseInt(value || 0, 10);
}

/**
 * Generate time_slot doc id
 *
 * Format: facilityId-date-hourString (e.g., facility001-2026-05-10-09)
 *
 * @param {string} facilityId - facility doc ID
 * @param {string} date - YYYY-MM-DD
 * @param {number} hour - hour number
 * @returns {string} doc ID
 */
function generateSlotId(facilityId, date, hour) {
  const hourStr = String(hour).padStart(2, "0");
  return `${facilityId}-${date}-${hourStr}`;
}

/**
 * Clean up expired open time_slot
 *
 * Only delete slots with date < getLondonDateOffset(0) and status === "open"
 * Do not delete other statuses like locked/unavailable
 *
 * Note: To avoid Firestore composite index, query uses single field only
 * Filter status === "open" in code
 *
 * @param {object} stats - Statistics object
 * @returns {Promise<void>}
 */
async function cleanupExpiredOpenSlots(stats) {
  const today = getLondonDateOffset(0);
  const DELETE_BATCH_SIZE = 450;

  // Query: only query date < today (single field query, avoid composite index)
  // Filter status === "open" in code
  const expiredSlotsSnap = await db
    .collection("time_slot")
    .where("date", "<", today)
    .get();

  if (expiredSlotsSnap.empty) {
    stats.deletedExpiredSlots = 0;
    return;
  }

  // Batch delete: only delete slots with status === "open"
  let batch = db.batch();
  let batchCount = 0;
  let deletedCount = 0;

  for (const slotDoc of expiredSlotsSnap.docs) {
    const slotData = slotDoc.data();

    // Only delete slots with status === "open"
    if (slotData.status !== "open") {
      continue;
    }

    batch.delete(slotDoc.ref);
    batchCount++;
    deletedCount++;

    if (batchCount >= DELETE_BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }

  stats.deletedExpiredSlots = deletedCount;
}

/**
 * Core processing function
 *
 * @param {object} options
 * @param {string} options.mode - "fillWindow" | "daily"
 * @param {string} options.targetDate - Optional, specify single date (for test)
 * @param {string} options.facilityId - Optional, specify single facility (for test)
 * @param {Date} options.now - Optional, default new Date()
 * @param {boolean} options.cleanup - Optional, default true when mode === "daily", false when fillWindow
 * @returns {Promise<object>} Statistics result
 */
async function processTimeSlotWindow({ mode, targetDate, facilityId, now = new Date(), cleanup }) {
  // ========== 0. cleanup default value ==========
  if (cleanup === undefined) {
    cleanup = mode === "daily";
  }

  // ========== 1. Parse mode parameter ==========
  const validModes = ["fillWindow", "daily"];
  if (!mode || !validModes.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Must be "fillWindow" or "daily"`);
  }

  // ========== 2. Calculate target date array ==========
  const today = getLondonDateOffset(0);
  let targetDates = [];

  if (targetDate) {
    // Specify single date (for test)
    targetDates = [targetDate];
  } else if (mode === "daily") {
    // daily mode: today+7
    targetDates = [getLondonDateOffset(7)];
  } else {
    // fillWindow mode: today ~ today+7
    for (let i = 0; i <= 7; i++) {
      targetDates.push(getLondonDateOffset(i));
    }
  }

  // ========== 3. Initialize statistics ==========
  const stats = {
    mode,
    targetDates,
    scannedFacilities: 0,
    skippedNonNormalFacilities: 0,
    appliedScheduledChanges: 0,
    createdSlots: 0,
    skippedExistingSlots: 0,
    deletedExpiredSlots: 0,
    warnings: [],
  };

  // ========== 4. cleanup (default execute only in daily mode) ==========
  if (cleanup) {
    await cleanupExpiredOpenSlots(stats);
  }

  // ========== 5. Get all facilities (all) ==========
  let facilityDocs = [];

  if (facilityId) {
    // Specify single facility (for test)
    const facilityDoc = await db.collection("facility").doc(facilityId).get();
    if (!facilityDoc.exists) {
      throw new Error(`Facility not found: ${facilityId}`);
    }
    facilityDocs = [facilityDoc];
  } else {
    // Query all facilities
    const allFacilitiesSnap = await db.collection("facility").get();
    facilityDocs = allFacilitiesSnap.docs;
  }

  stats.scannedFacilities = facilityDocs.length;

  if (facilityDocs.length === 0) {
    return stats;
  }

  // ========== 6. Iterate each facility ==========
  for (const facilityDoc of facilityDocs) {
    await processFacility({
      facilityDoc,
      targetDates,
      stats,
    });
  }

  return stats;
}

/**
 * Process single facility
 *
 * @param {object} options
 * @param {FirebaseFirestore.QueryDocumentSnapshot} options.facilityDoc
 * @param {string[]} options.targetDates
 * @param {object} options.stats
 */
async function processFacility({ facilityDoc, targetDates, stats }) {
  const facilityRef = facilityDoc.ref;
  const facilityData = facilityDoc.data();
  const facilityId = facilityDoc.id;

  // ========== 5.1 facility.status filter ==========
  if (!["normal", "fixing"].includes(facilityData.status)) {
    stats.skippedNonNormalFacilities++;
    return;
  }

  // ========== 5.2 scheduled_change processing ==========
  const scheduledChange = facilityData.scheduled_change;
  let localStartTime = facilityData.start_time;
  let localEndTime = facilityData.end_time;

  if (scheduledChange && scheduledChange.type === "update" && scheduledChange.effective_on) {
    const today = getLondonDateOffset(0);
    if (scheduledChange.effective_on <= today) {
      // 5.2.1 due scheduled_change: Update local variables to new time first
      localStartTime = scheduledChange.payload.start_time;
      localEndTime = scheduledChange.payload.end_time;

      // 5.2.2 Write back to Firestore and clear scheduled_change
      await facilityRef.update({
        start_time: localStartTime,
        end_time: localEndTime,
        scheduled_change: null,
        updated_at: FieldValue.serverTimestamp(),
      });
      stats.appliedScheduledChanges++;

      // 5.2.3 Subsequent slot generation uses updated local time
    }
  } else if (scheduledChange && scheduledChange.type !== "update") {
    // 5.2.4 unknown scheduled_change.type: Only record warning, do not apply, do not clear, continue with current time
    stats.warnings.push(
      `Facility ${facilityId}: unknown scheduled_change type "${scheduledChange.type}", skipping`
    );
  }

  // ========== 5.3 Get facility business hours ==========
  const startHour = toHourNumber(localStartTime);
  const endHour = toHourNumber(localEndTime);

  if (isNaN(startHour) || isNaN(endHour) || startHour >= endHour) {
    stats.warnings.push(
      `Facility ${facilityId}: invalid hours ${startHour}-${endHour}, skipping`
    );
    return;
  }

  // ========== 5.4 Iterate target dates ==========
  for (const targetDate of targetDates) {
    await processTargetDate({
      facilityId,
      facilityRef,
      targetDate,
      startHour,
      endHour,
      stats,
    });
  }
}

/**
 * Process single date slot generation
 *
 * @param {object} options
 * @param {string} options.facilityId
 * @param {FirebaseFirestore.DocumentReference} options.facilityRef
 * @param {string} options.targetDate
 * @param {number} options.startHour
 * @param {number} options.endHour
 * @param {object} options.stats
 */
async function processTargetDate({
  facilityId,
  facilityRef,
  targetDate,
  startHour,
  endHour,
  stats,
}) {
  // ========== 5.4.1 Query all existing time_slot for this facility on this day ==========
  const existingSlotsSnap = await db
    .collection("time_slot")
    .where("facility_id", "==", facilityId)
    .where("date", "==", targetDate)
    .get();

  // ========== 5.4.2 Standardize hours with toHourNumber, build existingHours Set ==========
  const existingHours = new Set();
  for (const slotDoc of existingSlotsSnap.docs) {
    const slotData = slotDoc.data();
    const hourNum = toHourNumber(slotData.start_time);
    existingHours.add(hourNum);
  }

  // ========== 5.4.3 Collect slots that need to be created ==========
  const pendingSlots = [];

  for (let h = startHour; h < endHour; h++) {
    if (existingHours.has(h)) {
      // Existing hours always skip
      stats.skippedExistingSlots++;
      continue;
    }

    // Only create missing hours
    const slotId = generateSlotId(facilityId, targetDate, h);
    const hourStr = String(h).padStart(2, "0");
    const endHourStr = String(h + 1).padStart(2, "0");

    const slotData = {
      facility_id: facilityId,
      date: targetDate,
      start_time: hourStr, // string format, e.g., "09"
      end_time: endHourStr, // string format, e.g., "10"
      status: "open",
      request_id: "",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    pendingSlots.push({ id: slotId, data: slotData });
  }

  // ========== 5.4.4 Batch write ==========
  if (pendingSlots.length > 0) {
    const SLOTS_PER_BATCH = 450;

    let batch = db.batch();
    let batchCount = 0;

    for (const slot of pendingSlots) {
      const slotRef = db.collection("time_slot").doc(slot.id);

      // Existing slots are filtered by existingHours before this point. Use deterministic ID for idempotency.
      batch.set(slotRef, slot.data);
      batchCount++;

      if (batchCount >= SLOTS_PER_BATCH) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }

    stats.createdSlots += pendingSlots.length;
  }
}

/**
 * maintainTimeSlotWindow - daily mode
 *
 * For scheduled daily run
 */
const maintainTimeSlotWindow = functions.pubsub
  .schedule("0 5 * * *")  // Run daily at 5:00 London time
  .timeZone("Europe/London")
  .onRun(async (context) => {
    console.log("Starting maintainTimeSlotWindow in daily mode...");
    const result = await processTimeSlotWindow({ mode: "daily" });
    console.log("daily result:", JSON.stringify(result, null, 2));
    return null;
  });

// Unified export
module.exports = {
  maintainTimeSlotWindow,
  processTimeSlotWindow,
  toHourNumber,
  generateSlotId,
  cleanupExpiredOpenSlots,
};