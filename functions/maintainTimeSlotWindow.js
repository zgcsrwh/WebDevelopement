/**
 * maintainTimeSlotWindow Scheduled Cloud Function
 *
 * 维护真实的 time_slot 窗口
 *
 * 两种模式：
 * - fillWindow: today ~ today+7（8个日期），用于首次部署/手动补齐/测试
 * - daily: today+7（仅窗口末端1天），用于 scheduled daily run
 *
 * 业务规则：
 * - only create missing slots, never overwrite existing slots
 * - 只有 status === "normal" 的 facility 才生成新 slot
 * - 应用 due scheduled_change
 * - 旧 doc id 兼容
 * - batch 写入
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

// 引入 time.js helper
const { getLondonDateOffset } = require("./utils/time");

/**
 * 将 time_slot.start_time/end_time 标准化为 hour number
 *
 * 兼容历史 number/string 混用
 *
 * @param {number|string} value - 时间值
 * @returns {number} hour number
 */
function toHourNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // "09" -> 9, "09:00" -> 9
    return parseInt(value.replace(/(:\d{2})?$/, ""), 10);
  }
  return parseInt(value || 0, 10);
}

/**
 * 生成 time_slot doc id
 *
 * 格式：facilityId-date-hourString（如 facility001-2026-05-10-09）
 *
 * @param {string} facilityId - facility doc ID
 * @param {string} date - YYYY-MM-DD
 * @param {number} hour - hour number
 * @returns {string} doc ID
 */
function generateSlotId(facilityId, date, hour) {
  const hourStr = String(hour).padStart(2, "0");
  return `${facilityId}-${date}-${hourStr}`;
}

/**
 * 核心处理函数
 *
 * @param {object} options
 * @param {string} options.mode - "fillWindow" | "daily"
 * @param {string} options.targetDate - 可选，指定单个日期（如测试用）
 * @param {string} options.facilityId - 可选，指定单个 facility（如测试用）
 * @param {Date} options.now - 可选，默认 new Date()
 * @returns {Promise<object>} 统计结果
 */
async function processTimeSlotWindow({ mode, targetDate, facilityId, now = new Date() }) {
  // ========== 1. 解析 mode 参数 ==========
  const validModes = ["fillWindow", "daily"];
  if (!mode || !validModes.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Must be "fillWindow" or "daily"`);
  }

  // ========== 2. 计算目标日期数组 ==========
  const today = getLondonDateOffset(0);
  let targetDates = [];

  if (targetDate) {
    // 指定单个日期（测试用）
    targetDates = [targetDate];
  } else if (mode === "daily") {
    // daily mode: today+7
    targetDates = [getLondonDateOffset(7)];
  } else {
    // fillWindow mode: today ~ today+7
    for (let i = 0; i <= 7; i++) {
      targetDates.push(getLondonDateOffset(i));
    }
  }

  // ========== 3. 初始化统计 ==========
  const stats = {
    mode,
    targetDates,
    scannedFacilities: 0,
    skippedNonNormalFacilities: 0,
    appliedScheduledChanges: 0,
    createdSlots: 0,
    skippedExistingSlots: 0,
    warnings: [],
  };

  // ========== 4. 获取 all facilities（全部） ==========
  let facilityDocs = [];

  if (facilityId) {
    // 指定单个 facility（测试用）
    const facilityDoc = await db.collection("facility").doc(facilityId).get();
    if (!facilityDoc.exists) {
      throw new Error(`Facility not found: ${facilityId}`);
    }
    facilityDocs = [facilityDoc];
  } else {
    // 查询全部 facility
    const allFacilitiesSnap = await db.collection("facility").get();
    facilityDocs = allFacilitiesSnap.docs;
  }

  stats.scannedFacilities = facilityDocs.length;

  if (facilityDocs.length === 0) {
    return stats;
  }

  // ========== 5. 遍历每个 facility ==========
  for (const facilityDoc of facilityDocs) {
    await processFacility({
      facilityDoc,
      targetDates,
      stats,
    });
  }

  return stats;
}

/**
 * 处理单个 facility
 *
 * @param {object} options
 * @param {FirebaseFirestore.QueryDocumentSnapshot} options.facilityDoc
 * @param {string[]} options.targetDates
 * @param {object} options.stats
 */
async function processFacility({ facilityDoc, targetDates, stats }) {
  const facilityRef = facilityDoc.ref;
  const facilityData = facilityDoc.data();
  const facilityId = facilityDoc.id;

  // ========== 5.1 facility.status 过滤 ==========
  if (facilityData.status !== "normal") {
    stats.skippedNonNormalFacilities++;
    return;
  }

  // ========== 5.2 scheduled_change 处理 ==========
  const scheduledChange = facilityData.scheduled_change;
  let localStartTime = facilityData.start_time;
  let localEndTime = facilityData.end_time;

  if (scheduledChange && scheduledChange.type === "update" && scheduledChange.effective_on) {
    const today = getLondonDateOffset(0);
    if (scheduledChange.effective_on <= today) {
      // 5.2.1 due scheduled_change：先更新本地变量为新时间
      localStartTime = scheduledChange.payload.start_time;
      localEndTime = scheduledChange.payload.end_time;

      // 5.2.2 写回 Firestore 并清空 scheduled_change
      await facilityRef.update({
        start_time: localStartTime,
        end_time: localEndTime,
        scheduled_change: null,
        updated_at: FieldValue.serverTimestamp(),
      });
      stats.appliedScheduledChanges++;

      // 5.2.3 后续 slot 生成使用更新后的本地时间
    }
  } else if (scheduledChange && scheduledChange.type !== "update") {
    // 5.2.4 unknown scheduled_change.type：只记录 warning，不应用，不清空，继续用当前时间
    stats.warnings.push(
      `Facility ${facilityId}: unknown scheduled_change type "${scheduledChange.type}", skipping`
    );
  }

  // ========== 5.3 获取 facility 的营业时间 ==========
  const startHour = toHourNumber(localStartTime);
  const endHour = toHourNumber(localEndTime);

  if (isNaN(startHour) || isNaN(endHour) || startHour >= endHour) {
    stats.warnings.push(
      `Facility ${facilityId}: invalid hours ${startHour}-${endHour}, skipping`
    );
    return;
  }

  // ========== 5.4 遍历目标日期 ==========
  for (const targetDate of targetDates) {
    await processTargetDate({
      facilityId,
      facilityRef,
      targetDate,
      startHour,
      endHour,
      stats,
    });
  }
}

/**
 * 处理单个日期的 slot 生成
 *
 * @param {object} options
 * @param {string} options.facilityId
 * @param {FirebaseFirestore.DocumentReference} options.facilityRef
 * @param {string} options.targetDate
 * @param {number} options.startHour
 * @param {number} options.endHour
 * @param {object} options.stats
 */
async function processTargetDate({
  facilityId,
  facilityRef,
  targetDate,
  startHour,
  endHour,
  stats,
}) {
  // ========== 5.4.1 查询该 facility 某天所有已有 time_slot ==========
  const existingSlotsSnap = await db
    .collection("time_slot")
    .where("facility_id", "==", facilityId)
    .where("date", "==", targetDate)
    .get();

  // ========== 5.4.2 用 toHourNumber 标准化小时，建立 existingHours Set ==========
  const existingHours = new Set();
  for (const slotDoc of existingSlotsSnap.docs) {
    const slotData = slotDoc.data();
    const hourNum = toHourNumber(slotData.start_time);
    existingHours.add(hourNum);
  }

  // ========== 5.4.3 收集需要创建的 slot ==========
  const pendingSlots = [];

  for (let h = startHour; h < endHour; h++) {
    if (existingHours.has(h)) {
      // 已存在 hour 一律跳过
      stats.skippedExistingSlots++;
      continue;
    }

    // 只创建缺失 hour
    const slotId = generateSlotId(facilityId, targetDate, h);
    const hourStr = String(h).padStart(2, "0");
    const endHourStr = String(h + 1).padStart(2, "0");

    const slotData = {
      facility_id: facilityId,
      date: targetDate,
      start_time: hourStr, // string 格式，如 "09"
      end_time: endHourStr, // string 格式，如 "10"
      status: "open",
      request_id: "",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    pendingSlots.push({ id: slotId, data: slotData });
  }

  // ========== 5.4.4 batch 写入 ==========
  if (pendingSlots.length > 0) {
    const SLOTS_PER_BATCH = 450;

    let batch = db.batch();
    let batchCount = 0;

    for (const slot of pendingSlots) {
      const slotRef = db.collection("time_slot").doc(slot.id);

      // Existing slots are filtered by existingHours before this point. Use deterministic ID for idempotency.
      batch.set(slotRef, slot.data);
      batchCount++;

      if (batchCount >= SLOTS_PER_BATCH) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // 提交剩余
    if (batchCount > 0) {
      await batch.commit();
    }

    stats.createdSlots += pendingSlots.length;
  }
}

/**
 * maintainTimeSlotWindow - daily mode
 *
 * 用于 scheduled daily run
 */
const maintainTimeSlotWindow = functions.pubsub
  .schedule("0 5 * * *")  // 每天 5:00 London 时间运行
  .timeZone("Europe/London")
  .onRun(async (context) => {
    console.log("Starting maintainTimeSlotWindow in daily mode...");
    const result = await processTimeSlotWindow({ mode: "daily" });
    console.log("daily result:", JSON.stringify(result, null, 2));
    return null;
  });

// 统一导出
module.exports = {
  maintainTimeSlotWindow,
  processTimeSlotWindow,
  toHourNumber,
  generateSlotId,
};