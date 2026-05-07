/**
 * submitBookingRequest Cloud Function Implementation
 *
 * Based on submitBookingRequest_API_Implementation_v2.md
 *
 * ID type: string (all use string)
 * Status type: string
 * Error handling: throw new functions.https.HttpsError
 */

// Firebase Functions v1 implementation
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const { parseBookingStart, getLondonDateOffset } = require("./utils/time");

const db = admin.firestore();

// ============ Utility functions ============

/**
 * Convert hour number to string format ("09", "10")
 */
function toHourString(value) {
  const num = typeof value === "number" ? value : parseInt(value, 10);
  return String(num).padStart(2, "0");
}

/**
 * Convert hour string/number to number
 */
function toHourNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseInt(value.replace(":00", ""), 10);
  return parseInt(value || 0, 10);
}

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
 * Time overlap check: start1 < end2 && start2 < end1
 */
function hasTimeOverlap(start1, end1, start2, end2) {
  const s1 = toHourNumber(start1);
  const e1 = toHourNumber(end1);
  const s2 = toHourNumber(start2);
  const e2 = toHourNumber(end2);
  return s1 < e2 && s2 < e1;
}

// ============ Validation functions ============

/**
 * Basic parameter validation
 */
function validateBasicParams(data) {
  // Date normalization: support ISO string "2026-05-02T00:00:00.000Z" → "2026-05-02"
  if (data.date && typeof data.date === "string" && data.date.includes("T")) {
    data.date = data.date.split("T")[0];
  }

  // Required parameters
  assertRequired(data, ["facility_id", "date", "start_time", "end_time", "attendent", "activity_description"]);

  // Validate time granularity (integer)
  const startNum = toHourNumber(data.start_time);
  const endNum = toHourNumber(data.end_time);
  if (!Number.isInteger(startNum) || !Number.isInteger(endNum)) {
    throw new functions.https.HttpsError("invalid-argument", "Time must be integer");
  }

  // Validate time range
  if (startNum < 0 || startNum > 23 || endNum < 0 || endNum > 23) {
    throw new functions.https.HttpsError("invalid-argument", "Time must be between 0 and 23");
  }

  // start < end
  if (startNum >= endNum) {
    throw new functions.https.HttpsError("invalid-argument", "start_time must be less than end_time");
  }

  // Validate date range (today ~ today+7 days) - using London timezone
  const today = getLondonDateOffset(0);
  const maxDate = getLondonDateOffset(7);
  if (data.date < today || data.date > maxDate) {
    throw new functions.https.HttpsError("invalid-argument", "Date must be between today and 7 days from now");
  }

  // Validate booking must be at least 2 hours in advance
  const normalizedStartTime = toHourString(startNum);
  const bookingStart = parseBookingStart(data.date, normalizedStartTime);
  const now = new Date();
  const minAllowedStart = new Date(now.getTime() + 2 * 60 * 60 * 1000); // now + 2 hours

  if (bookingStart && bookingStart <= minAllowedStart) {
    throw new functions.https.HttpsError("invalid-argument", "Bookings must be made at least 2 hours in advance.");
  }

  // Validate duration (≤ 4 hours)
  if (endNum - startNum > 4) {
    throw new functions.https.HttpsError("invalid-argument", "Maximum booking duration is 4 hours");
  }

  // Validate number of people
  if (typeof data.attendent !== "number" || data.attendent < 1) {
    throw new functions.https.HttpsError("invalid-argument", "attendent must be at least 1");
  }

  // Validate activity description
  if (typeof data.activity_description !== "string" || data.activity_description.trim().length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "activity_description is required");
  }

  if (data.activity_description.length > 500) {
    throw new functions.https.HttpsError("invalid-argument", "activity_description max 500 characters");
  }

  return { startNum, endNum };
}

/**
 * Validate capacity and friends
 */
function validateCapacityAndFriends(facility, data) {
  // Capacity validation
  if (data.attendent > facility.capacity) {
    throw new functions.https.HttpsError("invalid-argument", `Exceeds facility capacity (max ${facility.capacity})`);
  }

  // Friends limit validation
  const userIdList = data.user_id_list || [];
  if (userIdList.length > data.attendent - 1) {
    throw new functions.https.HttpsError("invalid-argument", "Too many friends (max attendant - 1)");
  }

  return userIdList;
}

/**
 * Validate time conflicts
 */
async function checkTimeConflicts(facilityId, date, startNum, endNum, excludeRequestId = null) {
  // Build hour range
  const hours = [];
  for (let h = startNum; h < endNum; h++) {
    hours.push(h);
  }

  // Query all time_slot for this facility on this date
  const slotsSnapshot = await db
    .collection("time_slot")
    .where("facility_id", "==", facilityId)
    .where("date", "==", date)
    .get();

  // Filter needed time slots
  const relevantSlots = [];
  for (const slot of slotsSnapshot.docs) {
    const slotHour = toHourNumber(slot.data().start_time);
    if (hours.includes(slotHour)) {
      relevantSlots.push({ id: slot.id, ...slot.data() });
    }
  }

  // Validate existence
  if (relevantSlots.length !== hours.length) {
    throw new functions.https.HttpsError("resource-exhausted", "Time slot not available");
  }

  // Validate lock status
  for (const slot of relevantSlots) {
    if (slot.status === "locked") {
      throw new functions.https.HttpsError("resource-exhausted", "Time slot already booked");
    }
  }

  return relevantSlots;
}

/**
 * Validate user/friends time conflicts
 */
async function checkUserConflicts(memberId, date, startNum, endNum, friendIds = []) {
  // Build query: same day, same time, status pending/accepted
  const requestsSnapshot = await db
    .collection("request")
    .where("date", "==", date)
    .where("status", "in", ["pending", "accepted"])
    .get();

  const allIds = [memberId, ...friendIds];

  for (const doc of requestsSnapshot.docs) {
    const req = doc.data();

    // Exclude own request (if in modify scenario)
    if (req.member_id === memberId && req.status === "pending") {
      // Check time overlap
      if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "You have a conflicting booking in this time period"
        );
      }
    }

    // Check friends conflict
    if (req.participant_ids && req.participant_ids.length > 0) {
      for (const friendId of friendIds) {
        if (req.member_id === friendId || req.participant_ids.includes(friendId)) {
          if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
            throw new functions.https.HttpsError(
              "failed-precondition",
              "One of your friends has a conflicting booking"
            );
          }
        }
      }
    }
  }
}

// ============ Main function ============

/**
 * submitBookingRequest Cloud Function
 *
 * Business logic:
 * 1. Basic parameter validation
 * 2. Read facility and validate existence and availability
 * 3. Capacity and friends validation
 * 4. Check time conflicts (outside transaction)
 * 5. Check user/friends conflicts (outside transaction)
 * 6. In Transaction:
 *    - Create request
 *    - Lock time_slot
 * 7. Create notification (outside transaction)
 */
exports.submitBookingRequest = functions.https.onCall(async (data, context) => {
  // Validate user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const memberId = context.auth.uid;

  // 1.1 Validate member identity
  const memberDoc = await db.collection("member").doc(memberId).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Only members can submit booking requests");
  }
  const member = memberDoc.data();
  if (member.status && member.status !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Member account is not active");
  }

  // 1. Basic parameter validation
  const { startNum, endNum } = validateBasicParams(data);

  // 2. Read facility
  const facilityDoc = await db.collection("facility").doc(data.facility_id).get();
  if (!facilityDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Facility not found");
  }

  const facility = facilityDoc.data();

  // Validate facility status
  if (facility.status !== "normal") {
    throw new functions.https.HttpsError("failed-precondition", "Facility is not available");
  }

  // Validate business hours
  if (startNum < facility.start_time || endNum > facility.end_time) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Facility is open from ${facility.start_time}:00 to ${facility.end_time}:00`
    );
  }

  // 3. Capacity and friends validation
  const userIdList = validateCapacityAndFriends(facility, data);

  // 4. Check time conflicts (get time slots to lock)
  const slotsToLock = await checkTimeConflicts(
    data.facility_id,
    data.date,
    startNum,
    endNum
  );

  // 5. Check user/friends conflicts
  await checkUserConflicts(memberId, data.date, startNum, endNum, userIdList);

  // 6. Write request and lock time_slot in Transaction
  const requestRef = db.collection("request").doc();
  const involvedIds = new Set([memberId, ...userIdList]);

  await db.runTransaction(async (transaction) => {
    // Re-check time_slot status (prevent concurrency)
    for (const slot of slotsToLock) {
      const slotRef = db.collection("time_slot").doc(slot.id);
      const slotDoc = await transaction.get(slotRef);
      if (!slotDoc.exists || slotDoc.data().status !== "open") {
        throw new functions.https.HttpsError("resource-exhausted", "Time slot was booked by another user");
      }
    }

    // Re-check user conflicts (prevent concurrency)
    const requestsSnapshot = await transaction.get(
      db.collection("request").where("date", "==", data.date)
    );
    for (const doc of requestsSnapshot.docs) {
      const req = doc.data();
      if (req.status === "pending" || req.status === "accepted") {
        // Check organizer
        if (req.member_id === memberId) {
          if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
            throw new functions.https.HttpsError(
              "failed-precondition",
              "You have a conflicting booking"
            );
          }
        }
        // Check friends
        if (req.participant_ids && req.participant_ids.length > 0) {
          for (const friendId of userIdList) {
            if (req.member_id === friendId || req.participant_ids.includes(friendId)) {
              if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
                throw new functions.https.HttpsError(
                  "failed-precondition",
                  "Friend has a conflicting booking"
                );
              }
            }
          }
        }
      }
    }

    // Create request
    transaction.set(requestRef, {
      member_id: memberId,
      facility_id: data.facility_id,
      staff_id: facility.staff_id || "",
      attendent: data.attendent,
      activity_description: data.activity_description.trim(),
      status: "pending",
      staff_response: "",
      date: data.date,
      start_time: toHourString(startNum),
      end_time: toHourString(endNum),
      participant_ids: userIdList,
      created_at: FieldValue.serverTimestamp(),
      completed_at: ""
    });

    // Lock time_slot
    for (const slot of slotsToLock) {
      const slotRef = db.collection("time_slot").doc(slot.id);
      transaction.update(slotRef, {
        status: "locked",
        request_id: requestRef.id,
        updated_at: FieldValue.serverTimestamp()
      });
    }
  });

  // 7. Create notification (outside transaction)
  // Note: notification failure does not affect main flow (request and time_slot already written successfully)

  // Debug log: confirm entering notification logic
  console.log("Creating notifications for involved IDs:", Array.from(involvedIds));
  console.log("Facility staff_id:", facility.staff_id);

  try {
    // Notify member and friends
    const involvedIdList = Array.from(involvedIds);
    const memberNotifications = involvedIdList.map((userId) => ({
      recipient_id: userId,
      information: `Your booking request for ${facility.name} on ${data.date} ${toHourString(startNum)}-${toHourString(endNum)} has been submitted.`,
      type: "facility_request",
      status: "pending",
      related_id: requestRef.id,
      created_at: FieldValue.serverTimestamp()
    }));

    // Notify staff
    if (facility.staff_id) {
      memberNotifications.push({
        recipient_id: facility.staff_id,
        information: `A new booking request for ${facility.name} is waiting for approval.`,
        type: "facility_request",
        status: "pending",
        related_id: requestRef.id,
        created_at: FieldValue.serverTimestamp()
      });
    }

    console.log("Total notifications to create:", memberNotifications.length);

    // Batch write notification
    if (memberNotifications.length === 0) {
      console.log("No notifications to create.");
    } else {
      const batch = db.batch();
      for (const notif of memberNotifications) {
        const notifRef = db.collection("notification").doc();
        batch.set(notifRef, notif);
      }
      await batch.commit();
      console.log("Notifications created successfully.");
    }
  } catch (notifError) {
    // Notification failure does not affect main flow, only log complete error
    console.error("Failed to create notifications:", notifError);
  }

  // Return success
  return {
    success: true,
    request_id: requestRef.id
  };
});