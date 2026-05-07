/**
 * settleNoShowBookings - No-show auto settlement
 *
 * Runs at 15 minutes past every hour
 * Scans accepted bookings that have passed booking start time by 15 minutes but were not check-in
 * Automatically updates to no_show status
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// Import common time utilities
const { getNoShowTarget } = require("./utils/time");

/**
 * No-show auto settlement core logic
 *
 * @param {Date} now - Optional, default new Date()
 * @returns {object} { scanned, settled, skipped, notificationFailures }
 */
async function processNoShowSettlements(now = new Date()) {
  const result = {
    scanned: 0,
    settled: 0,
    skipped: 0,
    notificationFailures: 0,
  };

  // Calculate targetDate / targetHour (current hour + 15 minutes)
  const { targetDate, targetHour } = getNoShowTarget(now);

  console.log(`[settleNoShowBookings] Processing for ${targetDate} ${targetHour}:00`);

  // Query matching request
  const snapshot = await db
    .collection("request")
    .where("status", "==", "accepted")
    .where("date", "==", targetDate)
    .where("start_time", "==", targetHour)
    .get();

  result.scanned = snapshot.size;
  console.log(`[settleNoShowBookings] Found ${snapshot.size} matching requests`);

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

        // Check status is still accepted (may have been check-in by Staff)
        if (String(request.status || "").toLowerCase() !== "accepted") {
          return { action: "skip" };
        }

        // Update request to no_show
        transaction.update(requestRef, {
          status: "no_show",
          completed_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
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
            message: "You did not arrive for your booking on time. This has been recorded as a no-show.",
            type: "facility_request",
            status_context: "no_show",
            reference_id: requestId,
            is_read: false,
            created_at: FieldValue.serverTimestamp(),
          });
          result.settled += 1;
          console.log(`[settleNoShowBookings] Settled no-show for request ${requestId}`);
        } catch (notifError) {
          result.notificationFailures += 1;
          console.error(`[settleNoShowBookings] Failed to create notification for ${requestId}:`, notifError.message);
        }
      }
    } catch (error) {
      result.skipped += 1;
      console.error(`[settleNoShowBookings] Error processing request ${requestId}:`, error.message);
    }
  }

  console.log(`[settleNoShowBookings] Done. scanned=${result.scanned}, settled=${result.settled}, skipped=${result.skipped}, notificationFailures=${result.notificationFailures}`);

  return result;
}

// Cloud Function entry point
exports.settleNoShowBookings = functions.pubsub
  .schedule("15 * * * *")
  .timeZone("Europe/London")
  .onRun(async (context) => {
    console.log("[settleNoShowBookings] Starting...");
    try {
      const result = await processNoShowSettlements();
      console.log("[settleNoShowBookings] Completed:", result);
    } catch (error) {
      console.error("[settleNoShowBookings] Error:", error.message);
    }
  });

// Export core logic for testing
module.exports = {
  settleNoShowBookings: exports.settleNoShowBookings,
  processNoShowSettlements,
};