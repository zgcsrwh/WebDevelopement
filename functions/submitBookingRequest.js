/**
 * submitBookingRequest Cloud Function 实现
 *
 * 基于 submitBookingRequest_API_Implementation_v2.md
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
 * 将小时数转换为字符串格式 ("09", "10")
 */
function toHourString(value) {
  const num = typeof value === "number" ? value : parseInt(value, 10);
  return String(num).padStart(2, "0");
}

/**
 * 将小时字符串/数字转换为数字
 */
function toHourNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseInt(value.replace(":00", ""), 10);
  return parseInt(value || 0, 10);
}

/**
 * 生成日期（today + days）
 */
function getDateString(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

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
 * 时间重叠判断：start1 < end2 && start2 < end1
 */
function hasTimeOverlap(start1, end1, start2, end2) {
  const s1 = toHourNumber(start1);
  const e1 = toHourNumber(end1);
  const s2 = toHourNumber(start2);
  const e2 = toHourNumber(end2);
  return s1 < e2 && s2 < e1;
}

// ============ 校验函数 ============

/**
 * 基础参数校验
 */
function validateBasicParams(data) {
  // 必传参数
  assertRequired(data, ["facility_id", "date", "start_time", "end_time", "attendent", "activity_description"]);

  // 校验时间粒度（整数）
  const startNum = toHourNumber(data.start_time);
  const endNum = toHourNumber(data.end_time);
  if (!Number.isInteger(startNum) || !Number.isInteger(endNum)) {
    throw new functions.https.HttpsError("invalid-argument", "Time must be integer");
  }

  // 校验时间范围
  if (startNum < 0 || startNum > 23 || endNum < 0 || endNum > 23) {
    throw new functions.https.HttpsError("invalid-argument", "Time must be between 0 and 23");
  }

  // start < end
  if (startNum >= endNum) {
    throw new functions.https.HttpsError("invalid-argument", "start_time must be less than end_time");
  }

  // 校验日期范围（今天 ~ 今天+7天）
  const today = getDateString(0);
  const maxDate = getDateString(7);
  if (data.date < today || data.date > maxDate) {
    throw new functions.https.HttpsError("invalid-argument", "Date must be between today and 7 days from now");
  }

  // 校验时长（≤ 4 小时）
  if (endNum - startNum > 4) {
    throw new functions.https.HttpsError("invalid-argument", "Maximum booking duration is 4 hours");
  }

  // 校验人数
  if (typeof data.attendent !== "number" || data.attendent < 1) {
    throw new functions.https.HttpsError("invalid-argument", "attendent must be at least 1");
  }

  // 校验活动描述
  if (typeof data.activity_description !== "string" || data.activity_description.trim().length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "activity_description is required");
  }

  if (data.activity_description.length > 500) {
    throw new functions.https.HttpsError("invalid-argument", "activity_description max 500 characters");
  }

  return { startNum, endNum };
}

/**
 * 校验人数与好友
 */
function validateCapacityAndFriends(facility, data) {
  // 容量校验
  if (data.attendent > facility.capacity) {
    throw new functions.https.HttpsError("invalid-argument", `Exceeds facility capacity (max ${facility.capacity})`);
  }

  // 好友上限校验
  const userIdList = data.user_id_list || [];
  if (userIdList.length > data.attendent - 1) {
    throw new functions.https.HttpsError("invalid-argument", "Too many friends (max attendant - 1)");
  }

  return userIdList;
}

/**
 * 校验时间冲突
 */
async function checkTimeConflicts(facilityId, date, startNum, endNum, excludeRequestId = null) {
  // 构建小时范围
  const hours = [];
  for (let h = startNum; h < endNum; h++) {
    hours.push(h);
  }

  // 查询该场地该日期的所有 time_slot
  const slotsSnapshot = await db
    .collection("time_slot")
    .where("facility_id", "==", facilityId)
    .where("date", "==", date)
    .get();

  // 筛选出需要的时间段
  const relevantSlots = [];
  for (const slot of slotsSnapshot.docs) {
    const slotHour = toHourNumber(slot.data().start_time);
    if (hours.includes(slotHour)) {
      relevantSlots.push({ id: slot.id, ...slot.data() });
    }
  }

  // 校验是否存在
  if (relevantSlots.length !== hours.length) {
    throw new functions.https.HttpsError("resource-exhausted", "Time slot not available");
  }

  // 校验是否被锁定
  for (const slot of relevantSlots) {
    if (slot.status === "locked") {
      throw new functions.https.HttpsError("resource-exhausted", "Time slot already booked");
    }
  }

  return relevantSlots;
}

/**
 * 校验用户/好友时间冲突
 */
async function checkUserConflicts(memberId, date, startNum, endNum, friendIds = []) {
  // 构建查询：同一天、同时段、状态为 pending/accepted 的请求
  const requestsSnapshot = await db
    .collection("request")
    .where("date", "==", date)
    .where("status", "in", ["pending", "accepted"])
    .get();

  const allIds = [memberId, ...friendIds];

  for (const doc of requestsSnapshot.docs) {
    const req = doc.data();

    // 排除自己的请求（如果是修改场景）
    if (req.member_id === memberId && req.status === "pending") {
      // 检查时间是否重叠
      if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "You have a conflicting booking in this time period"
        );
      }
    }

    // 检查好友冲突
    if (req.participant_ids && req.participant_ids.length > 0) {
      for (const friendId of friendIds) {
        if (req.member_id === friendId || req.participant_ids.includes(friendId)) {
          if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
            throw new functions.https.HttpsError(
              "failed-precondition",
              "One of your friends has a conflicting booking"
            );
          }
        }
      }
    }
  }
}

// ============ 主函数 ============

/**
 * submitBookingRequest Cloud Function
 *
 * 业务逻辑：
 * 1. 基础参数校验
 * 2. 读取 facility 校验场地存在和可用
 * 3. 人数与好友校验
 * 4. 检查时间冲突（在 transaction 外）
 * 5. 检查用户/好友冲突（在 transaction 外）
 * 6. Transaction 中：
 *    - 创建 request
 *    - 锁定 time_slot
 * 7. 创建 notification（在 transaction 外）
 */
exports.submitBookingRequest = functions.https.onCall(async (data, context) => {
  // 校验用户已登录
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const memberId = context.auth.uid;

  // 1.1 校验 member 身份
  const memberDoc = await db.collection("member").doc(memberId).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Only members can submit booking requests");
  }
  const member = memberDoc.data();
  if (member.status && member.status !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Member account is not active");
  }

  // 1. 基础参数校验
  const { startNum, endNum } = validateBasicParams(data);

  // 2. 读取 facility
  const facilityDoc = await db.collection("facility").doc(data.facility_id).get();
  if (!facilityDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Facility not found");
  }

  const facility = facilityDoc.data();

  // 校验场地状态
  if (facility.status !== "normal") {
    throw new functions.https.HttpsError("failed-precondition", "Facility is not available");
  }

  // 校验营业时间
  if (startNum < facility.start_time || endNum > facility.end_time) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Facility is open from ${facility.start_time}:00 to ${facility.end_time}:00`
    );
  }

  // 3. 人数与好友校验
  const userIdList = validateCapacityAndFriends(facility, data);

  // 4. 检查时间冲突（获取需要锁定的时间段）
  const slotsToLock = await checkTimeConflicts(
    data.facility_id,
    data.date,
    startNum,
    endNum
  );

  // 5. 检查用户/好友冲突
  await checkUserConflicts(memberId, data.date, startNum, endNum, userIdList);

  // 6. Transaction 中写入 request 和锁定 time_slot
  const requestRef = db.collection("request").doc();
  const involvedIds = new Set([memberId, ...userIdList]);

  await db.runTransaction(async (transaction) => {
    // 再次检查 time_slot 状态（防止并发）
    for (const slot of slotsToLock) {
      const slotRef = db.collection("time_slot").doc(slot.id);
      const slotDoc = await transaction.get(slotRef);
      if (!slotDoc.exists || slotDoc.data().status !== "open") {
        throw new functions.https.HttpsError("resource-exhausted", "Time slot was booked by another user");
      }
    }

    // 再次检查用户冲突（防止并发）
    const requestsSnapshot = await transaction.get(
      db.collection("request").where("date", "==", data.date)
    );
    for (const doc of requestsSnapshot.docs) {
      const req = doc.data();
      if (req.status === "pending" || req.status === "accepted") {
        // 检查发起人
        if (req.member_id === memberId) {
          if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
            throw new functions.https.HttpsError(
              "failed-precondition",
              "You have a conflicting booking"
            );
          }
        }
        // 检查好友
        if (req.participant_ids && req.participant_ids.length > 0) {
          for (const friendId of userIdList) {
            if (req.member_id === friendId || req.participant_ids.includes(friendId)) {
              if (hasTimeOverlap(req.start_time, req.end_time, toHourString(startNum), toHourString(endNum))) {
                throw new functions.https.HttpsError(
                  "failed-precondition",
                  "Friend has a conflicting booking"
                );
              }
            }
          }
        }
      }
    }

    // 创建 request
    transaction.set(requestRef, {
      member_id: memberId,
      facility_id: data.facility_id,
      staff_id: facility.staff_id || "",
      attendant: data.attendent,
      activity_description: data.activity_description.trim(),
      status: "pending",
      staff_response: "",
      date: data.date,
      start_time: toHourString(startNum),
      end_time: toHourString(endNum),
      participant_ids: userIdList,
      created_at: FieldValue.serverTimestamp(),
      completed_at: ""
    });

    // 锁定 time_slot
    for (const slot of slotsToLock) {
      const slotRef = db.collection("time_slot").doc(slot.id);
      transaction.update(slotRef, {
        status: "locked",
        request_id: requestRef.id,
        updated_at: FieldValue.serverTimestamp()
      });
    }
  });

  // 7. 创建 notification（在 transaction 外）
  // 注意：notification 失败不影响主流程（request 和 time_slot 已成功写入）

  // 调试日志：确认进入 notification 逻辑
  console.log("Creating notifications for involved IDs:", Array.from(involvedIds));
  console.log("Facility staff_id:", facility.staff_id);

  try {
    // 通知会员和好友
    const involvedIdList = Array.from(involvedIds);
    const memberNotifications = involvedIdList.map((userId) => ({
      recipient_id: userId,
      information: `Your booking request for ${facility.name} on ${data.date} ${toHourString(startNum)}-${toHourString(endNum)} has been submitted.`,
      type: "facility_request",
      status: "pending",
      related_id: requestRef.id,
      created_at: FieldValue.serverTimestamp()
    }));

    // 通知员工
    if (facility.staff_id) {
      memberNotifications.push({
        recipient_id: facility.staff_id,
        information: `A new booking request for ${facility.name} is waiting for approval.`,
        type: "facility_request",
        status: "pending",
        related_id: requestRef.id,
        created_at: FieldValue.serverTimestamp()
      });
    }

    console.log("Total notifications to create:", memberNotifications.length);

    // 批量写入 notification
    if (memberNotifications.length === 0) {
      console.log("No notifications to create.");
    } else {
      const batch = db.batch();
      for (const notif of memberNotifications) {
        const notifRef = db.collection("notification").doc();
        batch.set(notifRef, notif);
      }
      await batch.commit();
      console.log("Notifications created successfully.");
    }
  } catch (notifError) {
    // notification 失败不影响主流程，只记录完整错误
    console.error("Failed to create notifications:", notifError);
  }

  // 返回成功
  return {
    success: true,
    request_id: requestRef.id
  };
});