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
};

export function createAppError(code, message) {
  const error = new Error(message || ERROR_MESSAGES[code] || "Something went wrong.");
  error.code = code;
  return error;
}

export function getErrorCode(error) {
  return error?.code || error?.details?.code || "";
}

export function getErrorMessage(error, fallback = "Something went wrong.") {
  const code = getErrorCode(error);
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
