/**
 * expirePendingBookingRequests Cloud Function
 *
 * 自动取消 2 小时锁定期内未被审批的 pending request
 *
 * 业务逻辑：
 * 1. 每小时运行一次（5 分钟时）
 * 2. 查询 now + 2h 对应 date/hour 的 pending request
 * 3. transaction 内校验并取消 request
 * 4. 释放关联的 time_slot
 * 5. transaction 外创建 notification
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { getReminderTarget, parseBookingStart } = require("./utils/time");

const db = admin.firestore();

// ============ Core Function ============

/**
 * 处理进入 2 小时锁定期但仍未被审批的 pending request
 *
 * @param {Date} now - 可选，默认 new Date()
 * @returns {Promise<{scanned, expired, skipped, slotMissing, notificationFailures, failures}>}
 */
async function processExpiredPendingBookings(now = new Date()) {
  const stats = {
    scanned: 0,
    expired: 0,
    skipped: 0,
    slotMissing: 0,
    notificationFailures: 0,
    failures: 0
  };

  try {
    // 1. 计算 target 时间
    const { targetDate, targetHour } = getReminderTarget(now);

    // 2. 查询 pending request
    const snapshot = await db.collection("request")
      .where("status", "==", "pending")
      .where("date", "==", targetDate)
      .where("start_time", "==", targetHour)
      .get();

    stats.scanned = snapshot.size;

    // 3. 遍历每个 request
    for (const doc of snapshot.docs) {
      const result = await processSingleRequest(doc.id, now);

      // 统一更新 stats
      if (result.expired) {
        stats.expired++;
        if (result.slotMissing) {
          stats.slotMissing++;
        }
        if (result.notificationFailed) {
          stats.notificationFailures++;
        }
      } else if (result.skipped) {
        stats.skipped++;
      } else if (result.failed) {
        stats.failures++;
      }
    }
  } catch (error) {
    console.error("[expirePendingBookingRequests] Error:", error.message);
  }

  return stats;
}

/**
 * 处理单个 request
 *
 * @param {string} requestId
 * @param {Date} now
 * @returns {Promise<{expired: boolean, skipped: boolean, slotMissing: boolean, notificationFailed: boolean, failed: boolean}>}
 */
async function processSingleRequest(requestId, now) {
  let result = {
    expired: false,
    skipped: false,
    slotMissing: false,
    notificationFailed: false,
    failed: false
  };

  try {
    // 1. Transaction 执行
    const transactionResult = await db.runTransaction(async (transaction) => {
      // 1. 读取 request
      const requestRef = db.collection("request").doc(requestId);
      const requestDoc = await transaction.get(requestRef);

      if (!requestDoc.exists) {
        return { requestData: null, slotMissing: false };
      }

      const requestData = requestDoc.data();

      // 2. 确认 status
      if (requestData.status !== "pending") {
        return { requestData: null, slotMissing: false };
      }

      // 3. 确认时间（parseBookingStart 防御）
      const bookingStart = parseBookingStart(requestData.date, requestData.start_time);
      if (!bookingStart) {
        return { requestData: null, slotMissing: false };
      }

      if (bookingStart.getTime() > now.getTime() + 2 * 60 * 60 * 1000) {
        return { requestData: null, slotMissing: false };
      }

      // 4. 查询 time_slot
      const slotsSnapshot = await transaction.get(
        db.collection("time_slot").where("request_id", "==", requestId)
      );

      const slotMissing = slotsSnapshot.empty;

      // 5. 更新 request
      transaction.update(requestRef, {
        status: "cancelled",
        completed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
      });

      // 6. 释放 time_slot
      if (!slotMissing) {
        for (const slotDoc of slotsSnapshot.docs) {
          transaction.update(slotDoc.ref, {
            status: "open",
            request_id: "",
            updated_at: FieldValue.serverTimestamp()
          });
        }
      }

      return { requestData, slotMissing };
    });

    // 2. Transaction 结果处理
    if (transactionResult.requestData) {
      // 成功 expired
      result.expired = true;
      result.slotMissing = transactionResult.slotMissing;

      // 3. 创建 notification（失败不回滚）
      try {
        await createNotificationForExpiredRequest(transactionResult.requestData, requestId);
      } catch (error) {
        result.notificationFailed = true;
        console.error("[expirePendingBookingRequests] Failed to create notifications:", error);
      }
    } else {
      // 被跳过
      result.skipped = true;
    }
  } catch (error) {
    console.error("[expirePendingBookingRequests] Failed to process request:", requestId, error.message);
    result.failed = true;
  }

  return result;
}

/**
 * 创建 notification（失败不回滚）
 */
async function createNotificationForExpiredRequest(requestData, requestId) {
  // 通知对象：member_id + participant_ids + user_id_list + staff_id
  const recipientIds = [
    requestData.member_id,
    ...(requestData.participant_ids || []),
    ...(requestData.user_id_list || []),
    requestData.staff_id
  ].filter((id) => id);

  const uniqueRecipients = [...new Set(recipientIds)];

  if (uniqueRecipients.length === 0) {
    return;
  }

  const message = `Your booking request for ${requestData.date} ${requestData.start_time}-${requestData.end_time} was automatically cancelled because it was not approved within 2 hours before start time.`;

  const batch = db.batch();
  for (const recipientId of uniqueRecipients) {
    const notifRef = db.collection("notification").doc();
    batch.set(notifRef, {
      member_id: recipientId,
      message: message,
      type: "facility_request",
      status_context: "approval_timeout",
      reference_id: requestId,
      is_read: false,
      created_at: FieldValue.serverTimestamp()
    });
  }

  await batch.commit();
}

// ============ Scheduled Function ============

const expirePendingBookingRequests = functions.pubsub
  .schedule("5 * * * *")
  .timeZone("Europe/London")
  .onRun(async () => {
    console.log("[expirePendingBookingRequests] Starting...");
    try {
      const result = await processExpiredPendingBookings();
      console.log("[expirePendingBookingRequests] Completed:", result);
    } catch (error) {
      console.error("[expirePendingBookingRequests] Error:", error.message);
    }
    return null;
  });

// ============ 导出 ============

module.exports = {
  expirePendingBookingRequests,
  processExpiredPendingBookings,
};