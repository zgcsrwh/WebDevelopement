// Small password rules shared by all profile pages.
import { hasMeaningfulText } from "../../utils/text";

export function isStrongPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(value || ""));
}

export function validatePasswordDraft(draft = {}, { requirePassword = false } = {}) {
  const nextPassword = String(draft.nextPassword || "");
  const confirmPassword = String(draft.confirmPassword || "");
  const dirty = hasMeaningfulText(nextPassword) || hasMeaningfulText(confirmPassword);
  const shouldValidate = requirePassword || dirty;
  const errors = {};

  // Empty boxes are allowed when the user is not changing password.
  if (!shouldValidate) {
    return { dirty, errors, valid: true };
  }

  if (!hasMeaningfulText(nextPassword)) {
    errors.nextPassword = "Please enter a new password.";
  } else if (!isStrongPassword(nextPassword)) {
    errors.nextPassword = "Password must be at least 8 characters long and include both letters and numbers.";
  }

  if (!hasMeaningfulText(confirmPassword)) {
    errors.confirmPassword = "Please confirm the new password.";
  } else if (nextPassword !== confirmPassword) {
    errors.confirmPassword = "The two passwords must match.";
  }

  return {
    dirty,
    errors,
    valid: Object.keys(errors).length === 0,
  };
}
