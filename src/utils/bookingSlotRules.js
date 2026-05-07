// Booking slot rules decide which real time_slot records members can choose.
const MIN_BOOKING_LEAD_HOURS = 2;

export function getLocalDateKey(value = new Date()) {
  // Build a local yyyy-mm-dd key without moving the date through UTC.
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMaxLocalBookingDate(daysAhead = 7, baseDate = new Date()) {
  // Members can only book inside the next seven-day window.
  const parsed = baseDate instanceof Date ? new Date(baseDate) : new Date(baseDate);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  parsed.setDate(parsed.getDate() + daysAhead);
  return getLocalDateKey(parsed);
}

function normalizeDateKey(value = "") {
  // Only the date part matters for matching slot documents.
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function normalizeSlotClock(value) {
  // Stored hours like 9 are shown and compared as 09:00.
  const source = String(value ?? "").trim();
  if (!source) {
    return "";
  }

  if (/^\d{1,2}$/.test(source)) {
    return `${source.padStart(2, "0")}:00`;
  }

  const match = source.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return "";
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseWholeHour(value, { allow24 = false } = {}) {
  // Booking is only allowed on whole-hour slots.
  const normalized = normalizeSlotClock(value);
  const match = normalized.match(/^(\d{2}):00$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const maxHour = allow24 ? 24 : 23;
  if (!Number.isInteger(hour) || hour < 0 || hour > maxHour) {
    return null;
  }

  return hour;
}

export function buildSlotDateTime(slot = {}, fallbackDate = "") {
  // Combine the slot date and start hour into one local Date object.
  const dateKey = normalizeDateKey(slot.date || fallbackDate);
  const startHour = parseWholeHour(slot.start_time ?? slot.startTime);
  if (!dateKey || startHour === null) {
    return new Date(Number.NaN);
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, startHour, 0, 0, 0);
}

export function getFrontendBookableSlotStatus(slot = {}, fallbackDate = "", nowInput = new Date()) {
  // A slot is bookable only when it is open, one hour long, and not too soon.
  const status = String(slot.status || "").trim().toLowerCase();
  if (status !== "open") {
    return { bookable: false, reason: "Unavailable" };
  }

  const startHour = parseWholeHour(slot.start_time ?? slot.startTime);
  const endHour = parseWholeHour(slot.end_time ?? slot.endTime, { allow24: true });
  if (startHour === null || endHour === null) {
    return { bookable: false, reason: "Invalid time" };
  }

  if (endHour - startHour !== 1) {
    return { bookable: false, reason: "Invalid duration" };
  }

  const slotStart = buildSlotDateTime(slot, fallbackDate);
  if (Number.isNaN(slotStart.getTime())) {
    return { bookable: false, reason: "Invalid date" };
  }

  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  if (Number.isNaN(now.getTime())) {
    return { bookable: false, reason: "Invalid date" };
  }

  if (slotStart <= now) {
    return { bookable: false, reason: "Expired" };
  }

  const earliestBookable = new Date(now.getTime() + MIN_BOOKING_LEAD_HOURS * 60 * 60 * 1000);
  if (slotStart <= earliestBookable) {
    return { bookable: false, reason: "Too soon to book" };
  }

  return { bookable: true, reason: "" };
}
