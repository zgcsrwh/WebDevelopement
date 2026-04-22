const ERROR_MESSAGES = {
  unauthenticated: "Please sign in before continuing.",
  "permission-denied": "You do not have permission to perform this action.",
  "invalid-argument": "Please complete the required information using a valid format.",
  "already-exists": "This record already exists.",
  "failed-precondition": "This action is not allowed in the current state.",
  "resource-exhausted": "The selected resource is no longer available.",
  "deadline-exceeded": "This action has passed the allowed time limit.",
  "not-found": "The requested record no longer exists.",
  aborted: "This record has already been processed by someone else.",
  "already-processed": "This record has already been processed by someone else.",
  internal: "The server interface is temporarily unavailable.",
};

const CODE_EQUIVALENTS = {
  "auth/invalid-credential": "invalid-credential",
  "auth/user-not-found": "user-not-found",
  "auth/wrong-password": "wrong-password",
  "auth/invalid-email": "invalid-email",
  "auth/email-already-in-use": "email-already-in-use",
  "auth/too-many-requests": "too-many-requests",
  "auth/network-request-failed": "network-request-failed",
  "functions/internal": "internal",
  "functions/not-found": "not-found",
  "functions/unavailable": "unavailable",
  "functions/permission-denied": "permission-denied",
};

const MESSAGE_PATTERNS = [
  { pattern: /invalid-credential|user-not-found|wrong-password/i, message: "The email address or password is incorrect." },
  { pattern: /invalid-email/i, message: "Please enter a valid email address." },
  { pattern: /email-already-in-use/i, message: "This email address is already registered. Please sign in instead." },
  { pattern: /too-many-requests|quota-exceeded/i, message: "Too many attempts were made just now. Please wait a moment and try again." },
  { pattern: /network-request-failed|failed to fetch|network/i, message: "The network request failed. Please check your connection and try again." },
  { pattern: /permission-denied/i, message: "You do not have permission to perform this action." },
  { pattern: /resource-exhausted/i, message: "The selected time slot or resource is no longer available. Please refresh and choose again." },
  { pattern: /deadline-exceeded/i, message: "This action is no longer allowed because the time window has passed." },
  { pattern: /not-found/i, message: "The related record could not be found. It may have been removed already." },
  { pattern: /internal/i, message: "The server interface is temporarily unavailable. Please try again later." },
];

function normalizeErrorCodeValue(code = "") {
  const rawCode = String(code || "").trim().toLowerCase();
  if (!rawCode) {
    return "";
  }

  return CODE_EQUIVALENTS[rawCode] || rawCode;
}

function isGenericMessage(message = "") {
  const normalizedMessage = String(message || "").trim().toLowerCase();
  if (!normalizedMessage) {
    return true;
  }

  return (
    normalizedMessage in ERROR_MESSAGES ||
    normalizedMessage in CODE_EQUIVALENTS ||
    Object.values(CODE_EQUIVALENTS).includes(normalizedMessage) ||
    normalizedMessage === "error" ||
    normalizedMessage === "unknown"
  );
}

function getPatternMessage(text = "") {
  const source = String(text || "");
  const match = MESSAGE_PATTERNS.find((item) => item.pattern.test(source));
  return match?.message || "";
}

export function createAppError(code, message) {
  const error = new Error(message || ERROR_MESSAGES[code] || "Something went wrong.");
  error.code = code;
  return error;
}

export function getErrorCode(error) {
  return error?.code || error?.details?.code || "";
}

export function getErrorMessage(error, fallback = "Something went wrong.") {
  const rawCode = getErrorCode(error);
  const code = normalizeErrorCodeValue(rawCode);
  const message =
    (typeof error?.message === "string" && error.message.trim()) ||
    (typeof error?.details?.message === "string" && error.details.message.trim()) ||
    "";

  const messagePattern = getPatternMessage(message);
  if (messagePattern) {
    return messagePattern;
  }

  if (message && !isGenericMessage(message) && (!code || message !== ERROR_MESSAGES[code])) {
    return message;
  }

  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  const codePattern = getPatternMessage(code || rawCode);
  if (codePattern) {
    return codePattern;
  }

  if (message) {
    return message;
  }

  return fallback;
}
