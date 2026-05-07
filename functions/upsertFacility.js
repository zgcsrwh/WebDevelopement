/**
 * upsertFacility Cloud Function
 *
 * Admin creates or edits facility
 *
 * Create: facility_id is empty/not passed
 * Edit: facility_id is provided
 *
 * Business rules:
 * - Create: Required fields, write status=normal, scheduled_change=null
 * - Edit: Immediate fields: name/description/usage_guidelines/location
 * - Edit: Cannot modify sport_type/capacity (keep original values)
 * - Edit: start_time/end_time go to scheduled_change, effective_on=London today+8
 * - Edit: staff_id syncs to pending/accepted/upcoming requests
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// Import time.js helper
const { getLondonDateOffset } = require("./utils/time");

/**
 * Admin permission validation
 *
 * @param {object} context - Cloud Function context
 * @returns {Promise<object>} admin_staff document data
 */
async function assertAdminAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be logged in"
    );
  }

  const uid = context.auth.uid;
  const doc = await db.collection("admin_staff").doc(uid).get();

  if (!doc.exists) {
    throw new functions.https.HttpsError("not-found", "Admin account not found");
  }

  const data = doc.data();
  const role = String(data.role || "").toLowerCase();
  const status = String(data.status || "").toLowerCase();

  if (role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can perform this operation"
    );
  }

  if (status !== "active") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin account is not active"
    );
  }

  return data;
}

/**
 * Staff validity validation
 *
 * @param {string} staffId - staff document ID
 * @returns {Promise<object>} staff document data
 */
async function validateStaff(staffId) {
  if (!staffId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "staff_id is required"
    );
  }

  const doc = await db.collection("admin_staff").doc(staffId).get();

  if (!doc.exists) {
    throw new functions.https.HttpsError("not-found", "Staff member not found");
  }

  const data = doc.data();
  const role = String(data.role || "").toLowerCase();
  const status = String(data.status || "").toLowerCase();

  if (role !== "staff") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assigned member must be a Staff"
    );
  }

  if (status !== "active") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assigned staff member is not active"
    );
  }

  return data;
}

/**
 * Facility existence and status validation
 *
 * @param {string} facilityId - facility document ID
 * @returns {Promise<object>} facility document data
 */
async function validateFacility(facilityId) {
  const doc = await db.collection("facility").doc(facilityId).get();

  if (!doc.exists) {
    throw new functions.https.HttpsError("not-found", "Facility not found");
  }

  const data = doc.data();
  const status = String(data.status || "").toLowerCase();

  if (status === "deleted") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Deleted facilities cannot be edited"
    );
  }

  return data;
}

/**
 * Sync pending/accepted/upcoming requests' staff_id
 *
 * @param {string} facilityId - facility ID
 * @param {string} newStaffId - new staff ID
 * @returns {Promise<number>} Number of updated requests
 */
async function syncActiveFacilityAssignments(facilityId, newStaffId) {
  // Sync range: pending, accepted, upcoming (upcoming compatible with legacy data)
  const targetStatuses = ["pending", "accepted", "upcoming"];

  const snapshot = await db
    .collection("request")
    .where("facility_id", "==", facilityId)
    .where("status", "in", targetStatuses)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      staff_id: newStaffId,
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return snapshot.size;
}

/**
 * Parameter normalization
 *
 * @param {object} data - Payload from frontend
 * @returns {object} Normalized parameters
 */
function normalizePayload(data) {
  if (!data || typeof data !== "object") {
    data = {};
  }

  const normalized = {
    facility_id: data.facility_id
      ? String(data.facility_id).trim()
      : "",
    name: data.name ? String(data.name).trim() : "",
    sport_type: data.sport_type ? String(data.sport_type).trim() : "",
    description: data.description
      ? String(data.description).trim()
      : "",
    usage_guidelines: data.usage_guidelines
      ? String(data.usage_guidelines).trim()
      : "",
    capacity: data.capacity ? Number(data.capacity) : 0,
    location: data.location ? String(data.location).trim() : "",
    start_time: data.start_time ? Number(data.start_time) : 0,
    end_time: data.end_time ? Number(data.end_time) : 0,
    staff_id: data.staff_id ? String(data.staff_id).trim() : "",
  };

  return normalized;
}

/**
 * Parameter validation
 *
 * @param {object} payload - Normalized parameters
 * @param {boolean} isCreate - Whether in create mode
 */
function validatePayload(payload, isCreate) {
  const requiredFields = [
    { field: "name", msg: "Name is required" },
    { field: "sport_type", msg: "Sport type is required" },
    { field: "description", msg: "Description is required" },
    { field: "usage_guidelines", msg: "Usage guidelines is required" },
    { field: "location", msg: "Location is required" },
    { field: "staff_id", msg: "Staff is required" },
  ];

  if (isCreate) {
    for (const { field, msg } of requiredFields) {
      if (!payload[field]) {
        throw new functions.https.HttpsError("invalid-argument", msg);
      }
    }
  }

  // Capacity validation: only in create mode
  if (isCreate && payload.capacity) {
    if (payload.capacity < 1 || payload.capacity > 200) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Capacity must be between 1 and 200"
      );
    }
  }

  // Opening hours validation
  const startTime = payload.start_time;
  const endTime = payload.end_time;

  if (isCreate && (startTime === 0 || endTime === 0)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Opening hours are required"
    );
  }

  if (startTime < 0 || startTime > 23 || endTime < 0 || endTime > 23) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Opening hours must be between 0 and 23"
    );
  }

  if (startTime >= endTime) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Start time must be less than end time"
    );
  }
}

// Main function
exports.upsertFacility = functions.https.onCall(async (data, context) => {
  // 1. Admin permission validation
  await assertAdminAuth(context);

  // 2. Parameter normalization
  const payload = normalizePayload(data);

  // 3. Determine create or edit
  const isCreate = !payload.facility_id;

  // 4. Parameter validation
  validatePayload(payload, isCreate);

  // 5. Staff validation
  await validateStaff(payload.staff_id);

  if (isCreate) {
    // ========== Create branch ==========
    const newId = db.collection("facility").doc().id;

    const facilityData = {
      name: payload.name,
      sport_type: payload.sport_type,
      description: payload.description,
      usage_guidelines: payload.usage_guidelines,
      capacity: payload.capacity,
      location: payload.location,
      start_time: payload.start_time,
      end_time: payload.end_time,
      staff_id: payload.staff_id,
      status: "normal",
      scheduled_change: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await db.collection("facility").doc(newId).set(facilityData);

    return {
      success: true,
      facility_id: newId,
    };
  } else {
    // ========== Edit branch ==========
    // 5. Facility existence validation
    const facility = await validateFacility(payload.facility_id);

    // Check if start_time/end_time have changed
    const originalStartTime = facility.start_time;
    const originalEndTime = facility.end_time;
    const startTimeChanged =
      originalStartTime !== payload.start_time ||
      originalEndTime !== payload.end_time;

    // Build update fields
    const updateData = {
      name: payload.name,
      description: payload.description,
      usage_guidelines: payload.usage_guidelines,
      location: payload.location,
      updated_at: FieldValue.serverTimestamp(),
    };

    // staff_id: Update if new value is different
    if (payload.staff_id !== facility.staff_id) {
      updateData.staff_id = payload.staff_id;

      // Sync pending/accepted/upcoming requests
      await syncActiveFacilityAssignments(
        payload.facility_id,
        payload.staff_id
      );
    }

    // start_time/end_time: Check if scheduled_change is needed
    let scheduledChange = null;
    if (startTimeChanged) {
      const effectiveOn = getLondonDateOffset(8);
      scheduledChange = {
        type: "update",
        effective_on: effectiveOn,
        payload: {
          start_time: payload.start_time,
          end_time: payload.end_time,
        },
      };
    }

    if (scheduledChange) {
      updateData.scheduled_change = scheduledChange;
    }

    // Update Firestore
    await db
      .collection("facility")
      .doc(payload.facility_id)
      .update(updateData);

    return {
      success: true,
      facility_id: payload.facility_id,
      effective_on: scheduledChange?.effective_on || "",
    };
  }
});