/**
 * checkInBooking - Staff confirms check-in
 *
 * Called when Staff clicks "Confirm Arrival"
 * Updates accepted booking to in_progress
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// Import from common time utilities
const { parseBookingStart } = require("./utils/time");

exports.checkInBooking = functions.https.onCall(async (data, context) => {
  // 1. Validate authentication
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated.");
  }

  // 2. Validate request_id
  const requestId = data?.request_id;
  const trimmedRequestId = typeof requestId === "string" ? requestId.trim() : "";
  if (!trimmedRequestId) {
    throw new functions.https.HttpsError("invalid-argument", "request_id is required.");
  }

  // 3. Read Staff document
  const staffRef = db.collection("admin_staff").doc(uid);
  const staffDoc = await staffRef.get();

  if (!staffDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Staff account not found.");
  }
  const staff = staffDoc.data();

  // 4. Validate role: Staff only, not Admin
  if (staff.role !== "Staff" && staff.role !== "staff") {
    throw new functions.https.HttpsError("permission-denied", "Must be Staff.");
  }

  // 5. Validate status
  if (staff.status !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Staff account is not active.");
  }

  // 6. Use transaction to read and update request
  let requestData = null;

  await db.runTransaction(async (transaction) => {
    const requestRef = db.collection("request").doc(trimmedRequestId);
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found.");
    }
    const request = requestDoc.data();
    requestData = { id: trimmedRequestId, ...request };

    // 7. Validate Staff permission: must be the Staff responsible for this booking
    if (request.staff_id !== uid) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized for this booking.");
    }

    // 8. Validate request status must be accepted
    if (String(request.status || "").toLowerCase() !== "accepted") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Only accepted bookings can be checked in."
      );
    }

    // 9. Validate check-in time window
    const bookingStart = parseBookingStart(request.date, request.start_time);
    if (!bookingStart) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Unable to parse booking time."
      );
    }

    const now = new Date();
    const earliestCheckIn = new Date(bookingStart.getTime() - 15 * 60 * 1000);
    const latestCheckIn = new Date(bookingStart.getTime() + 15 * 60 * 1000);

    if (now < earliestCheckIn || now > latestCheckIn) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Check-in is only available from 15 minutes before to 15 minutes after the booking starts."
      );
    }

    // 10. Update request
    transaction.update(requestRef, {
      status: "in_progress",
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  // 11. Create notification (outside transaction, failure does not rollback)
  if (requestData) {
    try {
      // Collect recipients: member_id + participant_ids + user_id_list
      const recipientIds = [
        requestData.member_id,
        ...(requestData.participant_ids || []),
        ...(requestData.user_id_list || []),
      ]
        .filter(Boolean)
        .filter((id) => id !== uid); // Do not notify staff themselves

      // Deduplicate
      const uniqueRecipients = [...new Set(recipientIds)];

      if (uniqueRecipients.length > 0) {
        const batch = db.batch();
        for (const recipientId of uniqueRecipients) {
          const notifRef = db.collection("notification").doc();
          batch.set(notifRef, {
            member_id: recipientId,
            message: `Your booking at ${requestData.date} ${requestData.start_time}-${requestData.end_time} has been checked in.`,
            type: "facility_request",
            status_context: "in_progress",
            reference_id: requestData.id,
            is_read: false,
            created_at: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    } catch (notifError) {
      console.error("Failed to create notifications:", notifError);
    }
  }

  return { success: true };
});