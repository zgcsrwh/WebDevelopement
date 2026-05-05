/**
 * deleteFacility Cloud Function 实现
 *
 * 基于 deleteFacility_Implementation_Plan.md
 *
 * ID 类型：全部使用 string
 * Status 类型：string
 * 错误处理：throw new functions.https.HttpsError
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// ============ 工具函数 ============

/**
 * 校验必传参数
 */
function assertRequired(data, fields) {
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      throw new functions.https.HttpsError("invalid-argument", `${field} is required`);
    }
  }
}

/**
 * 分批处理 batch 操作
 * @param {Array} docs - 文档数组
 * @param {Function} operation - 操作函数 (batch, doc) => void
 * @returns {Promise<number>} 处理的文档数量
 */
async function batchProcess(docs, operation) {
  if (docs.length === 0) return 0;

  let currentBatch = db.batch();
  let currentCount = 0;
  const batches = [];

  for (const doc of docs) {
    operation(currentBatch, doc);
    currentCount++;

    // 每 499 条一个 batch（安全阈值）
    if (currentCount >= 499) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      currentCount = 0;
    }
  }

  // 处理剩余的
  if (currentCount > 0) {
    batches.push(currentBatch);
  }

  // 执行所有 batch
  for (const batch of batches) {
    await batch.commit();
  }

  return docs.length;
}

/**
 * 格式化时间（安全版本）
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

// ============ 主函数 ============

/**
 * 删除场地设施
 *
 * 功能：
 * 1. 校验 Admin 权限
 * 2. 更新 facility 状态为 deleted
 * 3. 取消相关的 pending/accepted/upcoming/in_progress request
 * 4. 终止相关的 pending/in_progress repair
 * 5. 删除相关的 time_slot
 * 6. 检查并更新 staff assignment_status
 * 7. 发送通知
 */
exports.deleteFacility = functions.https.onCall(async (data, context) => {
  // ========== 1. 权限校验 ==========
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be logged in"
    );
  }

  const uid = context.auth.uid;

  // 查询 admin_staff 确认角色
  const adminDoc = await db.collection("admin_staff").doc(uid).get();

  if (!adminDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Admin account not found");
  }

  const adminData = adminDoc.data();
  const role = String(adminData.role || "").toLowerCase();
  const status = String(adminData.status || "").toLowerCase();

  // 校验 role（兼容大小写：Admin/admin）
  if (role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can perform this operation"
    );
  }

  // 校验 status
  if (status !== "active") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin account is not active"
    );
  }

  // ========== 2. facility_id 校验 ==========
  assertRequired(data, ["facility_id"]);

  const facility_id = String(data.facility_id).trim();

  if (!facility_id) {
    throw new functions.https.HttpsError("invalid-argument", "facility_id is required");
  }

  // ========== 3. 读取 facility ==========
  const facilityRef = db.collection("facility").doc(facility_id);
  const facilityDoc = await facilityRef.get();

  if (!facilityDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Facility not found");
  }

  const facility = facilityDoc.data();
  const facilityName = facility.name || facility_id;

  // 检查是否已删除
  if (facility.status === "deleted") {
    throw new functions.https.HttpsError("failed-precondition", "Facility already deleted");
  }

  // ========== 4. 统计和初始化 ==========
  const stats = {
    cancelledRequests: 0,
    deletedTimeSlots: 0,
    terminatedRepairs: 0,
    staffMarkedUnassigned: false,
    notificationsCreated: 0,
    notificationFailures: 0
  };

  // ========== 5. 更新 facility（使用 transaction）==========
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

  // ========== 6. 查询并取消 request ==========
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
      // 保存 { id: requestDocId, data: requestData } 用于 notification
      requestDataForNotification.push({ id: doc.id, data: req });
    }
  });

  // 使用 batch 分批更新 request
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

  // ========== 7. 查询并终止 repair ==========
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

  // 使用 batch 分批更新 repair
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

  // ========== 8. 删除 time_slot ==========
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

  // ========== 9. 检查 staff assignment ==========
  const originalStaffId = facility.staff_id;
  let staffDoc = null;

  if (originalStaffId) {
    // 查询该 staff 是否还有其他未删除 facility
    const otherFacilitySnapshot = await db.collection("facility")
      .where("staff_id", "==", originalStaffId)
      .where("status", "in", ["normal", "fixing"])
      .get();

    const hasOtherFacility = otherFacilitySnapshot.docs.some(
      doc => doc.id !== facility_id
    );

    if (!hasOtherFacility) {
      // 检查 admin_staff 是否存在
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

  // ========== 10. 创建 notification（失败不回滚）==========
  try {
    // 收集被取消的 request 数据用于 notification
    const notifications = [];

    requestDataForNotification.forEach((item) => {
      const req = item.data;
      const requestId = item.id; // 使用 request 文档 id

      const recipientIds = new Set();

      // 收集收件人
      if (req.member_id) recipientIds.add(req.member_id);
      if (req.participant_ids && Array.isArray(req.participant_ids)) {
        req.participant_ids.forEach(id => id && recipientIds.add(id));
      }
      if (req.user_id_list && Array.isArray(req.user_id_list)) {
        req.user_id_list.forEach(id => id && recipientIds.add(id));
      }
      if (req.staff_id) recipientIds.add(req.staff_id);

      // 安全格式化时间
      const startTime = toHourString(req.start_time);
      const endTime = toHourString(req.end_time);
      const timeRange = startTime && endTime ? `${startTime}-${endTime}` : "";

      // 为每个收件人创建 notification
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

    // staff unassigned notification
    if (stats.staffMarkedUnassigned && originalStaffId && staffDoc) {
      // 查询 active Admin
      const adminSnapshot = await db.collection("admin_staff")
        .where("status", "==", "active")
        .get();

      const staffData = staffDoc.data();
      const staffName = staffData.name || originalStaffId;

      adminSnapshot.docs.forEach(doc => {
        const adminData = doc.data();
        const adminRole = String(adminData.role || "").toLowerCase();

        // 只通知 active Admin，不通知普通 Staff
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

    // 批量创建 notification
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

  // ========== 11. 返回结果 ==========
  return {
    success: true,
    stats: stats
  };
});