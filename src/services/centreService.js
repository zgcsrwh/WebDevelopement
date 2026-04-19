import { auth } from "../provider/FirebaseConfig";
import {
  addCollectionDoc,
  createWriteBatch,
  getCollectionDocs,
  getDocById,
  getDocumentRef,
  serverTimestamp,
  setCollectionDoc,
  updateCollectionDoc,
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";

export const BOOKING_ACTIVE_STATUSES = new Set(["pending", "accepted", "in_progress"]);
export const BOOKING_HISTORY_STATUSES = new Set(["rejected", "cancelled", "completed", "no_show", "suggested"]);
export const FACILITY_VISIBLE_STATUSES = new Set(["normal", "fixing"]);
export const FACILITY_BOOKABLE_STATUSES = new Set(["normal"]);
export const MATCH_VISIBLE_STATUSES = new Set(["pending", "accepted", "rejected", "invalidated"]);
const FACILITY_PERSISTED_STATUSES = new Set(["normal", "outdate", "deleted"]);

function toLocalDateKey(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function normalizeDateInput(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, days) {
  if (!dateKey) {
    return "";
  }

  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  parsed.setDate(parsed.getDate() + days);
  return toLocalDateKey(parsed);
}

function normalizeScheduledChange(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const type = String(value.type || "").toLowerCase();
  const effectiveOn = normalizeDateInput(value.effective_on || value.effectiveOn || value.date || "");
  const payload = value.payload && typeof value.payload === "object" ? value.payload : {};

  if (!type || !effectiveOn) {
    return null;
  }

  return {
    type,
    effectiveOn,
    payload,
  };
}

export function getFacilityChangeEffectiveDate(baseDate = new Date()) {
  return shiftDateKey(toLocalDateKey(baseDate), 7);
}

export function formatEffectiveDateLabel(value) {
  const safeDate = normalizeDateInput(value);
  if (!safeDate) {
    return "";
  }

  const parsed = new Date(`${safeDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return safeDate;
  }

  return parsed.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toHourNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number.parseInt(value.replace(":00", ""), 10);
  }
  return Number(value || 0);
}

export function toHourString(value) {
  return String(toHourNumber(value)).padStart(2, "0");
}

export function formatHourLabel(value) {
  return `${toHourString(value)}:00`;
}

export function formatHourRange(start, end) {
  return `${formatHourLabel(start)} - ${formatHourLabel(end)}`;
}

export function buildHourRange(start, end) {
  const safeStart = toHourNumber(start);
  const safeEnd = toHourNumber(end);
  return Array.from({ length: Math.max(safeEnd - safeStart, 0) }, (_, index) => safeStart + index);
}

export function buildHourOptions(start = 8, end = 21) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => formatHourLabel(start + index));
}

export function overlaps(startA, endA, startB, endB) {
  return toHourNumber(startA) < toHourNumber(endB) && toHourNumber(endA) > toHourNumber(startB);
}

export function buildDateTime(date, hour) {
  return new Date(`${date}T${toHourString(hour)}:00:00`);
}

export function getEffectiveBookingStatus(item = {}, now = new Date()) {
  const rawStatus = String(item.status || "").toLowerCase();
  if (!["accepted", "in_progress"].includes(rawStatus) || !item.date || !item.end_time) {
    return rawStatus || "pending";
  }

  const bookingEndTime = buildDateTime(item.date, item.end_time);
  if (Number.isNaN(bookingEndTime.getTime()) || bookingEndTime > now) {
    return rawStatus;
  }

  return rawStatus === "accepted" ? "no_show" : "completed";
}

export function getEffectiveFacilityStatus(facility = {}, repairs = []) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const persistedStatus = getPersistedFacilityStatus(normalizedFacility);

  if (persistedStatus !== "normal") {
    return persistedStatus;
  }

  return repairs.some((item) => getEffectiveRepairStatus(item, normalizedFacility) === "pending") ? "fixing" : "normal";
}

export function isActiveAccount(status = "") {
  return String(status || "").toLowerCase() === "active";
}

export function isFacilityVisible(status = "") {
  return FACILITY_VISIBLE_STATUSES.has(String(status || "").toLowerCase());
}

export function isFacilityBookable(status = "") {
  return FACILITY_BOOKABLE_STATUSES.has(String(status || "").toLowerCase());
}

export function normalizeMemberDoc(item = {}) {
  return {
    id: item.id || "",
    role: "Member",
    name: item.name || "",
    email: item.email || "",
    address: item.address || "",
    status: item.status || "active",
    dateOfBirth: normalizeDateInput(item.date_of_birth),
    createdAt: item.created_at || "",
    cancelTimes: Number(item.cancel_times || 0),
    noShowTimes: Number(item.no_show_times || 0),
    profileId: item.profile_ID || "",
    raw: item,
  };
}

export function normalizeStaffDoc(item = {}) {
  const rawRole = String(item.role || "staff").toLowerCase();
  return {
    id: item.id || "",
    role: rawRole === "admin" ? "Admin" : "Staff",
    name: item.name || "",
    email: item.email || "",
    address: item.address || "",
    status: item.status || "active",
    dateOfBirth: normalizeDateInput(item.date_of_birth),
    createdAt: item.created_at || "",
    raw: item,
  };
}

export function normalizeFacilityDoc(item = {}) {
  const rawStatus = String(item.status || "normal").toLowerCase();
  return {
    id: item.id || "",
    name: item.name || "",
    sportType: item.sport_type || "",
    description: item.description || "",
    usageGuidelines: item.usage_guidelines || "",
    capacity: Number(item.capacity || 0),
    status: rawStatus,
    rawStatus,
    location: item.location || "",
    startTime: Number(item.start_time ?? 9),
    endTime: Number(item.end_time ?? 18),
    staffId: item.staff_id || "",
    scheduledChange: normalizeScheduledChange(item.scheduled_change || item.scheduledChange),
    raw: item,
  };
}

function getPersistedFacilityStatus(facility = {}) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  if (normalizedFacility.rawStatus === "deleted") {
    return "deleted";
  }
  if (normalizedFacility.rawStatus === "outdate" || !normalizedFacility.staffId) {
    return "outdate";
  }
  return "normal";
}

function isRepairResolvedStatus(status = "") {
  return ["resolved", "terminated"].includes(String(status || "").toLowerCase());
}

export function getEffectiveRepairStatus(repair = {}, facility = {}) {
  const rawStatus = String(repair.status || "pending").toLowerCase();
  if (rawStatus === "resolved") {
    return "resolved";
  }
  if (rawStatus === "terminated") {
    return "terminated";
  }

  const persistedStatus = getPersistedFacilityStatus(facility);
  if (persistedStatus === "deleted") {
    return "terminated";
  }
  if (persistedStatus === "outdate") {
    return "suspended";
  }
  return "pending";
}

export function normalizeProfileDoc(item = {}) {
  return {
    id: item.id || "",
    memberId: item.member_id || "",
    nickname: item.nickname || "",
    openMatch: Boolean(item.open_match),
    interests: Array.isArray(item.interests) ? item.interests : [item.interests].filter(Boolean),
    availableTime: Array.isArray(item.available_time) ? item.available_time : [item.available_time].filter(Boolean),
    bio: item.self_description || "",
    lastUpdated: item.last_updated || item.created_at || "",
    raw: item,
  };
}

export async function getCurrentActor() {
  const email = normalizeEmail(auth.currentUser?.email);
  if (!email) {
    return null;
  }
  return getActorByEmail(email);
}

export async function getActorByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const [memberDocs, staffDocs] = await Promise.all([
    getCollectionDocs("member", [where("email", "==", normalizedEmail)]),
    getCollectionDocs("admin_staff", [where("email", "==", normalizedEmail)]),
  ]);

  if (staffDocs[0]) {
    return normalizeStaffDoc(staffDocs[0]);
  }

  if (memberDocs[0]) {
    return normalizeMemberDoc(memberDocs[0]);
  }

  return null;
}

export async function getMemberLookup() {
  const [members, profiles] = await Promise.all([getCollectionDocs("member"), getCollectionDocs("profile")]);
  const profileByMemberId = new Map(profiles.map((item) => [item.member_id, normalizeProfileDoc(item)]));

  return new Map(
    members.map((item) => {
      const normalizedMember = normalizeMemberDoc(item);
      return [
        normalizedMember.id,
        {
          ...normalizedMember,
          profile: profileByMemberId.get(normalizedMember.id) || null,
        },
      ];
    }),
  );
}

export async function getStaffLookup() {
  const staffItems = await getCollectionDocs("admin_staff");
  return new Map(staffItems.map((item) => {
    const normalized = normalizeStaffDoc(item);
    return [normalized.id, normalized];
  }));
}

export async function getFacilityLookup() {
  const [facilityItems, repairItems] = await Promise.all([getCollectionDocs("facility"), getCollectionDocs("repair")]);
  const nextLookup = new Map();

  for (const item of facilityItems) {
    let normalizedFacility = await applyDueFacilityChange(item);
    normalizedFacility = await ensurePersistedFacilityState(normalizedFacility);

    const facilityRepairs = repairItems.filter((repair) => repair.facility_id === normalizedFacility.id);
    const reconciledRepairs = await reconcileRepairStatusesForFacility(normalizedFacility, facilityRepairs);
    const effectiveStatus = getEffectiveFacilityStatus(normalizedFacility, reconciledRepairs);

    nextLookup.set(normalizedFacility.id, {
      ...normalizedFacility,
      status: effectiveStatus,
    });
  }

  return nextLookup;
}

export async function getFriendRecord(memberId) {
  const items = await getCollectionDocs("friends", [where("member_id", "==", memberId)]);
  return items[0] || null;
}

export async function setFriendIds(memberId, nextFriendIds) {
  const existing = await getFriendRecord(memberId);
  const payload = {
    member_id: memberId,
    friends_ids: [...new Set(nextFriendIds.filter(Boolean))],
  };

  if (existing?.id) {
    await updateCollectionDoc("friends", existing.id, payload);
    return existing.id;
  }

  await setCollectionDoc("friends", memberId, payload, { merge: true });
  return memberId;
}

export async function linkFriends(memberA, memberB) {
  const [recordA, recordB] = await Promise.all([getFriendRecord(memberA), getFriendRecord(memberB)]);
  const nextA = [...new Set([...(recordA?.friends_ids || []), memberB])];
  const nextB = [...new Set([...(recordB?.friends_ids || []), memberA])];
  await Promise.all([setFriendIds(memberA, nextA), setFriendIds(memberB, nextB)]);
}

export async function unlinkFriends(memberA, memberB) {
  const [recordA, recordB] = await Promise.all([getFriendRecord(memberA), getFriendRecord(memberB)]);
  await Promise.all([
    setFriendIds(memberA, (recordA?.friends_ids || []).filter((item) => item !== memberB)),
    setFriendIds(memberB, (recordB?.friends_ids || []).filter((item) => item !== memberA)),
  ]);
}

export async function ensureTimeSlotsForFacilityDate(facility, date) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const safeDate = normalizeDateInput(date);
  const existingSlots = (await getCollectionDocs("time_slot", [where("facility_id", "==", normalizedFacility.id)])).filter(
    (item) => item.date === safeDate,
  );

  if (existingSlots.length > 0) {
    return syncExistingSlotsToFacilityHours(existingSlots, normalizedFacility, safeDate);
  }

  const batch = createWriteBatch();

  buildHourRange(normalizedFacility.startTime, normalizedFacility.endTime).forEach((hour) => {
    const slotRef = getDocumentRef("time_slot", `${normalizedFacility.id}-${safeDate}-${toHourString(hour)}`);
    batch.set(slotRef, {
      facility_id: normalizedFacility.id,
      date: safeDate,
      start_time: toHourString(hour),
      end_time: toHourString(hour + 1),
      status: "open",
      request_id: "",
      created_at: serverTimestamp(),
    });
  });

  await batch.commit();

  return (await getCollectionDocs("time_slot", [where("facility_id", "==", normalizedFacility.id)])).filter(
    (item) => item.date === safeDate,
  ).sort((left, right) => toHourNumber(left.start_time) - toHourNumber(right.start_time));
}

async function syncExistingSlotsToFacilityHours(existingSlots, facility, date) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const safeDate = normalizeDateInput(date);
  const expectedHours = buildHourRange(normalizedFacility.startTime, normalizedFacility.endTime).map((hour) => toHourString(hour));
  const expectedHourSet = new Set(expectedHours);
  const existingByHour = new Map(existingSlots.map((item) => [toHourString(item.start_time), item]));
  const batch = createWriteBatch();
  let hasChanges = false;

  expectedHours.forEach((hour) => {
    if (existingByHour.has(hour)) {
      return;
    }

    hasChanges = true;
    batch.set(getDocumentRef("time_slot", `${normalizedFacility.id}-${safeDate}-${hour}`), {
      facility_id: normalizedFacility.id,
      date: safeDate,
      start_time: hour,
      end_time: toHourString(toHourNumber(hour) + 1),
      status: "open",
      request_id: "",
      created_at: serverTimestamp(),
    });
  });

  existingSlots.forEach((slot) => {
    const slotHour = toHourString(slot.start_time);
    const slotStatus = String(slot.status || "").toLowerCase();
    const hasRequest = Boolean(slot.request_id);

    if (expectedHourSet.has(slotHour) || slotStatus !== "open" || hasRequest) {
      return;
    }

    hasChanges = true;
    batch.delete(getDocumentRef("time_slot", slot.id));
  });

  if (!hasChanges) {
    return existingSlots.sort((left, right) => toHourNumber(left.start_time) - toHourNumber(right.start_time));
  }

  await batch.commit();
  return (await getCollectionDocs("time_slot", [where("facility_id", "==", normalizedFacility.id)])).filter(
    (item) => item.date === safeDate,
  ).sort((left, right) => toHourNumber(left.start_time) - toHourNumber(right.start_time));
}

function buildVirtualTimeSlotsForFacilityDate(facility, date) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const safeDate = normalizeDateInput(date);

  return buildHourRange(normalizedFacility.startTime, normalizedFacility.endTime).map((hour) => ({
    id: `${normalizedFacility.id}-${safeDate}-${toHourString(hour)}`,
    facility_id: normalizedFacility.id,
    date: safeDate,
    start_time: toHourString(hour),
    end_time: toHourString(hour + 1),
    status: "open",
    request_id: "",
  }));
}

export async function getTimeSlotsForFacilityDate(facility, date, options = {}) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const safeDate = normalizeDateInput(date);
  const existingSlots = (await getCollectionDocs("time_slot", [where("facility_id", "==", normalizedFacility.id)])).filter(
    (item) => item.date === safeDate,
  );

  if (existingSlots.length > 0) {
    return syncExistingSlotsToFacilityHours(existingSlots, normalizedFacility, safeDate);
  }

  if (options.persist) {
    const persistedSlots = await ensureTimeSlotsForFacilityDate(facility, date);
    return persistedSlots.sort((left, right) => toHourNumber(left.start_time) - toHourNumber(right.start_time));
  }

  return buildVirtualTimeSlotsForFacilityDate(facility, date);
}

export async function releaseRequestSlots(requestId) {
  const items = await getCollectionDocs("time_slot", [where("request_id", "==", requestId)]);
  if (!items.length) {
    return;
  }

  const batch = createWriteBatch();
  items.forEach((item) => {
    batch.update(getDocumentRef("time_slot", item.id), {
      status: "open",
      request_id: "",
      updated_at: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function claimSlotsForRequest(slotItems, requestId) {
  const batch = createWriteBatch();
  slotItems.forEach((slot) => {
    batch.update(getDocumentRef("time_slot", slot.id), {
      status: "locked",
      request_id: requestId,
      updated_at: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function createNotification(recipientId, message, type = "system", statusContext = "", referenceId = "") {
  if (!recipientId || !message) {
    return null;
  }

  return addCollectionDoc("notification", {
    member_id: recipientId,
    message,
    type,
    status_context: statusContext,
    reference_id: referenceId,
    is_read: false,
  });
}

export async function createNotifications(recipientIds, message, type = "system", statusContext = "", referenceId = "") {
  const uniqueRecipients = [...new Set(recipientIds.filter(Boolean))];
  await Promise.all(uniqueRecipients.map((recipientId) => createNotification(recipientId, message, type, statusContext, referenceId)));
}

export async function syncFacilityStatus(facilityId) {
  const facility = await getDocById("facility", facilityId);
  if (!facility) {
    return null;
  }

  let normalizedFacility = await applyDueFacilityChange(facility);
  normalizedFacility = await ensurePersistedFacilityState(normalizedFacility);
  const repairs = await reconcileRepairStatusesForFacility(normalizedFacility);

  return {
    ...normalizedFacility,
    status: getEffectiveFacilityStatus(normalizedFacility, repairs),
  };
}

export async function syncBookingLifecycleStatus() {
  const requests = await getCollectionDocs("request");
  const now = new Date();

  for (const request of requests) {
    const status = String(request.status || "").toLowerCase();
    if (!["accepted", "in_progress"].includes(status) || !request.date || !request.end_time) {
      continue;
    }

    const bookingEndTime = buildDateTime(request.date, request.end_time);
    if (Number.isNaN(bookingEndTime.getTime()) || bookingEndTime > now) {
      continue;
    }

    if (status === "accepted") {
      await updateCollectionDoc("request", request.id, {
        status: "no_show",
        completed_at: new Date().toISOString(),
        updated_at: serverTimestamp(),
      });

      if (request.member_id) {
        const member = await getDocById("member", request.member_id);
        if (member) {
          await updateCollectionDoc("member", request.member_id, {
            no_show_times: Number(member.no_show_times || 0) + 1,
          });
        }
      }

      await createNotifications(
        [request.member_id, ...(request.participant_ids || [])],
        "A booking was marked as no-show because it was not checked in before the end time.",
        "facility_request",
        "no_show",
        request.id,
      );
      continue;
    }

    await updateCollectionDoc("request", request.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: serverTimestamp(),
    });

    await createNotifications(
      [request.member_id, ...(request.participant_ids || [])],
      "A booking session has been completed successfully.",
      "facility_request",
      "completed",
      request.id,
    );
  }
}

export function assertRole(actor, allowedRoles) {
  if (!actor) {
    throw createAppError("unauthenticated");
  }

  if (!allowedRoles.includes(actor.role)) {
    throw createAppError("permission-denied");
  }

  if (!isActiveAccount(actor.status)) {
    throw createAppError("permission-denied", "This account is currently inactive.");
  }
}

async function applyDueFacilityChange(facility, now = new Date()) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const scheduledChange = normalizedFacility.scheduledChange;

  if (!scheduledChange || scheduledChange.effectiveOn > toLocalDateKey(now)) {
    return normalizedFacility;
  }

  if (scheduledChange.type === "delete") {
    await updateCollectionDoc("facility", normalizedFacility.id, {
      status: "deleted",
      staff_id: "",
      scheduled_change: null,
      updated_at: serverTimestamp(),
    });

    return normalizeFacilityDoc({
      ...normalizedFacility.raw,
      status: "deleted",
      staff_id: "",
      scheduled_change: null,
    });
  }

  const nextPayload = {
    ...scheduledChange.payload,
    scheduled_change: null,
  };

  await updateCollectionDoc("facility", normalizedFacility.id, {
    ...nextPayload,
    updated_at: serverTimestamp(),
  });

  if (scheduledChange.payload?.staff_id && scheduledChange.payload.staff_id !== normalizedFacility.staffId) {
    await syncRelatedFacilityAssignments(normalizedFacility.id, scheduledChange.payload.staff_id);
  }

  return normalizeFacilityDoc({
    ...normalizedFacility.raw,
    ...nextPayload,
  });
}

async function ensurePersistedFacilityState(facility) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const nextStatus = getPersistedFacilityStatus(normalizedFacility);
  const updates = {};

  if (!FACILITY_PERSISTED_STATUSES.has(normalizedFacility.rawStatus) || normalizedFacility.rawStatus !== nextStatus) {
    updates.status = nextStatus;
  }

  if (nextStatus === "deleted" && normalizedFacility.staffId) {
    updates.staff_id = "";
  }

  if (!Object.keys(updates).length) {
    return normalizedFacility;
  }

  await updateCollectionDoc("facility", normalizedFacility.id, {
    ...updates,
    updated_at: serverTimestamp(),
  });

  return normalizeFacilityDoc({
    ...normalizedFacility.raw,
    ...updates,
  });
}

async function syncRelatedFacilityAssignments(facilityId, nextStaffId) {
  const [requests, repairs] = await Promise.all([
    getCollectionDocs("request", [where("facility_id", "==", facilityId)]),
    getCollectionDocs("repair", [where("facility_id", "==", facilityId)]),
  ]);

  await Promise.all([
    ...requests
      .filter((item) => BOOKING_ACTIVE_STATUSES.has(String(item.status || "").toLowerCase()) || String(item.status || "").toLowerCase() === "suggested")
      .map((item) =>
        updateCollectionDoc("request", item.id, {
          staff_id: nextStaffId,
          updated_at: serverTimestamp(),
        }),
      ),
    ...repairs
      .filter((item) => !isRepairResolvedStatus(item.status))
      .map((item) =>
        updateCollectionDoc("repair", item.id, {
          staff_id: nextStaffId,
          updated_at: serverTimestamp(),
        }),
      ),
  ]);
}

async function reconcileRepairStatusesForFacility(facility, repairItems = null) {
  const normalizedFacility = normalizeFacilityDoc(facility);
  const items = repairItems || (await getCollectionDocs("repair", [where("facility_id", "==", normalizedFacility.id)]));
  const batch = createWriteBatch();
  let hasUpdates = false;

  const reconciledItems = items.map((item) => {
    const nextStatus = getEffectiveRepairStatus(item, normalizedFacility);
    const currentStatus = String(item.status || "pending").toLowerCase();
    if (currentStatus !== nextStatus) {
      hasUpdates = true;
      batch.update(getDocumentRef("repair", item.id), {
        status: nextStatus,
        completed_at: nextStatus === "terminated" ? item.completed_at || new Date().toISOString() : nextStatus === "pending" ? "" : item.completed_at,
        updated_at: serverTimestamp(),
      });
    }

    return {
      ...item,
      status: nextStatus,
      completed_at: nextStatus === "terminated" ? item.completed_at || new Date().toISOString() : nextStatus === "pending" ? "" : item.completed_at,
    };
  });

  if (hasUpdates) {
    await batch.commit();
  }

  return reconciledItems;
}
