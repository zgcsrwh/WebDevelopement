/**
 * withdrawPendingBooking Cloud Function 实现
 *
 * 基于 withdrawPendingBooking_API设计.md 和 withdrawPendingBooking_Implementation_Plan.md
 *
 * 业务逻辑：
 * 1. 校验用户已登录（从 context.auth.uid）
 * 2. 校验 request_id 必传
 * 3. transaction 外校验 member 存在且 status === "active"
 * 4. transaction 内校验 request 存在、status === "pending"、member_id === 当前用户
 * 5. 查询并释放所有绑定 request_id 的 time_slot
 * 6. 更新 request: status = "cancelled", completed_at, updated_at
 * 7. Transaction 外创建 notification（失败不回滚）
 * 8. 不修改 member.cancel_times
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { parseBookingStart } = require("./utils/time");

const db = admin.firestore();

// ============ 主函数 ============

exports.withdrawPendingBooking = functions.https.onCall(async (data, context) => {
  // 1. 校验用户已登录
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const uid = context.auth.uid;

  // 2. 校验 request_id 必传
  const requestId = typeof data.request_id === "string" ? data.request_id.trim() : "";
  if (!requestId) {
    throw new functions.https.HttpsError("invalid-argument", "request_id is required");
  }

  // 3. transaction 外读取并校验 member
  const memberRef = db.collection("member").doc(uid);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("failed-precondition", "Member account not found");
  }

  const memberData = memberDoc.data();
  if (memberData.status !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Member account is not active");
  }

  // 声明外部变量（用于 transaction 成功后创建 notification）
  let withdrawnRequest = null;

  // 4. Transaction 中执行核心操作
  await db.runTransaction(async (transaction) => {
    // 4.1 读取 request 文档
    const requestRef = db.collection("request").doc(requestId);
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found");
    }

    const request = requestDoc.data();

    // 4.2 校验 request.member_id === uid（只能撤回自己的）
    if (request.member_id !== uid) {
      throw new functions.https.HttpsError("permission-denied", "You can only withdraw your own booking request");
    }

    // 4.3 校验 request.status === "pending"（只能撤回 pending 状态）
    if (request.status !== "pending") {
      throw new functions.https.HttpsError("failed-precondition", "Only pending requests can be withdrawn");
    }

    // 4.4 校验 2 小时锁定期
    const bookingStart = parseBookingStart(request.date, request.start_time);
    if (!bookingStart) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Invalid booking time"
      );
    }

    const now = new Date();
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    if (bookingStart.getTime() - now.getTime() <= TWO_HOURS) {
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Pending booking requests can only be withdrawn at least 2 hours before start time."
      );
    }

    // 4.5 查询所有绑定该 request_id 的 time_slot
    const slotsSnapshot = await transaction.get(
      db.collection("time_slot").where("request_id", "==", requestId)
    );

    // 4.6 校验至少找到一个 time_slot
    if (slotsSnapshot.empty) {
      throw new functions.https.HttpsError("failed-precondition", "Time slot not found, booking state may have changed");
    }

    // 4.7 保存 request 数据到外部变量（用于 transaction 成功后创建 notification）
    withdrawnRequest = { id: requestId, ...request };

    // 4.8 更新 request 状态为 cancelled
    transaction.update(requestRef, {
      status: "cancelled",
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    // 4.9 释放所有 time_slot
    for (const slotDoc of slotsSnapshot.docs) {
      transaction.update(slotDoc.ref, {
        status: "open",
        request_id: "",
        updated_at: FieldValue.serverTimestamp()
      });
    }
  });

  // 5. Transaction 外创建 notification
  if (withdrawnRequest) {
    try {
      // 通知对象：staff_id + participant_ids（不通知发起人本人）
      const recipientIds = [
        withdrawnRequest.staff_id,
        ...(withdrawnRequest.participant_ids || [])
      ].filter((recipientId) => recipientId && recipientId !== uid);

      const uniqueRecipients = [...new Set(recipientIds)];

      if (uniqueRecipients.length > 0) {
        const message = `The pending booking request for ${withdrawnRequest.date} ${withdrawnRequest.start_time}-${withdrawnRequest.end_time} has been withdrawn.`;

        const batch = db.batch();
        for (const recipientId of uniqueRecipients) {
          const notifRef = db.collection("notification").doc();
          batch.set(notifRef, {
            member_id: recipientId,
            message: message,
            type: "facility_request",
            status_context: "cancelled",
            reference_id: requestId,
            is_read: false,
            created_at: FieldValue.serverTimestamp()
          });
        }
        await batch.commit();
      }
    } catch (notifError) {
      console.error("Failed to create notifications:", notifError);
    }
  }

  // 6. 返回成功
  return { success: true };
});