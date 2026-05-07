/**
 * sendBookingReminders - Automatic reminder 2 hours before booking
 *
 * Runs on the hour every hour
 * Scans accepted bookings starting in 2 hours and sends reminder to member
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// Import common time utilities
const { getReminderTarget } = require("./utils/time");

/**
 * Core reminder logic 2 hours before booking
 *
 * @param {Date} now - Optional, default new Date()
 * @returns {object} { scanned, reminded, skipped, notificationFailures }
 */
async function processBookingReminders(now = new Date()) {
  const result = {
    scanned: 0,
    reminded: 0,
    skipped: 0,
    notificationFailures: 0,
  };

  // Calculate targetDate / targetHour (current + 2 hours)
  const { targetDate, targetHour } = getReminderTarget(now);

  console.log(`[sendBookingReminders] Processing for ${targetDate} ${targetHour}:00`);

  // Query matching request
  const snapshot = await db
    .collection("request")
    .where("status", "==", "accepted")
    .where("date", "==", targetDate)
    .where("start_time", "==", targetHour)
    .get();

  result.scanned = snapshot.size;
  console.log(`[sendBookingReminders] Found ${snapshot.size} matching requests`);

  // Process each request
  for (const doc of snapshot.docs) {
    const requestId = doc.id;

    try {
      // Transaction returns whether notification needs to be created
      const shouldNotify = await db.runTransaction(async (transaction) => {
        const requestRef = db.collection("request").doc(requestId);
        const requestDoc = await transaction.get(requestRef);

        if (!requestDoc.exists) {
          return { action: "skip" };
        }

        const request = requestDoc.data();

        // Check status is still accepted
        if (String(request.status || "").toLowerCase() !== "accepted") {
          return { action: "skip" };
        }

        // Check reminder not sent
        if (request.reminder_sent_at) {
          return { action: "skip" };
        }

        // Write reminder_sent_at
        transaction.update(requestRef, {
          reminder_sent_at: FieldValue.serverTimestamp(),
        });

        // Return request data for subsequent notification creation
        return { action: "notify", request };
      });

      // Process based on transaction return result
      if (shouldNotify.action === "skip") {
        result.skipped += 1;
        continue;
      }

      // action === "notify", create notification
      if (shouldNotify.action === "notify" && shouldNotify.request) {
        try {
          const notifRef = db.collection("notification").doc();
          await notifRef.set({
            member_id: shouldNotify.request.member_id,
            message: "Your booking will start in 2 hours. Please arrive at the sports centre on time for check-in.",
            type: "facility_request",
            status_context: "reminder",
            reference_id: requestId,
            is_read: false,
            created_at: FieldValue.serverTimestamp(),
          });
          result.reminded += 1;
          console.log(`[sendBookingReminders] Sent reminder for request ${requestId}`);
        } catch (notifError) {
          result.notificationFailures += 1;
          console.error(`[sendBookingReminders] Failed to create notification for ${requestId}:`, notifError.message);
        }
      }
    } catch (error) {
      result.skipped += 1;
      console.error(`[sendBookingReminders] Error processing request ${requestId}:`, error.message);
    }
  }

  console.log(`[sendBookingReminders] Done. scanned=${result.scanned}, reminded=${result.reminded}, skipped=${result.skipped}, notificationFailures=${result.notificationFailures}`);

  return result;
}

// Cloud Function entry point
exports.sendBookingReminders = functions.pubsub
  .schedule("0 * * * *")
  .timeZone("Europe/London")
  .onRun(async (context) => {
    console.log("[sendBookingReminders] Starting...");
    try {
      const result = await processBookingReminders();
      console.log("[sendBookingReminders] Completed:", result);
    } catch (error) {
      console.error("[sendBookingReminders] Error:", error.message);
    }
  });

// Export core logic for testing
module.exports = {
  sendBookingReminders: exports.sendBookingReminders,
  processBookingReminders,
};