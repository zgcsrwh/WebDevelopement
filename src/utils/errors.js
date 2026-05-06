const ERROR_MESSAGES = {
  unauthenticated: "Please sign in again before continuing.",
  "permission-denied": "This account does not have permission to complete that action.",
  "invalid-argument": "Some required information is missing or formatted incorrectly. Please check the form and try again.",
  "already-exists": "A matching record already exists, so this duplicate action cannot be submitted.",
  "failed-precondition": "This action cannot continue because the current record status no longer matches the required workflow.",
  "resource-exhausted": "The selected time slot or resource is no longer available. Please refresh and choose another option.",
  "deadline-exceeded": "This action is no longer available because the allowed time window has passed.",
  "not-found": "The related record could not be found. It may have been removed or updated.",
  aborted: "This record has already been processed by someone else. Please refresh before trying again.",
  "already-processed": "This record has already been processed by someone else. Please refresh before trying again.",
  unavailable: "The service is temporarily unavailable. Please check your connection and try again.",
  internal: "The request could not be completed right now. Please try again later.",
};

const ACTION_ERROR_MESSAGES = {
  "auth.login": {
    "invalid-credential": "The email address or password is incorrect.",
    "user-not-found": "The email address or password is incorrect.",
    "wrong-password": "The email address or password is incorrect.",
    "invalid-email": "Please enter a valid email address.",
    "too-many-requests": "Too many sign-in attempts were made just now. Please wait a moment and try again.",
    "network-request-failed": "The sign-in request could not reach the service. Please check your connection and try again.",
    "permission-denied": "This account cannot sign in with the selected identity or current account status.",
    unavailable: "Sign-in is temporarily unavailable. Please try again later.",
    internal: "Sign-in could not be completed right now. Please try again later.",
    default: "Unable to sign in. Please check your email, password, and selected identity.",
  },
  "auth.register": {
    "email-already-in-use": "This email address is already registered. Please sign in instead.",
    "already-exists": "This email address is already registered. Please sign in instead.",
    "invalid-email": "Please enter a valid email address.",
    "weak-password": "Password must be at least 8 characters with letters and numbers.",
    "too-many-requests": "Too many verification attempts were made just now. Please wait a moment and try again.",
    "network-request-failed": "The registration request could not reach the service. Please check your connection and try again.",
    "permission-denied": "This email cannot be used for member registration.",
    unavailable: "Registration is temporarily unavailable. Please try again later.",
    internal: "Registration could not be completed right now. Please try again later.",
    default: "Registration could not be completed. Please check the form and try again.",
  },
  "notifications.load": {
    unauthenticated: "Please sign in again to view your notifications.",
    "permission-denied": "This account cannot view these notifications.",
    unavailable: "Notifications cannot be loaded because the service is temporarily unavailable. Please try again later.",
    internal: "Notifications cannot be loaded right now. Please try again later.",
    default: "Notifications cannot be loaded right now. Please refresh the page or try again later.",
  },
  "notifications.markRead": {
    unauthenticated: "Please sign in again before marking notifications as read.",
    "permission-denied": "This account cannot update these notifications.",
    "not-found": "One or more notifications no longer exist. Please refresh and try again.",
    unavailable: "The read status could not be updated because the service is temporarily unavailable.",
    default: "The notification read status could not be updated. Please try again.",
  },
  "match.load": {
    unauthenticated: "Please sign in again to view match requests.",
    "permission-denied": "This account cannot view these match requests.",
    "not-found": "This match request no longer exists.",
    unavailable: "Match request details cannot be loaded because the service is temporarily unavailable.",
    default: "The match request details cannot be loaded right now.",
  },
  "match.respond": {
    unauthenticated: "Please sign in again before responding to this match request.",
    "permission-denied": "Only the receiver of this match request can respond to it.",
    "failed-precondition": "This match request is no longer pending. It may have already been accepted, rejected, or invalidated.",
    "already-processed": "This match request has already been processed. Please refresh the list.",
    "not-found": "This match request no longer exists.",
    unavailable: "Your response could not be submitted because the service is temporarily unavailable.",
    default: "Your match response could not be submitted. Please refresh and try again.",
  },
  "booking.submit": {
    unauthenticated: "Please sign in again before submitting a booking request.",
    "invalid-argument": "The booking request is missing required information. Please check the date, time, attendees, and description.",
    "failed-precondition": "This booking cannot be submitted because the selected facility or time no longer meets the booking rules.",
    "resource-exhausted": "The selected time slot is no longer available. Please choose another open time.",
    default: "The booking request could not be submitted. Please check your details and try again.",
  },
  "booking.update": {
    unauthenticated: "Please sign in again before updating this booking.",
    "permission-denied": "This account cannot update this booking.",
    "failed-precondition": "This booking cannot be updated in its current status.",
    "resource-exhausted": "The selected replacement time is no longer available.",
    "not-found": "This booking no longer exists.",
    default: "This booking could not be updated. Please refresh and try again.",
  },
  "booking.load": {
    unauthenticated: "Please sign in again to view booking records.",
    "permission-denied": "This account cannot view these booking records.",
    "not-found": "The selected booking could not be found.",
    unavailable: "Booking records cannot be loaded because the service is temporarily unavailable.",
    default: "Booking records cannot be loaded right now. Please refresh and try again.",
  },
  "booking.approval": {
    unauthenticated: "Please sign in again before processing this booking request.",
    "permission-denied": "This account cannot process this booking request.",
    "invalid-argument": "The booking decision is missing required information. Please check the response field.",
    "failed-precondition": "Only pending booking requests can be processed.",
    "resource-exhausted": "The selected time slot is no longer available. Please choose another alternative.",
    "not-found": "This booking request no longer exists.",
    default: "This booking request could not be processed. Please refresh and try again.",
  },
  "booking.availability": {
    unavailable: "The latest time-slot availability cannot be loaded right now.",
    "not-found": "The related time slot could not be found.",
    default: "The latest time-slot availability could not be loaded.",
  },
  "repair.submit": {
    unauthenticated: "Please sign in again before submitting a repair report.",
    "invalid-argument": "The repair report is missing required information. Please choose a facility and describe the issue.",
    "failed-precondition": "This repair report cannot be submitted for the selected facility right now.",
    default: "The repair report could not be submitted. Please check the form and try again.",
  },
  "repair.resolve": {
    unauthenticated: "Please sign in again before resolving this repair ticket.",
    "permission-denied": "This account cannot resolve this repair ticket.",
    "failed-precondition": "Only pending repair tickets can be marked as resolved.",
    "not-found": "This repair ticket no longer exists.",
    default: "This repair ticket could not be updated. Please refresh and try again.",
  },
  "facility.save": {
    unauthenticated: "Please sign in again before saving facility changes.",
    "permission-denied": "This account cannot save facility changes.",
    "invalid-argument": "The facility form has missing or invalid information. Please check the highlighted fields.",
    "failed-precondition": "The facility changes do not meet the current operating or staffing rules.",
    default: "The facility changes could not be saved. Please check the form and try again.",
  },
  "facility.load": {
    unavailable: "Facilities cannot be loaded because the service is temporarily unavailable.",
    "permission-denied": "This account cannot view facility information.",
    default: "Facilities cannot be loaded right now. Please refresh and try again.",
  },
  "facility.delete": {
    unauthenticated: "Please sign in again before deleting this facility.",
    "permission-denied": "This account cannot delete facilities.",
    "failed-precondition": "This facility cannot be deleted because it still has records that must be handled first.",
    "not-found": "This facility no longer exists.",
    default: "This facility could not be deleted. Please refresh and try again.",
  },
  "repair.load": {
    unauthenticated: "Please sign in again to view repair records.",
    "permission-denied": "This account cannot view these repair records.",
    unavailable: "Repair records cannot be loaded because the service is temporarily unavailable.",
    default: "Repair records cannot be loaded right now. Please refresh and try again.",
  },
  "staff.create": {
    unauthenticated: "Please sign in again before creating a staff account.",
    "permission-denied": "This account cannot create staff accounts.",
    "invalid-argument": "The staff form has missing or invalid information. Please check the name, email, birth date, and address.",
    "already-exists": "This email address is already registered.",
    default: "The staff account could not be created. Please check the form and try again.",
  },
  "staff.load": {
    unauthenticated: "Please sign in again to view staff accounts.",
    "permission-denied": "This account cannot view staff accounts.",
    unavailable: "Staff accounts cannot be loaded because the service is temporarily unavailable.",
    default: "Staff accounts cannot be loaded right now. Please refresh and try again.",
  },
  "staff.disable": {
    unauthenticated: "Please sign in again before deactivating this staff account.",
    "permission-denied": "This account cannot deactivate staff accounts.",
    "failed-precondition": "This staff member still manages one or more facilities. Please reassign those facilities first.",
    "not-found": "This staff account no longer exists.",
    default: "The staff account could not be deactivated. Please refresh and try again.",
  },
  "staff.requests.load": {
    unauthenticated: "Please sign in again to view booking requests.",
    "permission-denied": "This account cannot view these booking requests.",
    unavailable: "Booking requests cannot be loaded because the service is temporarily unavailable.",
    default: "Booking requests cannot be loaded right now. Please refresh and try again.",
  },
  "staff.checkin.load": {
    unauthenticated: "Please sign in again to view check-in bookings.",
    "permission-denied": "This account cannot view check-in bookings.",
    unavailable: "Check-in bookings cannot be loaded because the service is temporarily unavailable.",
    default: "Check-in bookings cannot be loaded right now. Please refresh and try again.",
  },
  "staff.checkin.confirm": {
    unauthenticated: "Please sign in again before confirming arrival.",
    "permission-denied": "This account cannot confirm arrival for this booking.",
    "failed-precondition": "Only eligible accepted bookings can be checked in.",
    "not-found": "This booking no longer exists.",
    default: "Arrival could not be confirmed. Please refresh and try again.",
  },
  "friends.load": {
    unauthenticated: "Please sign in again to view your partners.",
    "permission-denied": "This account cannot view partner information.",
    unavailable: "Partner information cannot be loaded because the service is temporarily unavailable.",
    default: "Your partner list cannot be loaded right now. Please refresh and try again.",
  },
  "friends.remove": {
    unauthenticated: "Please sign in again before removing this friend.",
    "permission-denied": "This account cannot remove this friend.",
    "not-found": "This friend record no longer exists. Please refresh the page.",
    default: "This friend could not be removed. Please refresh and try again.",
  },
  "profile.load": {
    unauthenticated: "Please sign in again to view your profile.",
    "permission-denied": "This account cannot view this profile.",
    unavailable: "Profile details cannot be loaded because the service is temporarily unavailable.",
    default: "Profile details cannot be loaded right now. Please refresh and try again.",
  },
  "profile.save": {
    unauthenticated: "Please sign in again before saving your profile.",
    "permission-denied": "This account cannot update this profile.",
    "invalid-argument": "The profile form has missing or invalid information. Please check the highlighted fields.",
    default: "Your profile could not be saved. Please check the form and try again.",
  },
  "profile.deleteCheck": {
    unauthenticated: "Please sign in again before checking account deletion.",
    "permission-denied": "This account cannot request account deletion.",
    "failed-precondition": "This account still has unfinished records and cannot be deleted right now.",
    default: "Account deletion eligibility could not be checked right now. Please try again later.",
  },
  "profile.delete": {
    unauthenticated: "Please sign in again before deleting this account.",
    "permission-denied": "This account cannot be deleted from the current session.",
    "failed-precondition": "This account still has unfinished records and cannot be deleted right now.",
    default: "This account could not be deleted right now. Please try again later.",
  },
  "partner.profile.load": {
    unauthenticated: "Please sign in again to view your match profile.",
    "permission-denied": "This account cannot view this match profile.",
    unavailable: "Match profile details cannot be loaded because the service is temporarily unavailable.",
    default: "Match profile details cannot be loaded right now. Please refresh and try again.",
  },
  "partner.profile.save": {
    unauthenticated: "Please sign in again before saving your match profile.",
    "permission-denied": "This account cannot save this match profile.",
    "invalid-argument": "The match profile has missing or invalid information. Please check the highlighted fields.",
    default: "Your match profile could not be saved. Please check the form and try again.",
  },
  "partner.profile.toggle": {
    unauthenticated: "Please sign in again before changing match availability.",
    "permission-denied": "This account cannot change match availability.",
    "failed-precondition": "Please complete your match profile before opening match availability.",
    default: "Match availability could not be updated. Please try again.",
  },
  "partner.discover.load": {
    unauthenticated: "Please sign in again to view partner recommendations.",
    "permission-denied": "This account cannot view partner recommendations.",
    unavailable: "Partner recommendations cannot be loaded because the service is temporarily unavailable.",
    default: "Partner recommendations cannot be loaded right now. Please refresh and try again.",
  },
  "partner.request.send": {
    unauthenticated: "Please sign in again before sending this match request.",
    "permission-denied": "This account cannot send this match request.",
    "already-exists": "You have already sent a pending request to this member.",
    "failed-precondition": "This match request cannot be sent because one of the matching rules is no longer satisfied.",
    default: "This match request could not be sent. Please refresh and try again.",
  },
  "password.update": {
    unauthenticated: "Please sign in again before changing your password.",
    "permission-denied": "This account cannot change this password.",
    "invalid-argument": "The new password does not meet the password rules.",
    "failed-precondition": "For security reasons, please sign in again before changing your password.",
    default: "Your password could not be changed. Please check the password rules and try again.",
  },
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
  error.isAppError = true;
  return error;
}

export function getErrorCode(error) {
  return error?.code || error?.details?.code || "";
}

export function getActionErrorMessage(error, actionKey, fallback = "Something went wrong. Please try again.") {
  const rawCode = getErrorCode(error);
  const code = normalizeErrorCodeValue(rawCode);
  const actionMessages = ACTION_ERROR_MESSAGES[actionKey] || {};
  const message =
    (typeof error?.message === "string" && error.message.trim()) ||
    (typeof error?.details?.message === "string" && error.details.message.trim()) ||
    "";

  if (error?.isAppError && message && !isGenericMessage(message)) {
    return message;
  }

  if (code && actionMessages[code]) {
    return actionMessages[code];
  }

  const patternMessage = getPatternMessage(message || rawCode || code);
  if (patternMessage) {
    return patternMessage;
  }

  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  return actionMessages.default || fallback;
}
