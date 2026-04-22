import { getActorByEmail, setFriendIds, toStoredDateString } from "./centreService";
import { callSubmitAction } from "./callableService";
import { addCollectionDoc, getCollectionDocs, where } from "./firestoreService";
import { createAppError } from "../utils/errors";

function normalizeRoleValue(value = "Member") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "admin") {
    return "Admin";
  }
  if (normalized === "staff") {
    return "Staff";
  }
  return "Member";
}

function normalizeStatusValue(value = "active") {
  const resolved = Array.isArray(value) ? value.find(Boolean) : value;
  return String(resolved || "active").trim().toLowerCase();
}

function buildProfilePayload({ name, email, address, password, dateOfBirth, date_of_birth: dateOfBirthLegacy }) {
  const resolvedDateOfBirth = dateOfBirth || dateOfBirthLegacy || "";

  return {
    name: String(name || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    address: String(address || "").trim(),
    date_of_birth: toStoredDateString(resolvedDateOfBirth),
    password: String(password || ""),
  };
}

export function normalizeUserContextPayload(payload = {}, fallbackRole = "Member") {
  const safeRole = normalizeRoleValue(payload.role || fallbackRole);
  const safeProfile = payload.profile && typeof payload.profile === "object" ? payload.profile : {};
  const safeStatus = normalizeStatusValue(payload.status || safeProfile.status || "active");
  const isProfileComplete =
    typeof payload.isProfileComplete === "boolean"
      ? payload.isProfileComplete
      : Boolean(safeProfile.id || safeProfile.email);

  return {
    ...payload,
    role: safeRole,
    status: safeStatus,
    profile: {
      ...safeProfile,
      role: normalizeRoleValue(safeProfile.role || safeRole),
      status: normalizeStatusValue(safeProfile.status || safeStatus),
    },
    isProfileComplete,
  };
}

async function createUserProfileDirect(payload) {
  const profilePayload = buildProfilePayload(payload);
  const existingMembers = await getCollectionDocs("member", [where("email", "==", profilePayload.email)]);

  if (existingMembers.length > 0) {
    throw createAppError("already-exists", "This email address is already registered.");
  }

  const memberId = await addCollectionDoc("member", {
    name: profilePayload.name,
    email: profilePayload.email,
    address: profilePayload.address,
    date_of_birth: profilePayload.date_of_birth,
    cancel_times: 0,
    no_show_times: 0,
    profile_ID: "",
    status: "active",
  });

  await setFriendIds(memberId, []);

  return { success: true, role: "Member", member_id: memberId };
}

export async function createUserProfile(payload) {
  const profilePayload = buildProfilePayload(payload);

  const response = await callSubmitAction(
    "createUserProfile",
    {
      name: profilePayload.name,
      date_of_birth: profilePayload.date_of_birth,
      address: profilePayload.address,
      email: profilePayload.email,
      password: profilePayload.password,
    },
    () => createUserProfileDirect(profilePayload),
  );

  return {
    ...response,
    role: normalizeRoleValue(response?.role || "Member"),
  };
}

export async function getUserContextDirect(email, displayName = "Member") {
  const actor = await getActorByEmail(email).catch(() => null);
  const fallbackProfile = {
    id: "",
    name: displayName,
    email,
    role: "Member",
    status: "active",
  };

  const profile = actor || fallbackProfile;
  const role = actor?.role || "Member";
  const isProfileComplete = Boolean(actor);

  return normalizeUserContextPayload({
    role,
    status: profile.status || "active",
    profile,
    isProfileComplete,
  }, role);
}

export async function getUserContextOnLogin(email, displayName = "Member") {
  const response = await callSubmitAction(
    "getUserContext",
    {},
    () => getUserContextDirect(email, displayName),
  );

  return normalizeUserContextPayload(response, "Member");
}

export async function getUserContext(email, displayName = "Member") {
  return getUserContextOnLogin(email, displayName);
}

export async function getRegistrationEligibility(email) {
  const context = await getUserContextDirect(email, email.split("@")[0] || "Member");
  return {
    ...context,
    canRegister: !context.isProfileComplete,
  };
}

export async function loginWithResolvedContext(email) {
  return getUserContextOnLogin(email, email.split("@")[0] || "Member");
}

export const registerProfile = createUserProfile;
export const getUserContextFromEmail = getUserContext;
