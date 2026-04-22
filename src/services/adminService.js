import { getApps, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth as getFirebaseAuth, signOut as signOutSecondaryAuth } from "firebase/auth";
import { firebaseConfig } from "../provider/FirebaseConfig";
import {
  BOOKING_ACTIVE_STATUSES,
  assertRole,
  formatEffectiveDateLabel,
  getActorByEmail,
  getCurrentActor,
  getEffectiveFacilityStatus,
  getFacilityChangeEffectiveDate,
  getPersistedFacilityStatus,
  toStoredDateString,
  getVirtualFacilityDoc,
  normalizeFacilityDoc,
} from "./centreService";
import {
  addCollectionDoc,
  getCollectionDocs,
  getDocById,
  normalizeTimestamp,
  serverTimestamp,
  setCollectionDoc,
  updateCollectionDoc,
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { displayStatus, formatRole } from "../utils/presentation";
import { callSubmitAction } from "./callableService";

const SECONDARY_AUTH_APP = "staff-account-creator";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function normalizeDateInput(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeHour(value) {
  return Number.parseInt(String(value || "").replace(":00", ""), 10);
}

function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSecondaryAuth() {
  const existingApp = getApps().find((item) => item.name === SECONDARY_AUTH_APP);
  const app = existingApp || initializeApp(firebaseConfig, SECONDARY_AUTH_APP);
  return getFirebaseAuth(existingApp || app);
}

function isResolvedRepairStatus(status = "") {
  return ["resolved", "terminated"].includes(String(status || "").toLowerCase());
}

function buildScheduledChange(type, payload = {}) {
  return {
    type,
    effective_on: getFacilityChangeEffectiveDate(),
    payload,
  };
}

function formatScheduledChange(change) {
  if (!change) {
    return "";
  }

  if (change.type === "delete") {
    return `Deletion will take effect on ${formatEffectiveDateLabel(change.effectiveOn)}.`;
  }

  const startTime = normalizeHour(change.payload?.start_time);
  const endTime = normalizeHour(change.payload?.end_time);
  return `New hours ${String(startTime).padStart(2, "0")}:00 - ${String(endTime).padStart(2, "0")}:00 will take effect on ${formatEffectiveDateLabel(change.effectiveOn)}.`;
}

async function assertActiveStaffAccount(staffId) {
  if (!staffId) {
    return null;
  }

  const staffDoc = await getDocById("admin_staff", staffId);
  if (!staffDoc) {
    throw createAppError("not-found", "The selected staff member could not be found.");
  }

  if (String(staffDoc.role || "").toLowerCase() !== "staff") {
    throw createAppError("failed-precondition", "Only staff accounts can be assigned to facilities.");
  }

  if (String(staffDoc.status || "").toLowerCase() !== "active") {
    throw createAppError("failed-precondition", "Please assign an active staff member.");
  }

  return staffDoc;
}

async function syncActiveFacilityAssignments(facilityId, nextStaffId) {
  const [requestItems, repairItems] = await Promise.all([
    getCollectionDocs("request", [where("facility_id", "==", facilityId)]),
    getCollectionDocs("repair", [where("facility_id", "==", facilityId)]),
  ]);

  await Promise.all([
    ...requestItems
      .filter((item) => {
        const status = String(item.status || "").toLowerCase();
        return BOOKING_ACTIVE_STATUSES.has(status) || status === "suggested";
      })
      .map((item) =>
        updateCollectionDoc("request", item.id, {
          staff_id: nextStaffId,
          updated_at: serverTimestamp(),
        }),
      ),
    ...repairItems
      .filter((item) => !isResolvedRepairStatus(item.status))
      .map((item) =>
        updateCollectionDoc("repair", item.id, {
          staff_id: nextStaffId,
          updated_at: serverTimestamp(),
        }),
      ),
  ]);
}

function buildManagedFacilitySummary(staffId, facilityItems) {
  const managedFacilities = facilityItems.filter((item) => item.staffId === staffId && item.status !== "deleted");
  return {
    names: managedFacilities.map((item) => item.name),
    count: managedFacilities.length,
  };
}

function validateFacilityForm(form) {
  if (!form.name?.trim()) {
    throw createAppError("invalid-argument", "Please enter the facility name.");
  }

  if (!form.sport_type?.trim()) {
    throw createAppError("invalid-argument", "Please choose a sport type.");
  }

  if (!form.location?.trim()) {
    throw createAppError("invalid-argument", "Please enter the facility location.");
  }

  const capacity = Number(form.capacity || 0);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
    throw createAppError("invalid-argument", "Facility capacity must be a whole number from 1 to 200.");
  }

  const startTime = normalizeHour(form.start_time);
  const endTime = normalizeHour(form.end_time);
  if (!Number.isInteger(startTime) || !Number.isInteger(endTime) || startTime < 6 || endTime > 23 || endTime <= startTime) {
    throw createAppError("invalid-argument", "Opening hours must use whole hours and the closing hour must be later than the opening hour.");
  }

  return {
    capacity,
    startTime,
    endTime,
  };
}

export function buildStaffEmailPreview({ email }) {
  return `Share ${email} and the initial password securely with the employee.`;
}

export function getFacilityStatusSummary(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "normal") {
    return "The facility is available for new bookings.";
  }

  if (normalizedStatus === "fixing") {
    return "The facility is under repair and cannot accept new bookings right now.";
  }

  if (normalizedStatus === "outdate") {
    return "The facility is off shelf until staff assignment or availability is restored.";
  }

  if (normalizedStatus === "deleted") {
    return "The facility has been removed from service.";
  }

  return displayStatus(normalizedStatus);
}

export async function getAdminStaff(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);

  const [staffItems, facilityDocs] = await Promise.all([
    getCollectionDocs("admin_staff"),
    getCollectionDocs("facility"),
  ]);

  const facilityItems = facilityDocs.map((item) => {
    const virtualFacility = getVirtualFacilityDoc(item);
    return {
      id: virtualFacility.id,
      name: virtualFacility.name,
      status: getPersistedFacilityStatus(virtualFacility),
      staffId: virtualFacility.staffId,
    };
  });

  return staffItems
    .map((item) => {
      const managedFacilities = buildManagedFacilitySummary(item.id, facilityItems);
      const role = String(item.role || "staff").toLowerCase();

      return {
        id: item.id,
        name: item.name || "",
        email: item.email || "",
        role,
        roleLabel: formatRole(role),
        status: item.status || "active",
        statusLabel: displayStatus(item.status || "active"),
        address: item.address || "",
        dateOfBirth: normalizeDateInput(item.date_of_birth),
        joinedDate: normalizeTimestamp(item.created_at),
        managedFacility: managedFacilities.count ? managedFacilities.names.join(", ") : role === "admin" ? "Admin account" : "No assigned facilities",
        managedFacilityCount: managedFacilities.count,
        raw: item,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function createStaffAccountDirect(form, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);

  const name = String(form.name || "").trim();
  const address = String(form.address || "").trim();
  const email = normalizeEmail(form.email);
  const password = String(form.password || "");
  const dateOfBirth = normalizeDateInput(form.date_of_birth);

  if (!name || !address || !email || !password || !dateOfBirth) {
    throw createAppError("invalid-argument", "Please complete the employee name, date of birth, address, email, and password.");
  }

  const existingActor = await getActorByEmail(email);
  if (existingActor) {
    throw createAppError("already-exists", "An account already exists for this email address.");
  }

  const secondaryAuth = getSecondaryAuth();
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await setCollectionDoc(
      "admin_staff",
      credential.user.uid,
      {
        name,
        email,
        address,
        date_of_birth: toStoredDateString(dateOfBirth),
        role: "staff",
        status: "active",
        created_at: serverTimestamp(),
      },
      { merge: true },
    );

    return { success: true, staff_id: credential.user.uid };
  } finally {
    await signOutSecondaryAuth(secondaryAuth).catch(() => null);
  }
}

export async function createStaffAccount(form, actor) {
  return callSubmitAction(
    "createStaffAccount",
    {
      name: String(form.name || "").trim(),
      date_of_birth: form.date_of_birth,
      address: String(form.address || "").trim(),
      email: normalizeEmail(form.email),
      password: String(form.password || ""),
    },
  );
}

export async function updateStaffAccount(form, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);

  if (!form.staff_id) {
    throw createAppError("invalid-argument", "Please choose a staff account to update.");
  }

  const existing = await getDocById("admin_staff", form.staff_id);
  if (!existing) {
    throw createAppError("not-found");
  }

  if (!String(form.name || "").trim() || !String(form.address || "").trim() || !normalizeDateInput(form.date_of_birth)) {
    throw createAppError("invalid-argument", "Please complete the employee name, date of birth, and address.");
  }

  await updateCollectionDoc("admin_staff", form.staff_id, {
    name: String(form.name || "").trim(),
    address: String(form.address || "").trim(),
    date_of_birth: toStoredDateString(form.date_of_birth),
    updated_at: serverTimestamp(),
  });

  return { success: true };
}

async function disableStaffAccountDirect(staffIdOrPayload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);
  const staffId =
    typeof staffIdOrPayload === "object" && staffIdOrPayload !== null
      ? staffIdOrPayload.staff_id || staffIdOrPayload.id
      : staffIdOrPayload;

  const existing = await getDocById("admin_staff", staffId);
  if (!existing) {
    throw createAppError("not-found");
  }

  const facilityDocs = await getCollectionDocs("facility", [where("staff_id", "==", staffId)]);
  const activeAssignments = facilityDocs
    .map((item) => getVirtualFacilityDoc(item))
    .filter((item) => getPersistedFacilityStatus(item) !== "deleted");

  if (activeAssignments.length) {
    throw createAppError(
      "failed-precondition",
      `This staff member still manages active facilities: ${activeAssignments.map((item) => item.name).join(", ")}. Please transfer them first.`,
    );
  }

  await updateCollectionDoc("admin_staff", staffId, {
    status: "deactivate",
    updated_at: serverTimestamp(),
  });

  return { success: true };
}

export async function disableStaffAccount(staffIdOrPayload, actor) {
  const payload =
    typeof staffIdOrPayload === "object" && staffIdOrPayload !== null
      ? { staff_id: staffIdOrPayload.staff_id || staffIdOrPayload.id }
      : { staff_id: staffIdOrPayload };

  return callSubmitAction("disableStaffAccount", payload);
}

export async function getAdminFacilities(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);

  const [facilityDocs, repairItems, staffItems] = await Promise.all([
    getCollectionDocs("facility"),
    getCollectionDocs("repair"),
    getCollectionDocs("admin_staff"),
  ]);

  const staffLookup = new Map(staffItems.map((item) => [item.id, item]));

  return facilityDocs
    .map((item) => {
      const rawFacility = normalizeFacilityDoc(item);
      const virtualFacility = getVirtualFacilityDoc(item);
      const pendingChange = rawFacility.scheduledChange && rawFacility.scheduledChange.effectiveOn > getTodayKey() ? rawFacility.scheduledChange : null;
      const status = getEffectiveFacilityStatus(
        virtualFacility,
        repairItems.filter((repair) => repair.facility_id === item.id),
      );
      const assignedStaff = virtualFacility.staffId ? [staffLookup.get(virtualFacility.staffId)?.name || virtualFacility.staffId] : [];

      return {
        id: virtualFacility.id,
        name: virtualFacility.name,
        sportType: virtualFacility.sportType,
        description: virtualFacility.description,
        usageGuidelines: virtualFacility.usageGuidelines,
        capacity: virtualFacility.capacity,
        status,
        statusLabel: displayStatus(status),
        location: virtualFacility.location,
        startTime: virtualFacility.startTime,
        endTime: virtualFacility.endTime,
        rawStartTime: rawFacility.startTime,
        rawEndTime: rawFacility.endTime,
        pendingStartTime: pendingChange?.type === "update" ? normalizeHour(pendingChange.payload?.start_time) : null,
        pendingEndTime: pendingChange?.type === "update" ? normalizeHour(pendingChange.payload?.end_time) : null,
        pendingChangeType: pendingChange?.type || "",
        pendingChangeEffectiveOn: pendingChange?.effectiveOn || "",
        pendingChangeLabel: formatScheduledChange(pendingChange),
        isDeletionScheduled: pendingChange?.type === "delete",
        staffId: virtualFacility.staffId,
        assignedStaff,
        raw: item,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function upsertFacilityDirect(form, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);

  const { capacity, startTime, endTime } = validateFacilityForm(form);
  const nextStaffId = String(form.staff_id || "").trim();
  if (!nextStaffId) {
    throw createAppError("failed-precondition", "Please assign one active staff member to this facility.");
  }
  await assertActiveStaffAccount(nextStaffId);

  const basePayload = {
    name: String(form.name || "").trim(),
    sport_type: String(form.sport_type || "").trim(),
    description: String(form.description || "").trim(),
    usage_guidelines: String(form.usage_guidelines || "").trim(),
    capacity,
    location: String(form.location || "").trim(),
    staff_id: nextStaffId,
    status: "normal",
    updated_at: serverTimestamp(),
  };

  if (!form.facility_id) {
    const facilityId = await addCollectionDoc("facility", {
      ...basePayload,
      start_time: startTime,
      end_time: endTime,
      scheduled_change: null,
    });
    return {
      success: true,
      facility_id: facilityId,
    };
  }

  const existingDoc = await getDocById("facility", form.facility_id);
  if (!existingDoc) {
    throw createAppError("not-found");
  }

  const rawFacility = normalizeFacilityDoc(existingDoc);
  const virtualFacility = getVirtualFacilityDoc(existingDoc);
  const pendingScheduledChange = rawFacility.scheduledChange && rawFacility.scheduledChange.effectiveOn > getTodayKey() ? rawFacility.scheduledChange : null;
  if (getPersistedFacilityStatus(virtualFacility) === "deleted") {
    throw createAppError("failed-precondition", "Deleted facilities cannot be edited.");
  }

  if (pendingScheduledChange?.type === "delete") {
    throw createAppError("failed-precondition", "This facility is already scheduled for deletion.");
  }

  let scheduledChange = pendingScheduledChange;
  const desiredMatchesCurrentHours = startTime === virtualFacility.startTime && endTime === virtualFacility.endTime;
  const desiredMatchesPendingHours =
    pendingScheduledChange?.type === "update" &&
    normalizeHour(pendingScheduledChange.payload?.start_time) === startTime &&
    normalizeHour(pendingScheduledChange.payload?.end_time) === endTime;

  if (!desiredMatchesCurrentHours) {
    scheduledChange = desiredMatchesPendingHours
      ? buildScheduledChange("update", {
          start_time: normalizeHour(pendingScheduledChange?.payload?.start_time),
          end_time: normalizeHour(pendingScheduledChange?.payload?.end_time),
        })
      : buildScheduledChange("update", {
          start_time: startTime,
          end_time: endTime,
        });

    if (desiredMatchesPendingHours && pendingScheduledChange?.effectiveOn) {
      scheduledChange.effective_on = pendingScheduledChange.effectiveOn;
    }
  } else if (pendingScheduledChange?.type === "update") {
    scheduledChange = null;
  }

  await updateCollectionDoc("facility", form.facility_id, {
    ...basePayload,
    start_time: virtualFacility.startTime,
    end_time: virtualFacility.endTime,
    scheduled_change: scheduledChange,
  });

  if (rawFacility.staffId !== nextStaffId && nextStaffId) {
    await syncActiveFacilityAssignments(form.facility_id, nextStaffId);
  }

  return {
    success: true,
    facility_id: form.facility_id,
    effective_on: scheduledChange?.effective_on || "",
  };
}

export async function upsertFacility(form, actor) {
  return callSubmitAction(
    "upsertFacility",
    {
      facility_id: form.facility_id || "",
      name: String(form.name || "").trim(),
      sport_type: String(form.sport_type || "").trim(),
      description: String(form.description || "").trim(),
      usage_guidelines: String(form.usage_guidelines || "").trim(),
      capacity: Number(form.capacity || 0),
      start_time: Number(form.start_time || 0),
      end_time: Number(form.end_time || 0),
      location: String(form.location || "").trim(),
      staff_id: String(form.staff_id || "").trim(),
    },
  );
}

async function deleteFacilityDirect(facilityIdOrPayload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);
  const facilityId =
    typeof facilityIdOrPayload === "object" && facilityIdOrPayload !== null
      ? facilityIdOrPayload.facility_id || facilityIdOrPayload.id
      : facilityIdOrPayload;

  const existingDoc = await getDocById("facility", facilityId);
  if (!existingDoc) {
    throw createAppError("not-found");
  }

  const rawFacility = normalizeFacilityDoc(existingDoc);
  const virtualFacility = getVirtualFacilityDoc(existingDoc);
  if (getPersistedFacilityStatus(virtualFacility) === "deleted") {
    throw createAppError("failed-precondition", "This facility has already been deleted.");
  }

  if (rawFacility.scheduledChange?.type === "delete") {
    throw createAppError("failed-precondition", "This facility is already scheduled for deletion.");
  }

  const scheduledChange = buildScheduledChange("delete");
  await updateCollectionDoc("facility", facilityId, {
    scheduled_change: scheduledChange,
    updated_at: serverTimestamp(),
  });

  return {
    success: true,
    effective_on: scheduledChange.effective_on,
  };
}

export async function deleteFacility(facilityIdOrPayload, actor) {
  const payload =
    typeof facilityIdOrPayload === "object" && facilityIdOrPayload !== null
      ? { facility_id: facilityIdOrPayload.facility_id || facilityIdOrPayload.id }
      : { facility_id: facilityIdOrPayload };

  return callSubmitAction("deleteFacility", payload);
}

async function manageFacilityStaffDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Admin"]);

  const facilityId = payload.facility_id || payload.id;
  const assignedStaff = Array.isArray(payload.assignedStaff) ? payload.assignedStaff.filter(Boolean) : [];
  if (!facilityId) {
    throw createAppError("invalid-argument", "Please choose a facility to update.");
  }
  if (!assignedStaff.length) {
    throw createAppError("failed-precondition", "Please assign at least one staff member.");
  }
  if (assignedStaff.length > 1) {
    throw createAppError("invalid-argument", "This project currently supports one responsible staff member per facility.");
  }

  const existingDoc = await getDocById("facility", facilityId);
  if (!existingDoc) {
    throw createAppError("not-found");
  }

  const virtualFacility = getVirtualFacilityDoc(existingDoc);
  if (getPersistedFacilityStatus(virtualFacility) === "deleted") {
    throw createAppError("failed-precondition", "Deleted facilities cannot be reassigned.");
  }

  const nextStaffId = String(assignedStaff[0] || "").trim();
  await assertActiveStaffAccount(nextStaffId);

  await updateCollectionDoc("facility", facilityId, {
    staff_id: nextStaffId,
    status: "normal",
    updated_at: serverTimestamp(),
  });

  if (virtualFacility.staffId !== nextStaffId) {
    await syncActiveFacilityAssignments(facilityId, nextStaffId);
  }

  return { success: true };
}

export async function manageFacilityStaff(payload, actor) {
  return callSubmitAction(
    "manageFacilityStaff",
    {
      facility_id: payload.facility_id || payload.id,
      assignedStaff: Array.isArray(payload.assignedStaff) ? payload.assignedStaff.filter(Boolean) : [],
    },
  );
}
