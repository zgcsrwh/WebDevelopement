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

// 从公共时间工具引入
const { parseBookingStart } = require("./utils/time");

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