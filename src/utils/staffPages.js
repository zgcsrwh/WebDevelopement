function parseStoredDateTime(value = "") {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsedDate = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const normalizedValue =
    typeof value === "string" && !value.includes("T") && value.includes(" ")
      ? value.replace(" ", "T")
      : String(value);
  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateInputValue(value = "") {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = parseStoredDateTime(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
}

export function getDateInputMaxValue(daysFromToday = 0) {
  const next = new Date();
  next.setDate(next.getDate() + daysFromToday);
  return next.toISOString().slice(0, 10);
}

export function formatStaffDateTime(value = "") {
  const parsed = parseStoredDateTime(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStaffCardTimestamp(value = "", nowInput = new Date()) {
  const parsed = parseStoredDateTime(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }

  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  if (Number.isNaN(now.getTime())) {
    return formatStaffDateTime(parsed);
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) {
    const diffMs = Math.max(0, now.getTime() - parsed.getTime());
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    if (diffHours >= 1) {
      return `${diffHours} ${diffHours === 1 ? "hr" : "hrs"} ago`;
    }

    const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    return diffMinutes >= 60 ? "1 hr ago" : `${diffMinutes} mins ago`;
  }

  if (dayDiff === 1) {
    return `Yesterday ${parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return formatStaffDateTime(parsed);
}

export function formatShortStaffDate(value = "") {
  const parsed = parseStoredDateTime(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
