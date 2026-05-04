/**
 * upsertFacility Cloud Function
 *
 * Admin 侧创建或编辑 facility
 *
 * 创建：facility_id 为空/不传
 * 编辑：facility_id 非空
 *
 * 业务规则：
 * - 创建：所有必传字段，写入 status=normal, scheduled_change=null
 * - 编辑：立即生效字段 name/description/usage_guidelines/location
 * - 编辑：禁止修改 sport_type/capacity（保持原值）
 * - 编辑：start_time/end_time 进入 scheduled_change，effective_on=London today+8
 * - 编辑：staff_id 同步 pending/accepted/upcoming 请求
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// 引入 time.js helper
const { getLondonDateOffset } = require("./utils/time");

/**
 * Admin 权限校验
 *
 * @param {object} context - Cloud Function context
 * @returns {Promise<object>} admin_staff 文档数据
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
 * Staff 有效性校验
 *
 * @param {string} staffId - staff 文档 ID
 * @returns {Promise<object>} staff 文档数据
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
 * Facility 存在性和状态校验
 *
 * @param {string} facilityId - facility 文档 ID
 * @returns {Promise<object>} facility 文档数据
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
 * 同步 pending/accepted/upcoming 请求的 staff_id
 *
 * @param {string} facilityId - facility ID
 * @param {string} newStaffId - 新的 staff ID
 * @returns {Promise<number>} 更新的请求数量
 */
async function syncActiveFacilityAssignments(facilityId, newStaffId) {
  // 同步范围：pending, accepted, upcoming（upcoming 兼容旧数据）
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
 * 参数标准化
 *
 * @param {object} data - 前端传入的 payload
 * @returns {object} 标准化后的参数
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
 * 参数校验
 *
 * @param {object} payload - 标准化后的参数
 * @param {boolean} isCreate - 是否创建模式
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

  // capacity 校验：只在 create 模式下校验
  if (isCreate && payload.capacity) {
    if (payload.capacity < 1 || payload.capacity > 200) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Capacity must be between 1 and 200"
      );
    }
  }

  // opening hours 校验
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
  // 1. Admin 权限校验
  await assertAdminAuth(context);

  // 2. 参数标准化
  const payload = normalizePayload(data);

  // 3. 判断创建还是编辑
  const isCreate = !payload.facility_id;

  // 4. 参数校验
  validatePayload(payload, isCreate);

  // 5. staff 校验
  await validateStaff(payload.staff_id);

  if (isCreate) {
    // ========== 创建分支 ==========
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
    // ========== 编辑分支 ==========
    // 5. facility 存在性校验
    const facility = await validateFacility(payload.facility_id);

    // 检查 start_time/end_time 是否有变化
    const originalStartTime = facility.start_time;
    const originalEndTime = facility.end_time;
    const startTimeChanged =
      originalStartTime !== payload.start_time ||
      originalEndTime !== payload.end_time;

    // 构建更新字段
    const updateData = {
      name: payload.name,
      description: payload.description,
      usage_guidelines: payload.usage_guidelines,
      location: payload.location,
      updated_at: FieldValue.serverTimestamp(),
    };

    // staff_id：如果新值不同，则更新
    if (payload.staff_id !== facility.staff_id) {
      updateData.staff_id = payload.staff_id;

      // 同步 pending/accepted/upcoming 请求
      await syncActiveFacilityAssignments(
        payload.facility_id,
        payload.staff_id
      );
    }

    // start_time/end_time：检查是否需要 scheduled_change
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

    // 更新 Firestore
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