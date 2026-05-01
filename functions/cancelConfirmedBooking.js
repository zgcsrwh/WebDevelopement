/**
 * cancelConfirmedBooking Cloud Function 实现
 *
 * 基于 cancelConfirmedBooking_API设计.md 和 cancelConfirmedBooking_Implementation_Plan.md
 *
 * 业务逻辑：
 * 1. 校验用户已登录（从 context.auth.uid）
 * 2. 校验 request_id 必传
 * 3. 校验 member 存在且 status === "active"
 * 4. 校验 request 存在、status === "accepted"、member_id === 当前用户
 * 5. 校验距预约开始时间 > 2 小时
 * 6. 在 Transaction 中更新 request、释放 time_slot、增加 cancel_times
 * 7. Transaction 外创建 notification（失败不回滚）
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

// ============ 主函数 ============

exports.cancelConfirmedBooking = functions.https.onCall(async (data, context) => {
  // 1. 校验用户已登录
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const uid = context.auth.uid;
  const requestId = data.request_id;

  // 2. 校验 request_id 必传
  assertRequired(data, ["request_id"]);

  // 声明外部变量（用于 transaction 成功后创建 notification）
  let cancelledRequest = null;

  // 3. Transaction 中执行所有操作
  await db.runTransaction(async (transaction) => {
    // 3.1 读取 member 文档
    const memberRef = db.collection("member").doc(uid);
    const memberDoc = await transaction.get(memberRef);

    if (!memberDoc.exists) {
      throw new functions.https.HttpsError("failed-precondition", "Member account not found");
    }

    const memberData = memberDoc.data();
    if (memberData.status !== "active") {
      throw new functions.https.HttpsError("failed-precondition", "Member account is not active");
    }

    // 3.2 读取 request 文档
    const requestRef = db.collection("request").doc(requestId);
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found");
    }

    const request = requestDoc.data();

    // 3.3 校验 request.member_id === uid
    if (request.member_id !== uid) {
      throw new functions.https.HttpsError("permission-denied", "You can only cancel your own booking");
    }

    // 3.4 校验 request.status === "accepted"
    if (request.status !== "accepted") {
      throw new functions.https.HttpsError("failed-precondition", "Only accepted bookings can be cancelled");
    }

    // 3.5 计算 bookingStart 并校验 2 小时限制
    const startTime = String(request.start_time || "").padStart(2, "0");
    const bookingStart = new Date(`${request.date}T${startTime}:00`);

    if (Number.isNaN(bookingStart.getTime())) {
      throw new functions.https.HttpsError("failed-precondition", "Invalid booking time");
    }

    const now = new Date();
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    if (bookingStart.getTime() - now.getTime() <= TWO_HOURS) {
      throw new functions.https.HttpsError("deadline-exceeded", "Cancellation must be at least 2 hours before start time");
    }

    // 3.6 查询关联的 time_slot
    const slotsSnapshot = await transaction.get(
      db.collection("time_slot").where("request_id", "==", requestId)
    );

    // 3.7 校验至少找到一个 time_slot
    if (slotsSnapshot.empty) {
      throw new functions.https.HttpsError("failed-precondition", "Time slot not found, booking state may have changed");
    }

    // 3.8 保存 request 数据到外部变量（用于 transaction 成功后创建 notification）
    cancelledRequest = { id: requestId, ...request };

    // 3.9 更新 request
    transaction.update(requestRef, {
      status: "cancelled",
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    // 3.10 释放所有 time_slot
    for (const slotDoc of slotsSnapshot.docs) {
      transaction.update(slotDoc.ref, {
        status: "open",
        request_id: "",
        updated_at: FieldValue.serverTimestamp()
      });
    }

    // 3.11 更新 member.cancel_times
    transaction.update(memberRef, {
      cancel_times: FieldValue.increment(1)
    });
  });

  // 4. Transaction 外创建 notification
  if (cancelledRequest) {
    try {
      const recipientIds = [
        cancelledRequest.member_id,
        cancelledRequest.staff_id,
        ...(cancelledRequest.participant_ids || [])
      ].filter(Boolean);

      const uniqueRecipients = [...new Set(recipientIds)];

      const message = `The confirmed booking for ${cancelledRequest.date} ${cancelledRequest.start_time}-${cancelledRequest.end_time} has been cancelled.`;

      const batch = db.batch();
      for (const recipientId of uniqueRecipients) {
        const notifRef = db.collection("notification").doc();
        batch.set(notifRef, {
          member_id: recipientId,
          message: message,
          type: "facility_request",
          status_context: "cancelled",
          reference_id: requestId,
          is_read: false
        });
      }
      await batch.commit();
    } catch (notifError) {
      console.error("Failed to create notifications:", notifError);
    }
  }

  // 5. 返回成功
  return { success: true };
});