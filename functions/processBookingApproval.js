/**
 * processBookingApproval Cloud Function Implementation
 *
 * Based on processBookingApproval_API_Design.md and processBookingApproval_Implementation_Plan.md
 *
 * ID type: string (all use string)
 * Status type: string
 * Error handling: throw new functions.https.HttpsError
 */

// Firebase Functions v1 implementation
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

// ============ Main function ============

/**
 * processBookingApproval Cloud Function
 *
 * Business logic:
 * 1. Validate user is logged in
 * 2. Parameter reading and normalization
 * 3. Staff identity validation (query admin_staff from context.auth.uid)
 * 4. Request reading and status validation
 * 5. Update request in Transaction
 * 6. Conditional time_slot release (on reject/suggest)
 * 7. Create notification outside Transaction
 */
exports.processBookingApproval = functions.https.onCall(async (data, context) => {
  // 1. Validate user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const currentUid = context.auth.uid;

  // 2. Parameter reading and normalization
  const requestId = data.request_id;
  const statusArray = Array.isArray(data.status) ? data.status : [data.status];
  const normalizedStatus = String(statusArray[0] || "").toLowerCase().trim();
  const staffResponse = String(data.staff_response || "").trim();

  // 2.1 Validate required parameters
  assertRequired(data, ["request_id", "status"]);

  // 2.2 Validate status normalization
  if (!["accepted", "rejected", "suggested"].includes(normalizedStatus)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid status. Must be accepted, rejected, or suggested"
    );
  }

  // 2.3 Validate staff_response is required when needed
  if (["rejected", "suggested"].includes(normalizedStatus) && !staffResponse) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Please enter a response for rejected or suggested requests"
    );
  }

  // 3. Staff identity validation
  // Query admin_staff collection to confirm identity
  const staffDoc = await db.collection("admin_staff").doc(currentUid).get();

  if (!staffDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Only staff can process bookings");
  }

  const staffData = staffDoc.data();
  const staffRole = String(staffData.role || "staff").toLowerCase();

  // Strict restriction: only Staff, not Admin
  if (staffRole !== "staff") {
    throw new functions.https.HttpsError("permission-denied", "Staff role required");
  }

  // 4. Request reading and status validation
  const requestDoc = await db.collection("request").doc(requestId).get();

  if (!requestDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Request not found");
  }

  const request = requestDoc.data();

  // Validate staff_id match (only Staff managing this facility can process)
  if (request.staff_id !== currentUid) {
    throw new functions.https.HttpsError("permission-denied", "You are not assigned to this facility");
  }

  // Validate current status is pending (concurrency control)
  if (String(request.status || "").toLowerCase() !== "pending") {
    throw new functions.https.HttpsError("aborted", "Request has already been processed");
  }

  // 5. Update request and conditional time_slot release in Transaction
  await db.runTransaction(async (transaction) => {
    // 5.1 Read request first (prevent concurrency)
    const requestRef = db.collection("request").doc(requestId);
    const requestDocInTx = await transaction.get(requestRef);

    if (!requestDocInTx.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found");
    }

    const currentStatus = String(requestDocInTx.data().status || "").toLowerCase();
    if (currentStatus !== "pending") {
      throw new functions.https.HttpsError("aborted", "Request status has changed");
    }

    // 5.2 If rejected/suggested, read time_slot first (must be before all write operations)
    let slotsSnapshot = null;
    if (["rejected", "suggested"].includes(normalizedStatus)) {
      // Query related time_slot
      slotsSnapshot = await transaction.get(
        db.collection("time_slot").where("request_id", "==", requestId)
      );

      // Throw error if related time_slot not found
      if (slotsSnapshot.empty) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Time slot not found, request state may have changed"
        );
      }
    }

    // 5.3 After all reads complete, perform write operations (update request)
    const completedAt = normalizedStatus === "accepted"
      ? ""  // Keep empty string when accepted
      : FieldValue.serverTimestamp();  // Use Firestore Timestamp when rejected/suggested

    transaction.update(requestRef, {
      status: normalizedStatus,
      staff_response: staffResponse,
      completed_at: completedAt,
      updated_at: FieldValue.serverTimestamp()
    });

    // 5.4 If time_slot release is needed (perform write operations after all read operations)
    if (["rejected", "suggested"].includes(normalizedStatus) && slotsSnapshot) {
      for (const slotDoc of slotsSnapshot.docs) {
        transaction.update(slotDoc.ref, {
          status: "open",
          request_id: "",
          updated_at: FieldValue.serverTimestamp()
        });
      }
    }
  });

  // 6. Create notification outside Transaction
  // Save request data for notification (read again outside transaction)
  const requestAfterTx = (await db.collection("request").doc(requestId).get()).data();

  try {
    const recipientIds = [requestAfterTx.member_id, ...(requestAfterTx.participant_ids || [])];
    const uniqueRecipients = [...new Set(recipientIds.filter(Boolean))];

    // Notification message mapping
    const messages = {
      accepted: "Your booking request has been approved.",
      rejected: `Your booking request has been rejected. ${staffResponse}`.trim(),
      suggested: `A change was suggested for your booking request. ${staffResponse}`.trim()
    };

    const batch = db.batch();
    for (const recipientId of uniqueRecipients) {
      const notifRef = db.collection("notification").doc();
      batch.set(notifRef, {
        member_id: recipientId,
        message: messages[normalizedStatus],
        type: "facility_request",
        status_context: normalizedStatus,
        reference_id: requestId,
        is_read: false
      });
    }
    await batch.commit();
  } catch (notifError) {
    // Only log error, do not rollback approval transaction
    console.error("Failed to create notifications:", notifError);
  }

  // Return success
  return {
    success: true
  };
});