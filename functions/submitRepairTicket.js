/**
 * submitRepairTicket Cloud Function
 *
 * 会员提交报修
 *
 * ID 类型：全部使用 string
 * Status 类型：string
 * 错误处理：throw new functions.https.HttpsError
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * 校验必传参数
 */
function assertRequired(data, fields) {
  for (const field of fields) {
    if (!data[field] || typeof data[field] !== "string" || !data[field].trim()) {
      throw new functions.https.HttpsError("invalid-argument", `${field} is required`);
    }
  }
}

/**
 * 格式化 hour 为两位字符串（兼容 "9" / "09" / "9:00" / "09:00" / number 9）
 * 无效输入返回空字符串
 */
function normalizeHour(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  // 处理 number
  if (typeof value === "number") {
    if (isNaN(value) || value < 0 || value > 23) {
      return "";
    }
    return String(value).padStart(2, "0");
  }

  const str = String(value).trim();
  if (!str) {
    return "";
  }

  // 提取数字部分（去掉 :00 等）
  const numStr = str.replace(/^0+(\d)/, "$1").replace(/(\d).*/, "$1");
  if (!/^\d+$/.test(numStr)) {
    return "";
  }

  const hour = parseInt(numStr, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) {
    return "";
  }

  return String(hour).padStart(2, "0");
}

/**
 * 分批处理 batch 操作
 * 注意：每个 item 只适合一次 write
 * @param {Array} items - 文档数组或 ref 数组
 * @param {Function} operation - 操作函数 (batch, item) => void
 * @returns {Promise<number>} 处理的 item 数量
 */
async function batchProcess(docs, operation) {
  if (docs.length === 0) return 0;

  const BATCH_SIZE = 499;
  let batch = db.batch();
  let writeCount = 0;
  let processedCount = 0;

  for (const doc of docs) {
    operation(batch, doc);
    writeCount++;
    processedCount++;

    if (writeCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      writeCount = 0;
    }
  }

  // 提交剩余
  if (writeCount > 0) {
    await batch.commit();
  }

  return processedCount;
}

/**
 * submitRepairTicket - 会员提交报修
 */
const submitRepairTicket = functions.https.onCall(async (data, context) => {
  // ========== 1. 参数校验 ==========
  assertRequired(data, ["facility_id", "repair_description", "type"]);

  if (data.repair_description.trim().length > 500) {
    throw new functions.https.HttpsError("invalid-argument", "repair_description must not exceed 500 characters");
  }

  // ========== 2. Member 认证 ==========
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const memberDoc = await db.collection("member").doc(userId).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Member not found");
  }

  const memberData = memberDoc.data();
  if (memberData.status !== "active") {
    throw new functions.https.HttpsError("permission-denied", "Member is not active");
  }

  // ========== 3. Facility 初步校验 ==========
  const facilityId = data.facility_id.trim();
  const facilityDoc = await db.collection("facility").doc(facilityId).get();

  if (!facilityDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Facility not found");
  }

  const facilityData = facilityDoc.data();
  if (facilityData.status === "deleted") {
    throw new functions.https.HttpsError("failed-precondition", "Cannot report repair for deleted facility");
  }

  // ========== 4. Transaction: 创建 repair + 更新 facility.status ==========
  let repairId;
  let facilityName = facilityData.name || "";

  await db.runTransaction(async (transaction) => {
    // 4.1 重新读取 facility，确认仍存在且不是 deleted
    const facilityRef = db.collection("facility").doc(facilityId);
    const facilitySnapshot = await transaction.get(facilityRef);

    if (!facilitySnapshot.exists) {
      throw new functions.https.HttpsError("not-found", "Facility not found");
    }

    const currentFacility = facilitySnapshot.data();
    if (currentFacility.status === "deleted") {
      throw new functions.https.HttpsError("failed-precondition", "Cannot report repair for deleted facility");
    }

    // 4.2 创建 repair 文档
    const repairRef = db.collection("repair").doc();
    transaction.set(repairRef, {
      member_id: userId,
      facility_id: facilityId,
      staff_id: currentFacility.staff_id || "",
      type: data.type.trim(),
      repair_description: data.repair_description.trim(),
      status: "pending",
      completed_at: "",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    repairId = repairRef.id;

    // 4.3 更新 facilityName（使用 transaction 内确认的值）
    facilityName = currentFacility.name || facilityId;

    // 4.4 更新 facility.status = "fixing"
    transaction.update(facilityRef, {
      status: "fixing",
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  console.log(`[submitRepairTicket] Created repair ${repairId} for facility ${facilityId}`);

  // ========== 5. 查询并取消 active request ==========
  const requestSnapshot = await db.collection("request")
    .where("facility_id", "==", facilityId)
    .get();

  const activeStatuses = ["pending", "accepted", "upcoming", "in_progress"];
  const requestsToCancel = [];

  requestSnapshot.docs.forEach(doc => {
    const req = doc.data();
    if (activeStatuses.includes(req.status)) {
      requestsToCancel.push({
        ref: doc.ref,
        id: doc.id,
        data: req
      });
    }
  });

  // ========== 6. 初始化 stats ==========
  const stats = {
    cancelledRequests: 0,
    releasedTimeSlots: 0,
    notificationsCreated: 0,
    notificationFailures: 0
  };

  // ========== 7. Batch: 取消 request + 释放 time_slot ==========
  if (requestsToCancel.length > 0) {
    // 使用 Set 记录 slot ref path，避免重复释放
    const slotsToRelease = new Set();

    for (const req of requestsToCancel) {
      const reqId = req.id;

      // 7.1 优先通过 request_id 查询
      const slotsByRequestId = await db.collection("time_slot")
        .where("request_id", "==", reqId)
        .get();

      if (slotsByRequestId.size > 0) {
        slotsByRequestId.docs.forEach(doc => {
          const slotData = doc.data();
          // 必须确认 request_id 匹配且状态为 locked
          if (slotData.status === "locked" && slotData.request_id === reqId) {
            slotsToRelease.add(doc.ref.path);
          }
        });
      } else {
        // 7.2 fallback: 通过 facility_id + date 查询，但必须检查 request_id 匹配
        const normalizedHour = normalizeHour(req.data.start_time);
        if (!normalizedHour) {
          console.warn(`[submitRepairTicket] Skipping fallback for request ${reqId}: invalid start_time`);
          continue;
        }

        const slotsByFacility = await db.collection("time_slot")
          .where("facility_id", "==", facilityId)
          .where("date", "==", req.data.date)
          .get();

        slotsByFacility.docs.forEach(doc => {
          const slotData = doc.data();
          const slotHour = normalizeHour(slotData.start_time);

          // 必须确认 slot.request_id === req.id，避免误释放其他 request 的 slot
          if (slotHour === normalizedHour && slotData.status === "locked" && slotData.request_id === reqId) {
            slotsToRelease.add(doc.ref.path);
          } else if (slotData.status === "locked" && slotData.request_id && slotData.request_id !== reqId) {
            // 如果 slot 已被其他 request 绑定，跳过并警告
            console.warn(`[submitRepairTicket] Slot ${doc.id} is locked by request ${slotData.request_id}, skip for request ${reqId}`);
          }
        });
      }
    }

    // 7.3 使用 batch 取消 request
    stats.cancelledRequests = await batchProcess(requestsToCancel, (batch, item) => {
      batch.update(item.ref, {
        status: "cancelled",
        completed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
      });
    });

    // 7.4 使用 batch 释放 time_slot（按 ref path 去重后）
    if (slotsToRelease.size > 0) {
      const slotRefs = Array.from(slotsToRelease).map(path => db.doc(path));
      stats.releasedTimeSlots = await batchProcess(slotRefs, (batch, ref) => {
        batch.update(ref, {
          status: "open",
          request_id: "",
          updated_at: FieldValue.serverTimestamp()
        });
      });
    }

    console.log(`[submitRepairTicket] Cancelled ${stats.cancelledRequests} requests, released ${stats.releasedTimeSlots} slots`);
  }

  // ========== 8. Notification ==========
  for (const req of requestsToCancel) {
    const reqData = req.data;

    // 8.1 收集收件人
    const recipientIds = new Set();
    if (reqData.member_id) recipientIds.add(reqData.member_id);
    if (reqData.participant_ids && Array.isArray(reqData.participant_ids)) {
      reqData.participant_ids.forEach(id => recipientIds.add(id));
    }
    if (reqData.user_id_list && Array.isArray(reqData.user_id_list)) {
      reqData.user_id_list.forEach(id => recipientIds.add(id));
    }
    if (reqData.staff_id) recipientIds.add(reqData.staff_id);

    // 过滤空值
    const uniqueRecipients = Array.from(recipientIds).filter(id => id && id.trim());

    // 8.2 格式化时间
    const startTime = normalizeHour(reqData.start_time);
    const endTime = normalizeHour(reqData.end_time);
    const timeRange = startTime && endTime ? `${startTime}-${endTime}` : "";

    // 8.3 为每个收件人创建 notification
    for (const recipientId of uniqueRecipients) {
      try {
        await db.collection("notification").add({
          member_id: recipientId,
          message: `Your booking at '${facilityName}' on ${reqData.date || ""} ${timeRange} has been cancelled due to facility maintenance.`,
          type: "facility_request",
          status_context: "maintenance_cancelled",
          reference_id: req.id,
          is_read: false,
          created_at: FieldValue.serverTimestamp()
        });
        stats.notificationsCreated++;
      } catch (error) {
        console.error("[submitRepairTicket] Failed to create notification:", error);
        stats.notificationFailures++;
      }
    }
  }

  // ========== 9. 返回 ==========
  return {
    success: true,
    repairt_id: repairId,
    repair_id: repairId,
    stats: stats
  };
});

module.exports = { submitRepairTicket };