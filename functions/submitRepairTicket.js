/**
 * submitRepairTicket Cloud Function
 *
 * Member submits repair request
 *
 * ID type: string
 * Status type: string
 * Error handling: throw new functions.https.HttpsError
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * Assert required fields
 */
function assertRequired(data, fields) {
  for (const field of fields) {
    if (!data[field] || typeof data[field] !== "string" || !data[field].trim()) {
      throw new functions.https.HttpsError("invalid-argument", `${field} is required`);
    }
  }
}

/**
 * Normalize hour to two-digit string (compatible with "9" / "09" / "9:00" / "09:00" / number 9)
 * Returns empty string for invalid input
 */
function normalizeHour(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  // Handle number
  if (typeof value === "number") {
    if (isNaN(value) || value < 0 || value > 23) {
      return "";
    }
    return String(value).padStart(2, "0");
  }

  const str = String(value).trim();
  if (!str) {
    return "";
  }

  // Extract numeric part (strip :00 etc)
  const numStr = str.replace(/^0+(\d)/, "$1").replace(/(\d).*/, "$1");
  if (!/^\d+$/.test(numStr)) {
    return "";
  }

  const hour = parseInt(numStr, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) {
    return "";
  }

  return String(hour).padStart(2, "0");
}

/**
 * Batch process items in groups
 * Note: each item should only be written once
 * @param {Array} items - Array of documents or refs
 * @param {Function} operation - Operation function (batch, item) => void
 * @returns {Promise<number>} Number of items processed
 */
async function batchProcess(docs, operation) {
  if (docs.length === 0) return 0;

  const BATCH_SIZE = 499;
  let batch = db.batch();
  let writeCount = 0;
  let processedCount = 0;

  for (const doc of docs) {
    operation(batch, doc);
    writeCount++;
    processedCount++;

    if (writeCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      writeCount = 0;
    }
  }

  // Commit remaining
  if (writeCount > 0) {
    await batch.commit();
  }

  return processedCount;
}

/**
 * submitRepairTicket - Member submits repair request
 */
const submitRepairTicket = functions.https.onCall(async (data, context) => {
  // ========== 1. Parameter validation ==========
  assertRequired(data, ["facility_id", "repair_description", "type"]);

  if (data.repair_description.trim().length > 500) {
    throw new functions.https.HttpsError("invalid-argument", "repair_description must not exceed 500 characters");
  }

  // ========== 2. Member authentication ==========
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const memberDoc = await db.collection("member").doc(userId).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Member not found");
  }

  const memberData = memberDoc.data();
  if (memberData.status !== "active") {
    throw new functions.https.HttpsError("permission-denied", "Member is not active");
  }

  // ========== 3. Facility initial validation ==========
  const facilityId = data.facility_id.trim();
  const facilityDoc = await db.collection("facility").doc(facilityId).get();

  if (!facilityDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Facility not found");
  }

  const facilityData = facilityDoc.data();
  if (facilityData.status === "deleted") {
    throw new functions.https.HttpsError("failed-precondition", "Cannot report repair for deleted facility");
  }

  // ========== 4. Transaction: Create repair + update facility.status ==========
  let repairId;
  let facilityName = facilityData.name || "";

  await db.runTransaction(async (transaction) => {
    // 4.1 Re-read facility to confirm it exists and is not deleted
    const facilityRef = db.collection("facility").doc(facilityId);
    const facilitySnapshot = await transaction.get(facilityRef);

    if (!facilitySnapshot.exists) {
      throw new functions.https.HttpsError("not-found", "Facility not found");
    }

    const currentFacility = facilitySnapshot.data();
    if (currentFacility.status === "deleted") {
      throw new functions.https.HttpsError("failed-precondition", "Cannot report repair for deleted facility");
    }

    // 4.2 Create repair document
    const repairRef = db.collection("repair").doc();
    transaction.set(repairRef, {
      member_id: userId,
      facility_id: facilityId,
      staff_id: currentFacility.staff_id || "",
      type: data.type.trim(),
      repair_description: data.repair_description.trim(),
      status: "pending",
      completed_at: "",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    repairId = repairRef.id;

    // 4.3 Update facilityName (using value confirmed within transaction)
    facilityName = currentFacility.name || facilityId;

    // 4.4 Update facility.status = "fixing"
    transaction.update(facilityRef, {
      status: "fixing",
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  console.log(`[submitRepairTicket] Created repair ${repairId} for facility ${facilityId}`);

  // ========== 5. Query and cancel active requests ==========
  const requestSnapshot = await db.collection("request")
    .where("facility_id", "==", facilityId)
    .get();

  const activeStatuses = ["pending", "accepted", "upcoming", "in_progress"];
  const requestsToCancel = [];

  requestSnapshot.docs.forEach(doc => {
    const req = doc.data();
    if (activeStatuses.includes(req.status)) {
      requestsToCancel.push({
        ref: doc.ref,
        id: doc.id,
        data: req
      });
    }
  });

  // ========== 6. Initialize stats ==========
  const stats = {
    cancelledRequests: 0,
    releasedTimeSlots: 0,
    notificationsCreated: 0,
    notificationFailures: 0
  };

  // ========== 7. Batch: Cancel requests + release time_slots ==========
  if (requestsToCancel.length > 0) {
    // Use Set to record slot ref paths to avoid duplicate releases
    const slotsToRelease = new Set();

    for (const req of requestsToCancel) {
      const reqId = req.id;

      // 7.1 Priority: query by request_id first
      const slotsByRequestId = await db.collection("time_slot")
        .where("request_id", "==", reqId)
        .get();

      if (slotsByRequestId.size > 0) {
        slotsByRequestId.docs.forEach(doc => {
          const slotData = doc.data();
          // Must confirm request_id matches and status is locked
          if (slotData.status === "locked" && slotData.request_id === reqId) {
            slotsToRelease.add(doc.ref.path);
          }
        });
      } else {
        // 7.2 Fallback: query by facility_id + date, but must check request_id matches
        const normalizedHour = normalizeHour(req.data.start_time);
        if (!normalizedHour) {
          console.warn(`[submitRepairTicket] Skipping fallback for request ${reqId}: invalid start_time`);
          continue;
        }

        const slotsByFacility = await db.collection("time_slot")
          .where("facility_id", "==", facilityId)
          .where("date", "==", req.data.date)
          .get();

        slotsByFacility.docs.forEach(doc => {
          const slotData = doc.data();
          const slotHour = normalizeHour(slotData.start_time);

          // Must confirm slot.request_id === req.id to avoid releasing other request's slot
          if (slotHour === normalizedHour && slotData.status === "locked" && slotData.request_id === reqId) {
            slotsToRelease.add(doc.ref.path);
          } else if (slotData.status === "locked" && slotData.request_id && slotData.request_id !== reqId) {
            // If slot is already bound to another request, skip and warn
            console.warn(`[submitRepairTicket] Slot ${doc.id} is locked by request ${slotData.request_id}, skip for request ${reqId}`);
          }
        });
      }
    }

    // 7.3 Use batch to cancel requests
    stats.cancelledRequests = await batchProcess(requestsToCancel, (batch, item) => {
      batch.update(item.ref, {
        status: "cancelled",
        completed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
      });
    });

    // 7.4 Use batch to release time_slots (after dedup by ref path)
    if (slotsToRelease.size > 0) {
      const slotRefs = Array.from(slotsToRelease).map(path => db.doc(path));
      stats.releasedTimeSlots = await batchProcess(slotRefs, (batch, ref) => {
        batch.update(ref, {
          status: "open",
          request_id: "",
          updated_at: FieldValue.serverTimestamp()
        });
      });
    }

    console.log(`[submitRepairTicket] Cancelled ${stats.cancelledRequests} requests, released ${stats.releasedTimeSlots} slots`);
  }

  // ========== 8. Notification ==========
  for (const req of requestsToCancel) {
    const reqData = req.data;

    // 8.1 Collect recipients (only member-related users, not staff)
    const recipientIds = new Set();
    if (reqData.member_id) recipientIds.add(reqData.member_id);
    if (reqData.participant_ids && Array.isArray(reqData.participant_ids)) {
      reqData.participant_ids.forEach(id => recipientIds.add(id));
    }
    if (reqData.user_id_list && Array.isArray(reqData.user_id_list)) {
      reqData.user_id_list.forEach(id => recipientIds.add(id));
    }
    // Do not notify staff: staff receiving member-facing cancellation message is inappropriate

    // Filter empty values
    const uniqueRecipients = Array.from(recipientIds).filter(id => id && id.trim());

    // 8.2 Format time
    const startTime = normalizeHour(reqData.start_time);
    const endTime = normalizeHour(reqData.end_time);
    const timeRange = startTime && endTime ? `${startTime}-${endTime}` : "";

    // 8.3 Create notification for each recipient
    for (const recipientId of uniqueRecipients) {
      try {
        await db.collection("notification").add({
          member_id: recipientId,
          message: `Your booking at '${facilityName}' on ${reqData.date || ""} ${timeRange} has been cancelled due to facility maintenance.`,
          type: "facility_request",
          status_context: "maintenance_cancelled",
          reference_id: req.id,
          is_read: false,
          created_at: FieldValue.serverTimestamp()
        });
        stats.notificationsCreated++;
      } catch (error) {
        console.error("[submitRepairTicket] Failed to create notification:", error);
        stats.notificationFailures++;
      }
    }
  }

  // ========== 9. Return ==========
  return {
    success: true,
    repairt_id: repairId,
    repair_id: repairId,
    stats: stats
  };
});

module.exports = { submitRepairTicket };