// Date field helpers convert real database dates into input values and display text.
// They support Firestore timestamps, ISO strings, and old exported Chinese date strings.
function pad2(value) {
  return String(value).padStart(2, "0");
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function timestampToDate(value) {
  // Firestore timestamps may be SDK objects or plain exported objects.
  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeof value.toDate === "function") {
    const parsed = value.toDate();
    return isValidDate(parsed) ? parsed : null;
  }

  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
  if (typeof seconds === "number") {
    const parsed = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
    return isValidDate(parsed) ? parsed : null;
  }

  return null;
}

function datePartsFromString(value) {
  // Read the date part without shifting it through the browser timezone.
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return { year: match[1], month: match[2], day: match[3] };
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return { year: match[3], month: pad2(match[2]), day: pad2(match[1]) };
  }

  match = text.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/);
  if (match) {
    return { year: match[1], month: pad2(match[2]), day: pad2(match[3]) };
  }

  return null;
}

export function toDateInputValue(value) {
  if (!value) {
    return "";
  }

  const parts = datePartsFromString(value);
  if (parts) {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  const timestampDate = timestampToDate(value);
  if (timestampDate) {
    return `${timestampDate.getFullYear()}-${pad2(timestampDate.getMonth() + 1)}-${pad2(timestampDate.getDate())}`;
  }

  const parsed = new Date(value);
  if (!isValidDate(parsed)) {
    return "";
  }

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

export function formatDateOnly(value, fallback = "Not available") {
  const dateKey = toDateInputValue(value);
  if (!dateKey) {
    return fallback;
  }

  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function timePartsFromString(value) {
  // Keep the stored hour and minute exactly as the database string shows them.
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  let match = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (match) {
    return { dateKey: match[1], hours: match[2] || "", minutes: match[3] || "" };
  }

  match = text.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5(?:\s*UTC[+-]?\d+\s*(\d{1,2}):(\d{2}))?/);
  if (match) {
    return {
      dateKey: `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`,
      hours: match[4] ? pad2(match[4]) : "",
      minutes: match[5] || "",
    };
  }

  return null;
}

export function formatDateTimeDisplay(value, fallback = "Not available", options = {}) {
  if (!value) {
    return fallback;
  }

  const includeTime = options.includeTime !== false;
  const stringParts = timePartsFromString(value);
  if (stringParts) {
    if (includeTime && stringParts.hours && stringParts.minutes) {
      return `${stringParts.dateKey} ${stringParts.hours}:${stringParts.minutes}`;
    }
    return stringParts.dateKey;
  }

  const parsed = timestampToDate(value) || new Date(value);
  if (!isValidDate(parsed)) {
    return String(value);
  }

  const dateKey = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  if (!includeTime) {
    return dateKey;
  }

  return `${dateKey} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}
