/**
 * 公共时间工具
 *
 * 用于 Europe/London 本地业务时间的处理
 * 不依赖 Cloud Functions 默认时区
 */

const LONDON_TIMEZONE = "Europe/London";

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
    timeZone: LONDON_TIMEZONE,
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

/**
 * 获取指定 instant 的 Europe/London 本地日期和小时
 *
 * @param {Date} now - 可选，默认 new Date()
 * @returns {object} { date: "YYYY-MM-DD", hour: "HH" }
 */
function getLondonDateHourFromInstant(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const nowStr = formatter.format(now);
  const [dd, MM, yyyy, HH] = nowStr.match(/(\d{2})\/(\d{2})\/(\d{4}),\s+(\d{2})/).slice(1);

  return {
    date: `${yyyy}-${MM}-${dd}`,
    hour: HH,
  };
}

/**
 * 计算预约前 2 小时提醒的目标时间
 *
 * 当前 instant + 2 小时后对应的 Europe/London 日期和小时
 *
 * @param {Date} now - 可选，默认 new Date()
 * @returns {object} { targetDate: "YYYY-MM-DD", targetHour: "HH" }
 */
function getReminderTarget(now = new Date()) {
  // 当前 UTC instant + 2 小时 = target instant
  const targetInstant = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const { date, hour } = getLondonDateHourFromInstant(targetInstant);
  return { targetDate: date, targetHour: hour };
}

/**
 * 计算 no-show 结算的目标时间
 *
 * 当前 instant - 15 分钟后所在整点对应的 Europe/London 日期和小时
 * 例如：10:15 London -> target 10:00 London
 *
 * @param {Date} now - 可选，默认 new Date()
 * @returns {object} { targetDate: "YYYY-MM-DD", targetHour: "HH" }
 */
function getNoShowTarget(now = new Date()) {
  // 当前 instant - 15 分钟
  const quarterAgo = new Date(now.getTime() - 15 * 60 * 1000);

  // 获取整点小时（减去过 15 分钟后的分钟）
  const hourAgo = new Date(quarterAgo.getTime() - quarterAgo.getMinutes() * 60 * 1000);

  const { date, hour } = getLondonDateHourFromInstant(hourAgo);
  return { targetDate: date, targetHour: hour };
}

/**
 * 获取 London 业务日期偏移
 *
 * 基于 Europe/London 时区计算日期偏移
 * 可正确处理 GMT/BST 冬令时/夏令时转换
 *
 * @param {number} daysOffset - 日期偏移量（0=今天，8=今天+8）
 * @returns {string} "YYYY-MM-DD" 格式
 */
function getLondonDateOffset(daysOffset) {
  if (typeof daysOffset !== "number" || isNaN(daysOffset)) {
    daysOffset = 0;
  }

  // 获取当前 UTC instant
  const now = new Date();

  // 加上偏移天数
  const targetInstant = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);

  // 使用 Intl.DateTimeFormat 获取 Europe/London 时区的日期
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(targetInstant);
  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

// 导出
module.exports = {
  parseBookingStart,
  getLondonDateHourFromInstant,
  getReminderTarget,
  getNoShowTarget,
  getLondonDateOffset,
};