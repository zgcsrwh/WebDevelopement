/**
 * processBookingApproval Cloud Function 实现
 *
 * 基于 processBookingApproval_API设计.md 和 processBookingApproval_Implementation_Plan.md
 *
 * ID 类型：全部使用 string
 * Status 类型：string
 * 错误处理：throw new functions.https.HttpsError
 */

// Firebase Functions v1 写法
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

/**
 * processBookingApproval Cloud Function
 *
 * 业务逻辑：
 * 1. 校验用户已登录
 * 2. 参数读取与归一化
 * 3. Staff 身份校验（从 context.auth.uid 查询 admin_staff）
 * 4. request 读取与状态校验
 * 5. Transaction 中更新 request
 * 6. 条件释放 time_slot（reject/suggest 时）
 * 7. Transaction 外创建 notification
 */
exports.processBookingApproval = functions.https.onCall(async (data, context) => {
  // 1. 校验用户已登录
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const currentUid = context.auth.uid;

  // 2. 参数读取与归一化
  const requestId = data.request_id;
  const statusArray = Array.isArray(data.status) ? data.status : [data.status];
  const normalizedStatus = String(statusArray[0] || "").toLowerCase().trim();
  const staffResponse = String(data.staff_response || "").trim();

  // 2.1 必传参数校验
  assertRequired(data, ["request_id", "status"]);

  // 2.2 status 归一化校验
  if (!["accepted", "rejected", "suggested"].includes(normalizedStatus)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid status. Must be accepted, rejected, or suggested"
    );
  }

  // 2.3 staff_response 条件必填
  if (["rejected", "suggested"].includes(normalizedStatus) && !staffResponse) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Please enter a response for rejected or suggested requests"
    );
  }

  // 3. Staff 身份校验
  // 查询 admin_staff 集合确认身份
  const staffDoc = await db.collection("admin_staff").doc(currentUid).get();

  if (!staffDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Only staff can process bookings");
  }

  const staffData = staffDoc.data();
  const staffRole = String(staffData.role || "staff").toLowerCase();

  // 严格限制：只允许 Staff，不允许 Admin
  if (staffRole !== "staff") {
    throw new functions.https.HttpsError("permission-denied", "Staff role required");
  }

  // 4. request 读取与状态校验
  const requestDoc = await db.collection("request").doc(requestId).get();

  if (!requestDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Request not found");
  }

  const request = requestDoc.data();

  // 校验 staff_id 匹配（只有负责该场地的 Staff 可以处理）
  if (request.staff_id !== currentUid) {
    throw new functions.https.HttpsError("permission-denied", "You are not assigned to this facility");
  }

  // 校验当前状态为 pending（并发控制）
  if (String(request.status || "").toLowerCase() !== "pending") {
    throw new functions.https.HttpsError("aborted", "Request has already been processed");
  }

  // 5. Transaction 中更新 request 和条件释放 time_slot
  await db.runTransaction(async (transaction) => {
    // 5.1 先读取 request（防止并发）
    const requestRef = db.collection("request").doc(requestId);
    const requestDocInTx = await transaction.get(requestRef);

    if (!requestDocInTx.exists) {
      throw new functions.https.HttpsError("not-found", "Request not found");
    }

    const currentStatus = String(requestDocInTx.data().status || "").toLowerCase();
    if (currentStatus !== "pending") {
      throw new functions.https.HttpsError("aborted", "Request status has changed");
    }

    // 5.2 如果是 rejected/suggested，先读取 time_slot（必须在所有写操作之前）
    let slotsSnapshot = null;
    if (["rejected", "suggested"].includes(normalizedStatus)) {
      // 查询关联的 time_slot
      slotsSnapshot = await transaction.get(
        db.collection("time_slot").where("request_id", "==", requestId)
      );

      // 如果找不到关联的 time_slot，抛错
      if (slotsSnapshot.empty) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Time slot not found, request state may have changed"
        );
      }
    }

    // 5.3 所有读取完成后，再执行写操作（更新 request）
    const completedAt = normalizedStatus === "accepted"
      ? ""  // accepted 时保持空字符串
      : FieldValue.serverTimestamp();  // rejected/suggested 时使用 Firestore Timestamp

    transaction.update(requestRef, {
      status: normalizedStatus,
      staff_response: staffResponse,
      completed_at: completedAt,
      updated_at: FieldValue.serverTimestamp()
    });

    // 5.4 如果需要释放 time_slot（在所有读操作之后执行写操作）
    if (["rejected", "suggested"].includes(normalizedStatus) && slotsSnapshot) {
      for (const slotDoc of slotsSnapshot.docs) {
        transaction.update(slotDoc.ref, {
          status: "open",
          request_id: "",
          updated_at: FieldValue.serverTimestamp()
        });
      }
    }
  });

  // 6. Transaction 外创建 notification
  // 保存 request 数据用于 notification（在 transaction 外重新读取）
  const requestAfterTx = (await db.collection("request").doc(requestId).get()).data();

  try {
    const recipientIds = [requestAfterTx.member_id, ...(requestAfterTx.participant_ids || [])];
    const uniqueRecipients = [...new Set(recipientIds.filter(Boolean))];

    // 通知消息映射
    const messages = {
      accepted: "Your booking request has been approved.",
      rejected: `Your booking request has been rejected. ${staffResponse}`.trim(),
      suggested: `A change was suggested for your booking request. ${staffResponse}`.trim()
    };

    const batch = db.batch();
    for (const recipientId of uniqueRecipients) {
      const notifRef = db.collection("notification").doc();
      batch.set(notifRef, {
        member_id: recipientId,
        message: messages[normalizedStatus],
        type: "facility_request",
        status_context: normalizedStatus,
        reference_id: requestId,
        is_read: false
      });
    }
    await batch.commit();
  } catch (notifError) {
    // 只记录错误，不回滚审批事务
    console.error("Failed to create notifications:", notifError);
  }

  // 返回成功
  return {
    success: true
  };
});