// Callable service wraps Firebase callable functions so pages call one small helper.
import { httpsCallable } from "firebase/functions";
import { functions } from "../provider/FirebaseConfig";
import { createAppError } from "../utils/errors";

const FALLBACK_CODES = new Set([
  "functions/not-found",
  "functions/unavailable",
  "functions/unimplemented",
]);

const INTERNAL_FALLBACK_FUNCTIONS = new Set([
  "getUserContext",
  "createUserProfile",
]);

function normalizeErrorCode(code = "") {
  const raw = String(code || "").trim();
  if (!raw) {
    return "";
  }

  const withoutPrefix = raw.includes("/") ? raw.split("/").pop() : raw;
  return withoutPrefix.toLowerCase().replaceAll("_", "-");
}

function shouldUseFallback(error, functionName) {
  const code = String(error?.code || "").toLowerCase();
  const normalizedCode = normalizeErrorCode(error?.details?.code || error?.code);
  const message = String(error?.message || "").toLowerCase();

  if (FALLBACK_CODES.has(code)) {
    return true;
  }

  if (normalizedCode === "internal" && INTERNAL_FALLBACK_FUNCTIONS.has(functionName)) {
    return true;
  }

  return (
    message.includes("failed to fetch") ||
    message.includes("function was not found") ||
    message.includes("not implemented") ||
    message.includes("service unavailable")
  );
}

function unwrapCallableResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const normalizedErrorCode = normalizeErrorCode(payload.error?.code || payload.code);

  if (payload.success === false || payload.error) {
    throw createAppError(normalizedErrorCode || "internal");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "data")) {
    if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
      return {
        ...payload.data,
        ...(Object.prototype.hasOwnProperty.call(payload, "success") ? { success: payload.success } : {}),
      };
    }

    return payload.data;
  }

  return payload;
}

function normalizeCallableError(error) {
  const normalizedCode = normalizeErrorCode(error?.details?.code || error?.code);

  if (!normalizedCode) {
    return createAppError("internal");
  }

  return createAppError(normalizedCode);
}

export async function callSubmitAction(functionName, payload, fallbackImplementation) {
  try {
    const executeCallable = httpsCallable(functions, functionName);
    const response = await executeCallable(payload);
    return unwrapCallableResponse(response?.data);
  } catch (error) {
    if (typeof fallbackImplementation === "function" && shouldUseFallback(error, functionName)) {
      return fallbackImplementation();
    }

    throw normalizeCallableError(error);
  }
}
