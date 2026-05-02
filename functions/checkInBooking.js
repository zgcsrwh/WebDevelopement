/**
 * checkInBooking - 员工确认核销
 *
 * Staff 点击 "Confirm Arrival" 后调用
 * 将 accepted booking 更新为 in_progress
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * 解析 booking 开始时间
 *
 * request.date + request.start_time 表示 Europe/London 本地业务时间
 * 该 helper 会将其转换为 UTC instant
 *
 * 原理：
 * 1. 假设输入是 UTC 时间
 * 2. 用 toLocaleString(timeZone: 'Europe/London') 查看这个 UTC 时间在 London 看来是几点
 * 3. 计算假设的 hour 和 London 视角的 hour 的差异
 * 4. 用差异修正，得到正确的 UTC instant
 *
 * 这样可兼容 BST/GMT，并避免 Cloud Functions 运行时区导致判断偏移
 *
 * @param {string} dateStr - YYYY-MM-DD 格式 (如 "2026-05-02")
 * @param {string} startTimeStr - "09" 或 "09:00" 格式
 * @returns {Date|null} UTC instant，或 null (如果输入无效)
 */
function parseBookingStart(dateStr, startTimeStr) {
  if (!dateStr || !startTimeStr) {
    return null;
  }

  // 解析 hour 和 minute
  const timeParts = String(startTimeStr).split(":");
  const hourStr = timeParts[0].padStart(2, "0");
  const minuteStr = timeParts[1] || "00";

  // 校验 year/month/day
  const dateParts = dateStr.split("-");
  if (dateParts.length !== 3) {
    return null;
  }
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]);
  const day = parseInt(dateParts[2]);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const hour = parseInt(hourStr), minute = parseInt(minuteStr);
  if (isNaN(hour) || isNaN(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  // 1. 假设 dateStr-hour 是 UTC 时间
  const assumedUTC = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // 2. 获取这个 assumedUTC 在 Europe/London 看来是几点
  const londonView = assumedUTC.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [viewHour, viewMinute] = londonView.split(":").map(Number);

  if (isNaN(viewHour) || isNaN(viewMinute)) {
    return null;
  }

  // 3. 计算差异并修正
  const diffMinutes = (hour - viewHour) * 60 + (minute - viewMinute);
  const correctUTC = new Date(assumedUTC.getTime() + diffMinutes * 60 * 1000);

  if (Number.isNaN(correctUTC.getTime())) {
    return null;
  }

  return correctUTC;
}

exports.checkInBooking = functions.https.onCall(async (data, context) => {
  // 1. 校验认证
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated.");
  }

  // 2. 校验 request_id
  const requestId = data?.request_id;
  const trimmedRequestId = typeof requestId === "string" ? requestId.trim() : "";
  if (!trimmedRequestId) {
    throw new functions.https.HttpsError("invalid-argument", "request_id is required.");
  }

  // 3. 读取 Staff 文档
  const staffRef = db.collection("admin_staff").doc(uid);
  const staffDoc = await staffRef.get();

  if (!staffDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Staff account not found.");
  }
  const staff = staffDoc.data();

  // 4. 校验 role：只允许 Staff，不允许 Admin
  if (staff.role !== "Staff" && staff.role !== "staff") {
    throw new functions.https.HttpsError("permission-denied", "Must be Staff.");
  }

  // 5. 校验 status
  if (staff.status !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Staff account is not active.");
  }

  // 6. 使用 transaction 读取和更新 request
  let requestData = null;

  await db.runTransaction(async (transaction) => {
    const requestRef = db.collection("request").doc(trimmedRequestId);
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found.");
    }
    const request = requestDoc.data();
    requestData = { id: trimmedRequestId, ...request };

    // 7. 校验 Staff 权限：必须是负责该 booking 的 Staff
    if (request.staff_id !== uid) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized for this booking.");
    }

    // 8. 校验 request 状态必须是 accepted
    if (String(request.status || "").toLowerCase() !== "accepted") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Only accepted bookings can be checked in."
      );
    }

    // 9. 校验 check-in 时间窗口
    const bookingStart = parseBookingStart(request.date, request.start_time);
    if (!bookingStart) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Unable to parse booking time."
      );
    }

    const now = new Date();
    const earliestCheckIn = new Date(bookingStart.getTime() - 15 * 60 * 1000);

    if (now < earliestCheckIn || now >= bookingStart) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Check-in is only available from 15 minutes before the booking starts until the booking starts."
      );
    }

    // 10. 更新 request
    transaction.update(requestRef, {
      status: "in_progress",
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  // 11. 创建 notification（transaction 外，失败不回滚）
  if (requestData) {
    try {
      // 收集接收人：member_id + participant_ids + user_id_list
      const recipientIds = [
        requestData.member_id,
        ...(requestData.participant_ids || []),
        ...(requestData.user_id_list || []),
      ]
        .filter(Boolean)
        .filter((id) => id !== uid); // 不通知 staff 自己

      // 去重
      const uniqueRecipients = [...new Set(recipientIds)];

      if (uniqueRecipients.length > 0) {
        const batch = db.batch();
        for (const recipientId of uniqueRecipients) {
          const notifRef = db.collection("notification").doc();
          batch.set(notifRef, {
            member_id: recipientId,
            message: `Your booking at ${requestData.date} ${requestData.start_time}-${requestData.end_time} has been checked in.`,
            type: "facility_request",
            status_context: "in_progress",
            reference_id: requestData.id,
            is_read: false,
            created_at: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    } catch (notifError) {
      console.error("Failed to create notifications:", notifError);
    }
  }

  return { success: true };
});