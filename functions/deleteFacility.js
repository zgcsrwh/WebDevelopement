/**
 * deleteFacility Cloud Function Implementation
 *
 * Based on deleteFacility_Implementation_Plan.md
 *
 * ID type: string (all use string)
 * Status type: string
 * Error handling: throw new functions.https.HttpsError
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// ============ Utility functions ============

/**
 * Assert required parameters
 */
function assertRequired(data, fields) {
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      throw new functions.https.HttpsError("invalid-argument", `${field} is required`);
    }
  }
}

/**
 * Batch process batch operations
 * @param {Array} docs - Document array
 * @param {Function} operation - Operation function (batch, doc) => void
 * @returns {Promise<number>} Number of documents processed
 */
async function batchProcess(docs, operation) {
  if (docs.length === 0) return 0;

  let currentBatch = db.batch();
  let currentCount = 0;
  const batches = [];

  for (const doc of docs) {
    operation(currentBatch, doc);
    currentCount++;

    // Every 499 documents per batch (safety threshold)
    if (currentCount >= 499) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      currentCount = 0;
    }
  }

  // Process remaining
  if (currentCount > 0) {
    batches.push(currentBatch);
  }

  // Execute all batches
  for (const batch of batches) {
    await batch.commit();
  }

  return docs.length;
}

/**
 * Format time (safe version)
 */
function toHourString(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const num = typeof value === "number" ? value : parseInt(value, 10);
  if (isNaN(num)) {
    return "";
  }
  return String(num).padStart(2, "0");
}

// ============ Main function ============

/**
 * Delete facility
 *
 * Features:
 * 1. Validate Admin permissions
 * 2. Update facility status to deleted
 * 3. Cancel related pending/accepted/upcoming/in_progress requests
 * 4. Terminate related pending/in_progress repairs
 * 5. Delete related time_slots
 * 6. Check and update staff assignment_status
 * 7. Send notifications
 */
exports.deleteFacility = functions.https.onCall(async (data, context) => {
  // ========== 1. Permission validation ==========
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be logged in"
    );
  }

  const uid = context.auth.uid;

  // Query admin_staff to confirm role
  const adminDoc = await db.collection("admin_staff").doc(uid).get();

  if (!adminDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Admin account not found");
  }

  const adminData = adminDoc.data();
  const role = String(adminData.role || "").toLowerCase();
  const status = String(adminData.status || "").toLowerCase();

  // Validate role (case-insensitive: Admin/admin)
  if (role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can perform this operation"
    );
  }

  // Validate status
  if (status !== "active") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin account is not active"
    );
  }

  // ========== 2. facility_id validation ==========
  assertRequired(data, ["facility_id"]);

  const facility_id = String(data.facility_id).trim();

  if (!facility_id) {
    throw new functions.https.HttpsError("invalid-argument", "facility_id is required");
  }

  // ========== 3. Read facility ==========
  const facilityRef = db.collection("facility").doc(facility_id);
  const facilityDoc = await facilityRef.get();

  if (!facilityDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Facility not found");
  }

  const facility = facilityDoc.data();
  const facilityName = facility.name || facility_id;

  // Check if already deleted
  if (facility.status === "deleted") {
    throw new functions.https.HttpsError("failed-precondition", "Facility already deleted");
  }

  // ========== 4. Statistics and initialization ==========
  const stats = {
    cancelledRequests: 0,
    deletedTimeSlots: 0,
    terminatedRepairs: 0,
    staffMarkedUnassigned: false,
    notificationsCreated: 0,
    notificationFailures: 0
  };

  // ========== 5. Update facility (using transaction) ==========
  await db.runTransaction(async (transaction) => {
    const fDoc = await transaction.get(facilityRef);
    if (!fDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Facility not found");
    }

    const fData = fDoc.data();
    if (fData.status === "deleted") {
      throw new functions.https.HttpsError("failed-precondition", "Facility already deleted");
    }

    transaction.update(facilityRef, {
      status: "deleted",
      scheduled_change: null,
      updated_at: FieldValue.serverTimestamp()
    });
  });

  console.log(`[deleteFacility] Facility ${facility_id} status updated to deleted`);

  // ========== 6. Query and cancel requests ==========
  const requestSnapshot = await db.collection("request")
    .where("facility_id", "==", facility_id)
    .get();

  const requestsToCancel = [];
  const requestDataForNotification = [];

  requestSnapshot.docs.forEach((doc) => {
    const req = doc.data();
    // pending / accepted / upcoming / in_progress -> cancelled
    if (["pending", "accepted", "upcoming", "in_progress"].includes(req.status)) {
      requestsToCancel.push({ ref: doc.ref, id: doc.id, data: req });
      // Save { id: requestDocId, data: requestData } for notification
      requestDataForNotification.push({ id: doc.id, data: req });
    }
  });

  // Use batch to update requests in chunks
  if (requestsToCancel.length > 0) {
    const cancelBatchResult = await batchProcess(
      requestsToCancel,
      (batch, item) => {
        batch.update(item.ref, {
          status: "cancelled",
          completed_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        });
      }
    );
    stats.cancelledRequests = cancelBatchResult;
    console.log(`[deleteFacility] Cancelled ${cancelBatchResult} requests`);
  }

  // ========== 7. Query and terminate repairs ==========
  const repairSnapshot = await db.collection("repair")
    .where("facility_id", "==", facility_id)
    .get();

  const repairsToTerminate = [];

  repairSnapshot.docs.forEach((doc) => {
    const repair = doc.data();
    // pending / in_progress -> terminated
    if (["pending", "in_progress"].includes(repair.status)) {
      repairsToTerminate.push({ ref: doc.ref, id: doc.id });
    }
  });

  // Use batch to update repairs in chunks
  if (repairsToTerminate.length > 0) {
    const repairBatchResult = await batchProcess(
      repairsToTerminate,
      (batch, item) => {
        batch.update(item.ref, {
          status: "terminated",
          updated_at: FieldValue.serverTimestamp()
        });
      }
    );
    stats.terminatedRepairs = repairBatchResult;
    console.log(`[deleteFacility] Terminated ${repairBatchResult} repairs`);
  }

  // ========== 8. Delete time_slots ==========
  const slotSnapshot = await db.collection("time_slot")
    .where("facility_id", "==", facility_id)
    .get();

  if (slotSnapshot.size > 0) {
    const slotBatchResult = await batchProcess(
      slotSnapshot.docs,
      (batch, doc) => {
        batch.delete(doc.ref);
      }
    );
    stats.deletedTimeSlots = slotBatchResult;
    console.log(`[deleteFacility] Deleted ${slotBatchResult} time_slots`);
  }

  // ========== 9. Check staff assignment ==========
  const originalStaffId = facility.staff_id;
  let staffDoc = null;

  if (originalStaffId) {
    // Query whether this staff has other undeleted facilities
    const otherFacilitySnapshot = await db.collection("facility")
      .where("staff_id", "==", originalStaffId)
      .where("status", "in", ["normal", "fixing"])
      .get();

    const hasOtherFacility = otherFacilitySnapshot.docs.some(
      doc => doc.id !== facility_id
    );

    if (!hasOtherFacility) {
      // Check if admin_staff exists
      staffDoc = await db.collection("admin_staff").doc(originalStaffId).get();

      if (staffDoc.exists) {
        await db.collection("admin_staff").doc(originalStaffId).update({
          assignment_status: "unassigned",
          updated_at: FieldValue.serverTimestamp()
        });
        stats.staffMarkedUnassigned = true;
        console.log(`[deleteFacility] Staff ${originalStaffId} marked as unassigned`);
      } else {
        console.warn(`[deleteFacility] admin_staff/${originalStaffId} not found`);
      }
    }
  }

  // ========== 10. Create notifications (failure does not rollback) ==========
  try {
    // Collect cancelled request data for notification
    const notifications = [];

    requestDataForNotification.forEach((item) => {
      const req = item.data;
      const requestId = item.id; // Use request document id

      const recipientIds = new Set();

      // Collect recipients
      if (req.member_id) recipientIds.add(req.member_id);
      if (req.participant_ids && Array.isArray(req.participant_ids)) {
        req.participant_ids.forEach(id => id && recipientIds.add(id));
      }
      if (req.user_id_list && Array.isArray(req.user_id_list)) {
        req.user_id_list.forEach(id => id && recipientIds.add(id));
      }
      if (req.staff_id) recipientIds.add(req.staff_id);

      // Safe time formatting
      const startTime = toHourString(req.start_time);
      const endTime = toHourString(req.end_time);
      const timeRange = startTime && endTime ? `${startTime}-${endTime}` : "";

      // Create notification for each recipient
      const uniqueIds = Array.from(recipientIds).filter(id => id);
      uniqueIds.forEach(recipientId => {
        notifications.push({
          member_id: recipientId,
          message: `Facility '${facilityName}' has been removed. Your booking on ${req.date || ""} ${timeRange} has been cancelled.`,
          type: "facility_request",
          status_context: "cancelled",
          reference_id: requestId,
          is_read: false,
          created_at: FieldValue.serverTimestamp()
        });
      });
    });

    // Staff unassigned notification
    if (stats.staffMarkedUnassigned && originalStaffId && staffDoc) {
      // Query active Admin
      const adminSnapshot = await db.collection("admin_staff")
        .where("status", "==", "active")
        .get();

      const staffData = staffDoc.data();
      const staffName = staffData.name || originalStaffId;

      adminSnapshot.docs.forEach(doc => {
        const adminData = doc.data();
        const adminRole = String(adminData.role || "").toLowerCase();

        // Only notify active Admin, not regular Staff
        if (adminRole === "admin" && doc.id !== originalStaffId) {
          notifications.push({
            member_id: doc.id,
            message: `Staff '${staffName}' no longer manages any facility after '${facilityName}' was deleted. Please reassign facilities.`,
            type: "system",
            status_context: "staff_unassigned",
            reference_id: facility_id,
            is_read: false,
            created_at: FieldValue.serverTimestamp()
          });
        }
      });
    }

    // Batch create notifications
    if (notifications.length > 0) {
      const notifBatchResult = await batchProcess(
        notifications,
        (batch, notif) => {
          const notifRef = db.collection("notification").doc();
          batch.set(notifRef, notif);
        }
      );
      stats.notificationsCreated = notifBatchResult;
      console.log(`[deleteFacility] Created ${notifBatchResult} notifications`);
    }
  } catch (notifError) {
    stats.notificationFailures++;
    console.error("[deleteFacility] Failed to create notifications:", notifError);
  }

  // ========== 11. Return result ==========
  return {
    success: true,
    stats: stats
  };
});