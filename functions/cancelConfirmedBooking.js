/**
 * cancelConfirmedBooking Cloud Function Implementation
 *
 * Based on cancelConfirmedBooking_API_Design.md and cancelConfirmedBooking_Implementation_Plan.md
 *
 * Business logic:
 * 1. Validate user is logged in (from context.auth.uid)
 * 2. Validate request_id is required
 * 3. Validate member exists and status === "active"
 * 4. Validate request exists, status === "accepted", member_id === current user
 * 5. Validate that booking start time is more than 2 hours away
 * 6. In Transaction: update request, release time_slot, increment cancel_times
 * 7. Outside Transaction: create notification (failure does not rollback)
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

// ============ Main function ============

exports.cancelConfirmedBooking = functions.https.onCall(async (data, context) => {
  // 1. Validate user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const uid = context.auth.uid;
  const requestId = data.request_id;

  // 2. Validate request_id is required
  assertRequired(data, ["request_id"]);

  // Declare external variable (used to create notification after transaction succeeds)
  let cancelledRequest = null;

  // 3. Execute all operations in Transaction
  await db.runTransaction(async (transaction) => {
    // 3.1 Read member document
    const memberRef = db.collection("member").doc(uid);
    const memberDoc = await transaction.get(memberRef);

    if (!memberDoc.exists) {
      throw new functions.https.HttpsError("failed-precondition", "Member account not found");
    }

    const memberData = memberDoc.data();
    if (memberData.status !== "active") {
      throw new functions.https.HttpsError("failed-precondition", "Member account is not active");
    }

    // 3.2 Read request document
    const requestRef = db.collection("request").doc(requestId);
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found");
    }

    const request = requestDoc.data();

    // 3.3 Validate request.member_id === uid
    if (request.member_id !== uid) {
      throw new functions.https.HttpsError("permission-denied", "You can only cancel your own booking");
    }

    // 3.4 Validate request.status === "accepted"
    if (request.status !== "accepted") {
      throw new functions.https.HttpsError("failed-precondition", "Only accepted bookings can be cancelled");
    }

    // 3.5 Calculate bookingStart and validate 2 hour limit
    const startTime = String(request.start_time || "").padStart(2, "0");
    const bookingStart = new Date(`${request.date}T${startTime}:00`);

    if (Number.isNaN(bookingStart.getTime())) {
      throw new functions.https.HttpsError("failed-precondition", "Invalid booking time");
    }

    const now = new Date();
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    if (bookingStart.getTime() - now.getTime() <= TWO_HOURS) {
      throw new functions.https.HttpsError("deadline-exceeded", "Cancellation must be at least 2 hours before start time");
    }

    // 3.6 Query related time_slot
    const slotsSnapshot = await transaction.get(
      db.collection("time_slot").where("request_id", "==", requestId)
    );

    // 3.7 Validate at least one time_slot is found
    if (slotsSnapshot.empty) {
      throw new functions.https.HttpsError("failed-precondition", "Time slot not found, booking state may have changed");
    }

    // 3.8 Save request data to external variable (used to create notification after transaction succeeds)
    cancelledRequest = { id: requestId, ...request };

    // 3.9 Update request
    transaction.update(requestRef, {
      status: "cancelled",
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    // 3.10 Release all time_slots
    for (const slotDoc of slotsSnapshot.docs) {
      transaction.update(slotDoc.ref, {
        status: "open",
        request_id: "",
        updated_at: FieldValue.serverTimestamp()
      });
    }

    // 3.11 Update member.cancel_times
    transaction.update(memberRef, {
      cancel_times: FieldValue.increment(1)
    });
  });

  // 4. Create notification outside Transaction
  if (cancelledRequest) {
    try {
      const recipientIds = [
        cancelledRequest.member_id,
        cancelledRequest.staff_id,
        ...(cancelledRequest.participant_ids || [])
      ].filter(Boolean);

      const uniqueRecipients = [...new Set(recipientIds)];

      const message = `The confirmed booking for ${cancelledRequest.date} ${cancelledRequest.start_time}-${cancelledRequest.end_time} has been cancelled.`;

      const batch = db.batch();
      for (const recipientId of uniqueRecipients) {
        const notifRef = db.collection("notification").doc();
        batch.set(notifRef, {
          member_id: recipientId,
          message: message,
          type: "facility_request",
          status_context: "cancelled",
          reference_id: requestId,
          is_read: false,
          created_at: FieldValue.serverTimestamp()
        });
      }
      await batch.commit();
    } catch (notifError) {
      console.error("Failed to create notifications:", notifError);
    }
  }

  // 5. Return success
  return { success: true };
});
