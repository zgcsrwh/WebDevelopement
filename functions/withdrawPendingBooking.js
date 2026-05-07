/**
 * withdrawPendingBooking Cloud Function Implementation
 *
 * Based on withdrawPendingBooking_API_Design.md and withdrawPendingBooking_Implementation_Plan.md
 *
 * Business logic:
 * 1. Validate user is logged in (from context.auth.uid)
 * 2. Validate request_id is required
 * 3. Validate member exists and status === "active" outside transaction
 * 4. Validate request exists, status === "pending", member_id === current user in transaction
 * 5. Query and release all time_slots bound to request_id
 * 6. Update request: status = "cancelled", completed_at, updated_at
 * 7. Create notification outside transaction (failure does not rollback)
 * 8. Do not modify member.cancel_times
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { parseBookingStart } = require("./utils/time");

const db = admin.firestore();

// ============ Main function ============

exports.withdrawPendingBooking = functions.https.onCall(async (data, context) => {
  // 1. Validate user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const uid = context.auth.uid;

  // 2. Validate request_id is required
  const requestId = typeof data.request_id === "string" ? data.request_id.trim() : "";
  if (!requestId) {
    throw new functions.https.HttpsError("invalid-argument", "request_id is required");
  }

  // 3. Read and validate member outside transaction
  const memberRef = db.collection("member").doc(uid);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("failed-precondition", "Member account not found");
  }

  const memberData = memberDoc.data();
  if (memberData.status !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Member account is not active");
  }

  // Declare external variable (used to create notification after transaction succeeds)
  let withdrawnRequest = null;

  // 4. Execute core operations in Transaction
  await db.runTransaction(async (transaction) => {
    // 4.1 Read request document
    const requestRef = db.collection("request").doc(requestId);
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found");
    }

    const request = requestDoc.data();

    // 4.2 Validate request.member_id === uid (can only withdraw own request)
    if (request.member_id !== uid) {
      throw new functions.https.HttpsError("permission-denied", "You can only withdraw your own booking request");
    }

    // 4.3 Validate request.status === "pending" (can only withdraw pending status)
    if (request.status !== "pending") {
      throw new functions.https.HttpsError("failed-precondition", "Only pending requests can be withdrawn");
    }

    // 4.4 Validate 2 hour lock period
    const bookingStart = parseBookingStart(request.date, request.start_time);
    if (!bookingStart) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Invalid booking time"
      );
    }

    const now = new Date();
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    if (bookingStart.getTime() - now.getTime() <= TWO_HOURS) {
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Pending booking requests can only be withdrawn at least 2 hours before start time."
      );
    }

    // 4.5 Query all time_slots bound to this request_id
    const slotsSnapshot = await transaction.get(
      db.collection("time_slot").where("request_id", "==", requestId)
    );

    // 4.6 Validate at least one time_slot found
    if (slotsSnapshot.empty) {
      throw new functions.https.HttpsError("failed-precondition", "Time slot not found, booking state may have changed");
    }

    // 4.7 Save request data to external variable (used to create notification after transaction succeeds)
    withdrawnRequest = { id: requestId, ...request };

    // 4.8 Update request status to cancelled
    transaction.update(requestRef, {
      status: "cancelled",
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    // 4.9 Release all time_slots
    for (const slotDoc of slotsSnapshot.docs) {
      transaction.update(slotDoc.ref, {
        status: "open",
        request_id: "",
        updated_at: FieldValue.serverTimestamp()
      });
    }
  });

  // 5. Create notification outside Transaction
  if (withdrawnRequest) {
    try {
      // Notification recipients: staff_id + participant_ids (do not notify initiator)
      const recipientIds = [
        withdrawnRequest.staff_id,
        ...(withdrawnRequest.participant_ids || [])
      ].filter((recipientId) => recipientId && recipientId !== uid);

      const uniqueRecipients = [...new Set(recipientIds)];

      if (uniqueRecipients.length > 0) {
        const message = `The pending booking request for ${withdrawnRequest.date} ${withdrawnRequest.start_time}-${withdrawnRequest.end_time} has been withdrawn.`;

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
      }
    } catch (notifError) {
      console.error("Failed to create notifications:", notifError);
    }
  }

  // 6. Return success
  return { success: true };
});
