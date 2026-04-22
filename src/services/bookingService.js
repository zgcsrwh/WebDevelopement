import { doc, getCollectionRef, runDbTransaction, serverTimestamp } from "./firestoreService";
import {
  assertRole,
  BOOKING_ACTIVE_STATUSES,
  buildDateTime,
  buildHourRange,
  createNotifications,
  formatHourRange,
  getCurrentActor,
  getEffectiveBookingStatus,
  getEffectiveFacilityStatus,
  getFacilityLookup,
  getFriendRecord,
  getMemberBookingDisplayStatus,
  getMemberLookup,
  getStaffLookup,
  getTimeSlotsForFacilityDate,
  getVirtualFacilityDoc,
  isFacilityBookable,
  isFacilityVisible,
  overlaps,
  releaseRequestSlots,
  toHourNumber,
  toHourString,
  toStoredDateString,
} from "./centreService";
import {
  buildCollectionQuery,
  buildDocSnapshot,
  getCollectionDocs,
  getDocById,
  getDocumentRef,
  normalizeTimestamp,
  orderBy,
  subscribeToCollection,
  updateCollectionDoc,
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { displayStatus } from "../utils/presentation";
import { callSubmitAction } from "./callableService";

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getMaxBookingDate() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildHourSlotRange(startHour, endHour) {
  const safeStart = Number(startHour);
  const safeEnd = Number(endHour);

  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd) || safeEnd <= safeStart) {
    return [];
  }

  return Array.from({ length: safeEnd - safeStart }, (_, index) => {
    const start = String(safeStart + index).padStart(2, "0");
    const end = String(safeStart + index + 1).padStart(2, "0");
    return `${start}:00 - ${end}:00`;
  });
}

function sortTimeSlots(slots = []) {
  return [...slots].sort((left, right) => {
    const leftStart = Number(String(left).slice(0, 2));
    const rightStart = Number(String(right).slice(0, 2));
    return leftStart - rightStart;
  });
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeKey(value = "") {
  return normalizeText(value).toLowerCase();
}

export async function getFacilityDateBounds() {
  return {
    minDate: getTodayDate(),
    maxDate: getMaxBookingDate(),
    defaultDate: getTodayDate(),
  };
}

export async function getFacilitySportTypes() {
  const facilityDocs = await getCollectionDocs("facility", [orderBy("sport_type", "asc")]);
  const uniqueTypes = new Map();

  facilityDocs.forEach((item) => {
    const label = normalizeText(item.sport_type);
    const key = normalizeKey(item.sport_type);

    if (!label || uniqueTypes.has(key)) {
      return;
    }

    uniqueTypes.set(key, label);
  });

  return [...uniqueTypes.values()];
}

export async function getFacilityTimeFilterOptions(selectedType = "All") {
  const [facilityDocs, repairs] = await Promise.all([
    getCollectionDocs("facility", [orderBy("sport_type", "asc")]),
    getCollectionDocs("repair"),
  ]);

  const visibleFacilities = facilityDocs
    .map((item) => {
      const virtualFacility = getVirtualFacilityDoc(item);
      return {
        ...virtualFacility,
        status: getEffectiveFacilityStatus(
          virtualFacility,
          repairs.filter((repair) => repair.facility_id === item.id),
        ),
      };
    })
    .filter((item) => isFacilityVisible(item.status));

  const scopedFacilities =
    selectedType === "All"
      ? visibleFacilities
      : visibleFacilities.filter((item) => String(item.sportType || "") === String(selectedType || ""));

  if (!scopedFacilities.length) {
    return ["All"];
  }

  if (selectedType === "All") {
    const startHours = scopedFacilities.map((item) => Number(item.startTime)).filter(Number.isFinite);
    const endHours = scopedFacilities.map((item) => Number(item.endTime)).filter(Number.isFinite);

    if (!startHours.length || !endHours.length) {
      return ["All"];
    }

    return ["All", ...buildHourSlotRange(Math.min(...startHours), Math.max(...endHours))];
  }

  const timeOptions = new Set();
  scopedFacilities.forEach((item) => {
    buildHourSlotRange(item.startTime, item.endTime).forEach((slot) => timeOptions.add(slot));
  });

  return ["All", ...sortTimeSlots([...timeOptions])];
}

export function isBookingCancellationAllowed(item, now = new Date()) {
  const source = item?.raw && typeof item.raw === "object" ? item.raw : item;
  const normalizedStatus = normalizeBookingStatusValue(source?.status);
  if (normalizedStatus !== "accepted") {
    return false;
  }

  const bookingStart = buildDateTime(
    source?.date || item?.date,
    source?.start_time ?? item?.start_time ?? item?.startTime,
  );
  if (Number.isNaN(bookingStart.getTime())) {
    return false;
  }

  return new Date(bookingStart.getTime() - 2 * 60 * 60 * 1000) > now;
}

export function isBookingCheckInOpen(item, now = new Date()) {
  if (String(item?.status || "").toLowerCase() !== "accepted") {
    return false;
  }

  const bookingStart = buildDateTime(item.date, item.start_time);
  if (Number.isNaN(bookingStart.getTime())) {
    return false;
  }

  const earliestCheckIn = new Date(bookingStart.getTime() - 15 * 60 * 1000);
  return now >= earliestCheckIn && now < bookingStart;
}

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

function normalizeParticipantIds(item = {}) {
  return [...new Set([...(item.participant_ids || []), ...(item.user_id_list || [])].filter(Boolean))];
}

function normalizeBookingStatusValue(value = "") {
  const rawStatus = String(value || "").trim().toLowerCase();

  if (!rawStatus) {
    return "";
  }

  return rawStatus.replace(/[_-]+/g, " ");
}

function applyMemberBookingDisplay(item) {
  const displayStatus = normalizeBookingStatusValue(getMemberBookingDisplayStatus(item.raw || item));
  return {
    ...item,
    status: displayStatus,
    statusLabel: displayStatus || item.statusLabel || "",
  };
}

export function getStaffRequestPageStatus(value = "") {
  const normalizedStatus = normalizeBookingStatusValue(value);
  return normalizedStatus === "suggested" ? "alternative suggested" : normalizedStatus;
}

export function getStaffCheckInPageStatus(item = {}, now = new Date()) {
  const source = item?.raw && typeof item.raw === "object" ? item.raw : item;
  const rawStatus = normalizeBookingStatusValue(source.status || item.status);
  const date = source.date || item.date || "";
  const startTime = source.start_time ?? item.start_time ?? item.startTime ?? "";
  const endTime = source.end_time ?? item.end_time ?? item.endTime ?? "";

  if (rawStatus === "accepted") {
    const bookingStartTime = buildDateTime(date, startTime);
    if (Number.isNaN(bookingStartTime.getTime())) {
      return "accepted";
    }
    return now < bookingStartTime ? "accepted" : "no_show";
  }

  if (rawStatus === "in progress" || rawStatus === "in_progress") {
    const bookingEndTime = buildDateTime(date, endTime);
    if (Number.isNaN(bookingEndTime.getTime())) {
      return "in_progress";
    }
    return now < bookingEndTime ? "in_progress" : "completed";
  }

  if (rawStatus === "no show" || rawStatus === "no_show") {
    return "no_show";
  }

  return rawStatus || "";
}

function sortBookings(items) {
  return [...items].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }
    return toHourNumber(right.start_time) - toHourNumber(left.start_time);
  });
}

function mapFacility(item, slotItems = []) {
  const openSlots = slotItems
    .filter((slot) => String(slot.status || "").toLowerCase() === "open")
    .map((slot) => formatHourRange(slot.start_time, slot.end_time));

  const lockedSlots = slotItems
    .filter((slot) => String(slot.status || "").toLowerCase() !== "open")
    .map((slot) => formatHourRange(slot.start_time, slot.end_time));

  return {
    id: item.id,
    name: item.name,
    sportType: normalizeText(item.sportType),
    description: item.description,
    usageGuidelines: item.usageGuidelines,
    capacity: item.capacity,
    status: item.status,
    statusLabel: displayStatus(item.status),
    location: item.location,
    startTime: item.startTime,
    endTime: item.endTime,
    staffId: item.staffId,
    availableSlots: openSlots,
    unavailableSlots: lockedSlots,
  };
}

function mapBooking(item, memberLookup, facilityLookup, staffLookup, actorId = "") {
  const facility = facilityLookup.get(item.facility_id);
  const member = memberLookup.get(item.member_id);
  const staff = staffLookup.get(item.staff_id);
  const participantIds = normalizeParticipantIds(item);
  const participantNames = participantIds
    .map((participantId) => memberLookup.get(participantId)?.name || participantId)
    .filter(Boolean);
  const effectiveStatus = normalizeBookingStatusValue(getEffectiveBookingStatus(item));

  return {
    id: item.id,
    facilityId: item.facility_id,
    facilityName: facility?.name || item.facility_id || "Facility",
    facilityLabel: facility ? `${facility.name} (${facility.sportType})` : item.facility_id,
    sportType: facility?.sportType || "",
    memberId: item.member_id || "",
    memberName: member?.name || "Member",
    staffId: item.staff_id || "",
    staffName: staff?.name || "Staff",
    status: effectiveStatus,
      statusLabel: effectiveStatus || String(item.status || "").toLowerCase(),
    date: item.date || "",
    startTime: toHourString(item.start_time),
    endTime: toHourString(item.end_time),
    time: formatHourRange(item.start_time, item.end_time),
    attendees: Number(item.attendent || 0),
    activityDescription: item.activity_description || "",
    feedback: item.staff_response || "",
    participantIds,
    participantNames,
    createdAt: normalizeTimestamp(item.created_at),
    completedAt: normalizeTimestamp(item.completed_at),
    isOwner: actorId ? actorId === item.member_id : false,
    isParticipant: actorId ? participantIds.includes(actorId) : false,
    raw: item,
  };
}

async function getLookups() {
  const [memberLookup, facilityLookup, staffLookup] = await Promise.all([
    getMemberLookup(),
    getFacilityLookup(),
    getStaffLookup(),
  ]);
  return { memberLookup, facilityLookup, staffLookup };
}

async function getRequestByIdOrThrow(requestId) {
  const request = await getDocById("request", requestId);
  if (!request) {
    throw createAppError("not-found");
  }
  return request;
}

async function validateFacilityBookingInput(facility, payload) {
  if (!payload.facility_id) {
    throw createAppError("invalid-argument", "Please select a facility.");
  }

  if (!payload.date) {
    throw createAppError("invalid-argument", "Please select a booking date.");
  }

  if (!payload.activity_description?.trim()) {
    throw createAppError("invalid-argument", "Please enter an activity description.");
  }

  if (payload.date < getTodayDate() || payload.date > getMaxBookingDate()) {
    const existingSlots = await getCollectionDocs("time_slot", [
      where("facility_id", "==", payload.facility_id),
      where("date", "==", payload.date),
    ]);

    if (!existingSlots.length) {
      throw createAppError("invalid-argument", "Bookings must be made within the visible booking date range.");
    }
  }

  const startTime = toHourNumber(payload.start_time);
  const endTime = toHourNumber(payload.end_time);
  const duration = endTime - startTime;

  if (startTime < facility.startTime || endTime > facility.endTime || duration !== 1) {
    throw createAppError("invalid-argument", "Each booking request must stay within facility hours and last exactly 1 hour.");
  }

  const attendees = Number(payload.attendent || 0);
  if (attendees < 1 || attendees > facility.capacity) {
    throw createAppError("invalid-argument", `Attendees must stay between 1 and ${facility.capacity}.`);
  }
}

async function validateInvitedPartners(actor, participantIds) {
  if (!participantIds.length) {
    return;
  }

  const [friendRecord, memberLookup] = await Promise.all([
    getFriendRecord(actor.id),
    getMemberLookup(),
  ]);

  const allowedFriendIds = new Set(friendRecord?.friends_ids || []);

  for (const participantId of participantIds) {
    if (!allowedFriendIds.has(participantId)) {
      throw createAppError("permission-denied", "Invited participants must come from your accepted friend list.");
    }

    const member = memberLookup.get(participantId);
    if (!member || String(member.status || "").toLowerCase() !== "active") {
      throw createAppError("failed-precondition", "All invited participants must still have active member accounts.");
    }
  }
}

function hasParticipantConflict(requests, involvedIds, selectedHours, currentRequestId = "") {
  for (const request of requests) {
    if (currentRequestId && request.id === currentRequestId) {
      continue;
    }

    const requestStatus = String(request.status || "").toLowerCase();
    if (!BOOKING_ACTIVE_STATUSES.has(requestStatus)) {
      continue;
    }

    const requestInvolvedIds = new Set([request.member_id, ...normalizeParticipantIds(request)]);
    const hasOverlapParticipant = [...involvedIds].some((id) => requestInvolvedIds.has(id));
    if (!hasOverlapParticipant) {
      continue;
    }

    if (overlaps(selectedHours[0], selectedHours[selectedHours.length - 1] + 1, request.start_time, request.end_time)) {
      return true;
    }
  }

  return false;
}

async function validateParticipantConflicts(actor, payload, selectedHours, currentRequestId = "") {
  const allRequestsForDate = await getCollectionDocs("request", [where("date", "==", payload.date)]);
  const involvedIds = new Set([actor.id, ...normalizeParticipantIds(payload)]);

  if (hasParticipantConflict(allRequestsForDate, involvedIds, selectedHours, currentRequestId)) {
    throw createAppError(
      "failed-precondition",
      "You or one of the invited friends already has an active booking in this time period.",
    );
  }
}

async function decorateRequests(items, actorId = "") {
  const { memberLookup, facilityLookup, staffLookup } = await getLookups();
  return sortBookings(items).map((item) => mapBooking(item, memberLookup, facilityLookup, staffLookup, actorId));
}

export async function getFacilities(selectedDate = getTodayDate(), options = {}) {
  const [facilityDocs, repairs] = await Promise.all([
    getCollectionDocs("facility", [orderBy("sport_type", "asc")]),
    getCollectionDocs("repair"),
  ]);
  const nextFacilities = await Promise.all(
    facilityDocs.map(async (item) => {
      const virtualFacility = getVirtualFacilityDoc(item);
      const facilityWithEffectiveStatus = {
        ...virtualFacility,
        status: getEffectiveFacilityStatus(
          virtualFacility,
          repairs.filter((repair) => repair.facility_id === item.id),
        ),
      };

      const slots = await getTimeSlotsForFacilityDate(facilityWithEffectiveStatus, selectedDate);
      return mapFacility(facilityWithEffectiveStatus, slots);
    }),
  );

  const nonDeletedFacilities = nextFacilities.filter((item) => item.status !== "deleted");
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    console.debug("[FacilitiesDebug:getFacilities]", {
      selectedDate,
      rawFacilityCount: facilityDocs.length,
      rawFacilities: facilityDocs.map((item) => ({
        id: item.id,
        name: item.name,
        sport_type: item.sport_type,
        status: item.status,
        staff_id: item.staff_id,
        start_time: item.start_time,
        end_time: item.end_time,
        scheduled_change: item.scheduled_change || item.scheduledChange || null,
      })),
      repairCount: repairs.length,
      mappedFacilities: nextFacilities.map((item) => ({
        id: item.id,
        name: item.name,
        sportType: item.sportType,
        status: item.status,
        startTime: item.startTime,
        endTime: item.endTime,
        availableSlotCount: item.availableSlots.length,
      })),
    });
  }

  if (options.includeHidden) {
    return nonDeletedFacilities;
  }

  return nonDeletedFacilities.filter((item) => isFacilityVisible(item.status));
}

export async function getFacilityById(id, selectedDate = getTodayDate()) {
  const [facility, repairs] = await Promise.all([
    getDocById("facility", id),
    getCollectionDocs("repair", [where("facility_id", "==", id)]),
  ]);
  if (!facility) {
    return null;
  }

  const virtualFacility = getVirtualFacilityDoc(facility);
  const facilityWithEffectiveStatus = {
    ...virtualFacility,
    status: getEffectiveFacilityStatus(virtualFacility, repairs),
  };
  const slots = await getTimeSlotsForFacilityDate(facilityWithEffectiveStatus, selectedDate);
  return mapFacility(facilityWithEffectiveStatus, slots);
}

export async function getTimeSlotsByFacility(facilityId, selectedDate = getTodayDate()) {
  const facility = await getDocById("facility", facilityId);
  if (!facility) {
    return [];
  }

  const slots = await getTimeSlotsForFacilityDate(getVirtualFacilityDoc(facility), selectedDate);
  return slots.map((slot) => ({
    ...slot,
    timeLabel: formatHourRange(slot.start_time, slot.end_time),
  }));
}

export async function getBookings(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const allRequests = await getCollectionDocs("request");
  const relevantRequests = allRequests.filter((item) => {
    const participantIds = normalizeParticipantIds(item);
    return item.member_id === resolvedActor.id || participantIds.includes(resolvedActor.id);
  });

  const decoratedItems = await decorateRequests(relevantRequests, resolvedActor.id);
  return decoratedItems.map(applyMemberBookingDisplay);
}

export async function getBookingById(id, actor) {
  const resolvedActor = await resolveActor(actor);
  const request = await getRequestByIdOrThrow(id);
  const participantIds = normalizeParticipantIds(request);

  if (
    resolvedActor?.role === "Member" &&
    request.member_id !== resolvedActor.id &&
    !participantIds.includes(resolvedActor.id)
  ) {
    throw createAppError("permission-denied");
  }

  const [booking] = await decorateRequests([request], resolvedActor?.id || "");
  return booking ? applyMemberBookingDisplay(booking) : null;
}

async function submitBookingRequestDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const facility = await getFacilityById(payload.facility_id, payload.date);
  if (!facility) {
    throw createAppError("not-found");
  }

  if (!isFacilityBookable(facility.status)) {
    throw createAppError("failed-precondition", "This facility is currently unavailable for booking.");
  }

  await validateFacilityBookingInput(facility, payload);

  const participantIds = normalizeParticipantIds(payload);
  if (participantIds.length > Number(payload.attendent || 0) - 1) {
    throw createAppError("invalid-argument", "Invited friends cannot exceed the attendee count minus yourself.");
  }
  await validateInvitedPartners(resolvedActor, participantIds);

  const selectedHours = buildHourRange(payload.start_time, payload.end_time);
  const persistedFacility = await getDocById("facility", payload.facility_id);
  const slots = persistedFacility
    ? await getTimeSlotsForFacilityDate(persistedFacility, payload.date, { persist: true })
    : [];
  const selectedSlots = slots.filter((slot) => selectedHours.includes(toHourNumber(slot.start_time)));

  if (selectedSlots.length !== selectedHours.length) {
    throw createAppError("resource-exhausted");
  }

  if (selectedSlots.some((slot) => String(slot.status || "").toLowerCase() !== "open")) {
    throw createAppError("resource-exhausted");
  }

  await validateParticipantConflicts(resolvedActor, payload, selectedHours);

  const requestRef = doc(getCollectionRef("request"));
  const involvedIds = new Set([resolvedActor.id, ...participantIds]);

  await runDbTransaction(async (transaction) => {
    const requestQuery = buildCollectionQuery("request", [where("date", "==", payload.date)]);
    const requestSnapshots = await transaction.get(requestQuery);
    const requestsForDate = requestSnapshots.docs.map(buildDocSnapshot).filter(Boolean);

    if (hasParticipantConflict(requestsForDate, involvedIds, selectedHours)) {
      throw createAppError(
        "failed-precondition",
        "You or one of the invited friends already has an active booking in this time period.",
      );
    }

    for (const slot of selectedSlots) {
      const slotRef = getDocumentRef("time_slot", slot.id);
      const slotSnapshot = await transaction.get(slotRef);
      if (!slotSnapshot.exists() || String(slotSnapshot.data().status || "").toLowerCase() !== "open") {
        throw createAppError("resource-exhausted");
      }
    }

    transaction.set(requestRef, {
      member_id: resolvedActor.id,
      facility_id: payload.facility_id,
      staff_id: facility.staffId || "",
      attendent: Number(payload.attendent || 1),
      activity_description: payload.activity_description.trim(),
      status: "pending",
      staff_response: "",
      date: payload.date,
      start_time: toHourString(payload.start_time),
      end_time: toHourString(payload.end_time),
      participant_ids: participantIds,
      created_at: serverTimestamp(),
      completed_at: "",
    });

    selectedSlots.forEach((slot) => {
      transaction.update(getDocumentRef("time_slot", slot.id), {
        status: "locked",
        request_id: requestRef.id,
        updated_at: serverTimestamp(),
      });
    });
  });

  await createNotifications(
    [resolvedActor.id, ...participantIds],
    `Your booking request for ${facility.name} on ${payload.date} ${formatHourRange(payload.start_time, payload.end_time)} has been submitted.`,
    "facility_request",
    "pending",
    requestRef.id,
  );
  await createNotifications(
    [facility.staffId],
    `A new booking request for ${facility.name} is waiting for approval.`,
    "facility_request",
    "pending",
    requestRef.id,
  );

  return { success: true, request_id: requestRef.id };
}

export async function submitBookingRequest(payload, actor) {
  return callSubmitAction(
    "submitBookingRequest",
    {
      facility_id: payload.facility_id,
      date: toStoredDateString(payload.date),
      start_time: payload.start_time,
      end_time: payload.end_time,
      attendent: Number(payload.attendent || 0),
      activity_description: payload.activity_description,
      user_id_list: [...new Set([...(payload.user_id_list || []), ...(payload.participant_ids || [])].filter(Boolean))],
    },
  );
}

async function modifyPendingBookingDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const requestId = payload.request_id || payload.id;
  const existingRequest = await getRequestByIdOrThrow(requestId);
  if (existingRequest.member_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  const currentStatus = String(existingRequest.status || "").toLowerCase();
  if (!["pending", "suggested"].includes(currentStatus)) {
    throw createAppError("failed-precondition", "Only pending requests can be modified.");
  }

  const facility = await getFacilityById(existingRequest.facility_id, payload.date);
  if (!facility) {
    throw createAppError("not-found");
  }

  if (!isFacilityBookable(facility.status)) {
    throw createAppError("failed-precondition", "This facility is currently unavailable for booking.");
  }

  const participantIds = normalizeParticipantIds(existingRequest);
  const nextPayload = {
    facility_id: existingRequest.facility_id,
    date: payload.date,
    start_time: payload.start_time,
    end_time: payload.end_time,
    attendent: Number(payload.attendent || 0),
    activity_description: existingRequest.activity_description || "Booking request",
    participant_ids: participantIds,
  };

  await validateFacilityBookingInput(facility, nextPayload);
  if (participantIds.length > Number(nextPayload.attendent || 0) - 1) {
    throw createAppError("invalid-argument", "The updated attendee count must still include all invited friends.");
  }

  const selectedHours = buildHourRange(nextPayload.start_time, nextPayload.end_time);
  const persistedFacility = await getDocById("facility", existingRequest.facility_id);
  if (persistedFacility) {
    await getTimeSlotsForFacilityDate(persistedFacility, nextPayload.date, { persist: true });
  }
  await validateParticipantConflicts(resolvedActor, nextPayload, selectedHours, requestId);

  await runDbTransaction(async (transaction) => {
    const requestRef = getDocumentRef("request", requestId);
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) {
      throw createAppError("not-found");
    }

    const currentRequest = {
      id: requestSnapshot.id,
      ...requestSnapshot.data(),
    };

    if (currentRequest.member_id !== resolvedActor.id) {
      throw createAppError("permission-denied");
    }

    if (!["pending", "suggested"].includes(String(currentRequest.status || "").toLowerCase())) {
      throw createAppError("aborted", "The request status changed. Please refresh and try again.");
    }

    const involvedIds = new Set([resolvedActor.id, ...normalizeParticipantIds(currentRequest)]);
    const requestsForDateSnapshot = await transaction.get(buildCollectionQuery("request", [where("date", "==", nextPayload.date)]));
    const requestsForDate = requestsForDateSnapshot.docs.map(buildDocSnapshot).filter(Boolean);
    if (hasParticipantConflict(requestsForDate, involvedIds, selectedHours, requestId)) {
      throw createAppError(
        "failed-precondition",
        "You or one of the invited friends already has an active booking in this time period.",
      );
    }

    const slotSnapshots = await transaction.get(buildCollectionQuery("time_slot", [where("facility_id", "==", currentRequest.facility_id)]));
    const allSlots = slotSnapshots.docs.map(buildDocSnapshot).filter(Boolean);
    const slotsForTargetDate = allSlots.filter((slot) => slot.date === nextPayload.date);
    const slotsByHour = new Map(slotsForTargetDate.map((slot) => [toHourNumber(slot.start_time), slot]));
    const currentLockedSlots = allSlots.filter((slot) => slot.request_id === requestId);

    selectedHours.forEach((hour) => {
      const slot = slotsByHour.get(hour);
      if (!slot) {
        throw createAppError("resource-exhausted");
      }

      const slotStatus = String(slot.status || "").toLowerCase();
      if (slotStatus !== "open" && slot.request_id !== requestId) {
        throw createAppError("resource-exhausted");
      }
    });

    const nextSlotIds = new Set(selectedHours.map((hour) => slotsByHour.get(hour)?.id).filter(Boolean));

    currentLockedSlots.forEach((slot) => {
      if (nextSlotIds.has(slot.id)) {
        return;
      }

      transaction.update(getDocumentRef("time_slot", slot.id), {
        status: "open",
        request_id: "",
        updated_at: serverTimestamp(),
      });
    });

    selectedHours.forEach((hour) => {
      const slot = slotsByHour.get(hour);
      transaction.update(getDocumentRef("time_slot", slot.id), {
        status: "locked",
        request_id: requestId,
        updated_at: serverTimestamp(),
      });
    });

    transaction.update(requestRef, {
      date: nextPayload.date,
      start_time: toHourString(nextPayload.start_time),
      end_time: toHourString(nextPayload.end_time),
      attendent: Number(nextPayload.attendent || 1),
      status: "pending",
      staff_response: "",
      completed_at: "",
      updated_at: serverTimestamp(),
    });
  });

  await createNotifications(
    [existingRequest.member_id, existingRequest.staff_id, ...participantIds],
    `The booking request for ${nextPayload.date} ${formatHourRange(nextPayload.start_time, nextPayload.end_time)} was updated and sent back for approval.`,
    "facility_request",
    "pending",
    requestId,
  );

  return { success: true };
}

export async function modifyPendingBooking(payload, actor) {
  return callSubmitAction(
    "modifyPendingBooking",
    {
      request_id: payload.request_id || payload.id,
      date: payload.date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      attendent: Number(payload.attendent || 0),
    },
  );
}

export async function getStaffRequests(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const allRequests = await getCollectionDocs("request");
  const relevantRequests = allRequests.filter((item) => (resolvedActor.role === "Admin" ? true : item.staff_id === resolvedActor.id));

  return decorateRequests(relevantRequests, resolvedActor.id);
}

export async function getStaffManagedFacilities(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const allFacilities = await getCollectionDocs("facility");
  const relevantFacilities = allFacilities.filter((item) => (resolvedActor.role === "Admin" ? true : item.staff_id === resolvedActor.id));

  return [...relevantFacilities]
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")))
    .map((item) => ({
      id: item.id,
      name: item.name || item.id,
      sport_type: item.sport_type || "",
      staff_id: item.staff_id || "",
      status: item.status || "",
    }));
}

export async function getStaffRequestConflictSummary(requestOrId, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const request =
    typeof requestOrId === "object" && requestOrId !== null
      ? requestOrId.raw && typeof requestOrId.raw === "object"
        ? requestOrId.raw
        : requestOrId
      : await getRequestByIdOrThrow(requestOrId);

  if (!request?.id && !request?.facility_id) {
    throw createAppError("not-found");
  }

  if (resolvedActor.role === "Staff" && request.staff_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  const pageStatus = getStaffRequestPageStatus(request.status);

  if (pageStatus === "accepted") {
    return {
      state: "available",
      title: "Facility Available",
      message: "This request has already been approved and is now read-only.",
    };
  }

  if (pageStatus === "rejected") {
    return {
      state: "conflict",
      title: "Request Rejected",
      message: String(request.staff_response || "").trim() || "This request has already been rejected and can no longer be processed.",
    };
  }

  if (pageStatus === "alternative suggested") {
    return {
      state: "conflict",
      title: "Alternative Suggested",
      message:
        String(request.staff_response || "").trim() ||
        "An alternative has already been suggested for this request, so it is now read-only.",
    };
  }

  if (pageStatus === "cancelled") {
    return {
      state: "conflict",
      title: "Request Cancelled",
      message: "This request is no longer active because the member cancelled it after approval.",
    };
  }

  const requiredHours = buildHourRange(request.start_time, request.end_time);
  const facilitySlots = await getCollectionDocs("time_slot", [where("facility_id", "==", request.facility_id)]);
  const slotsForDate = facilitySlots.filter((slot) => slot.date === request.date);
  const slotsByHour = new Map(slotsForDate.map((slot) => [toHourNumber(slot.start_time), slot]));
  const selectedSlots = requiredHours.map((hour) => slotsByHour.get(hour)).filter(Boolean);

  if (selectedSlots.length !== requiredHours.length) {
    return {
      state: "conflict",
      title: "Time Conflict Detected",
      message: "One or more required time slots are missing. Please suggest an alternative or reject this request.",
    };
  }

  const hasConflict = selectedSlots.some((slot) => String(slot.request_id || "") !== String(request.id || ""));
  if (hasConflict) {
    return {
      state: "conflict",
      title: "Time Conflict Detected",
      message: "Another booking already exists for this slot. Please suggest an alternative or reject.",
    };
  }

  return {
    state: "available",
    title: "Facility Available",
    message: "No conflicting bookings for this time slot.",
  };
}

export async function getRequestFeedbackTemplate(status) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "rejected") {
    return "Rejected due to suitability or availability.";
  }
  if (normalizedStatus === "suggested") {
    return "Please consider a nearby alternative slot.";
  }
  return "";
}

export async function getStaffCheckIns(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const allRequests = await getCollectionDocs("request");
  const checkInRequests = allRequests.filter((item) => {
    const status = normalizeBookingStatusValue(item.status);
    const allowed = ["accepted", "in_progress", "in progress", "no_show", "no show"].includes(status);
    if (!allowed) {
      return false;
    }
    return resolvedActor.role === "Admin" ? true : item.staff_id === resolvedActor.id;
  });

  return decorateRequests(checkInRequests, resolvedActor.id);
}

export async function subscribeToStaffCheckIns(actor, onNext, onError) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const constraints = resolvedActor.role === "Admin" ? [] : [where("staff_id", "==", resolvedActor.id)];

  return subscribeToCollection(
    "request",
    constraints,
    async (items) => {
      try {
        const checkInRequests = items.filter((item) => {
          const status = normalizeBookingStatusValue(item.status);
          return ["accepted", "in_progress", "in progress", "no_show", "no show"].includes(status);
        });
        const decorated = await decorateRequests(checkInRequests, resolvedActor.id);
        onNext?.(decorated);
      } catch (mappingError) {
        onError?.(mappingError);
      }
    },
    onError,
  );
}

async function checkInBookingDirect(idOrPayload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const id = typeof idOrPayload === "object" && idOrPayload !== null ? idOrPayload.request_id || idOrPayload.id : idOrPayload;
  const request = await getRequestByIdOrThrow(id);
  if (resolvedActor.role === "Staff" && request.staff_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }
  if (String(request.status || "").toLowerCase() !== "accepted") {
    throw createAppError("failed-precondition", "Only accepted bookings can be checked in.");
  }

    if (!isBookingCheckInOpen(request)) {
      throw createAppError(
        "failed-precondition",
        "Check-in is only available from 15 minutes before the booking starts until the booking starts.",
      );
    }

  await updateCollectionDoc("request", id, {
    status: "in_progress",
    updated_at: serverTimestamp(),
  });

  await createNotifications(
    [request.member_id, ...normalizeParticipantIds(request)],
    `Your booking at ${request.date} ${formatHourRange(request.start_time, request.end_time)} has been checked in.`,
    "facility_request",
    "in_progress",
    id,
  );

  return { success: true };
}

export async function checkInBooking(idOrPayload, actor) {
  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? { request_id: idOrPayload.request_id || idOrPayload.id }
      : { request_id: idOrPayload };

  return callSubmitAction("checkInBooking", payload);
}

export async function withdrawPendingBooking(idOrPayload, actor) {
  void actor;

  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? { request_id: idOrPayload.request_id || idOrPayload.id }
      : { request_id: idOrPayload };

  return callSubmitAction("withdrawPendingBooking", payload);
}

async function cancelConfirmedBookingDirect(idOrPayload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const id = typeof idOrPayload === "object" && idOrPayload !== null ? idOrPayload.request_id || idOrPayload.id : idOrPayload;
  const request = await getRequestByIdOrThrow(id);
  if (request.member_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  if (normalizeBookingStatusValue(request.status) !== "accepted") {
    throw createAppError("failed-precondition", "Only accepted bookings can be cancelled.");
  }

  if (!isBookingCancellationAllowed(request)) {
    throw createAppError("deadline-exceeded");
  }

  await updateCollectionDoc("request", id, {
    status: "cancelled",
    completed_at: new Date().toISOString(),
    updated_at: serverTimestamp(),
  });
  await releaseRequestSlots(id);

  const member = await getDocById("member", resolvedActor.id);
  if (member) {
    await updateCollectionDoc("member", resolvedActor.id, {
      cancel_times: Number(member.cancel_times || 0) + 1,
    });
  }

  await createNotifications(
    [request.member_id, request.staff_id, ...normalizeParticipantIds(request)],
    `The confirmed booking for ${request.date} ${formatHourRange(request.start_time, request.end_time)} has been cancelled.`,
    "facility_request",
    "cancelled",
    id,
  );

  return { success: true };
}

export async function cancelConfirmedBooking(idOrPayload, actor) {
  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? { request_id: idOrPayload.request_id || idOrPayload.id }
      : { request_id: idOrPayload };

  return callSubmitAction("cancelConfirmedBooking", payload);
}

async function processBookingApprovalDirect(idOrPayload, nextStatus = "accepted", staffResponse = "", actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? idOrPayload
      : { request_id: idOrPayload, status: nextStatus, staff_response: staffResponse };
  const id = payload.request_id || payload.id;
  const statusSource = Array.isArray(payload.status) ? payload.status[0] : payload.status;
  const responseText = String(payload.staff_response || payload.staffResponse || "").trim();
  const normalizedStatus = String(statusSource || "").toLowerCase();
  if (!["accepted", "rejected", "suggested"].includes(normalizedStatus)) {
    throw createAppError("invalid-argument");
  }

  if (["rejected", "suggested"].includes(normalizedStatus) && !responseText) {
    throw createAppError("invalid-argument", "Please enter a response for rejected or suggested requests.");
  }

  let request = null;
  await runDbTransaction(async (transaction) => {
    const requestRef = getDocumentRef("request", id);
    const requestSnapshot = await transaction.get(requestRef);

    if (!requestSnapshot.exists()) {
      throw createAppError("not-found");
    }

    request = {
      id: requestSnapshot.id,
      ...requestSnapshot.data(),
    };

    if (resolvedActor.role === "Staff" && request.staff_id !== resolvedActor.id) {
      throw createAppError("permission-denied");
    }

    if (String(request.status || "").toLowerCase() !== "pending") {
      throw createAppError("aborted", "Current request status has changed. Please refresh.");
    }

    transaction.update(requestRef, {
      status: normalizedStatus,
      staff_response: responseText,
      completed_at: normalizedStatus === "accepted" ? "" : new Date().toISOString(),
      updated_at: serverTimestamp(),
    });

    if (["rejected", "suggested"].includes(normalizedStatus)) {
      const slotQuery = buildCollectionQuery("time_slot", [where("request_id", "==", id)]);
      const slotSnapshots = await transaction.get(slotQuery);
      slotSnapshots.forEach((slotDoc) => {
        transaction.update(slotDoc.ref, {
          status: "open",
          request_id: "",
          updated_at: serverTimestamp(),
        });
      });
    }
  });

  const messageByStatus = {
    accepted: "Your booking request has been approved.",
    rejected: `Your booking request has been rejected. ${responseText}`.trim(),
    suggested: `A change was suggested for your booking request. ${responseText}`.trim(),
  };

  await createNotifications(
    [request.member_id, ...normalizeParticipantIds(request)],
    messageByStatus[normalizedStatus],
    "facility_request",
    normalizedStatus,
    id,
  );

  return { success: true };
}

export async function processBookingApproval(idOrPayload, nextStatus = "accepted", staffResponse = "", actor) {
  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? idOrPayload
      : { request_id: idOrPayload, status: nextStatus, staff_response: staffResponse };

  return callSubmitAction(
    "processBookingApproval",
    {
      request_id: payload.request_id || payload.id,
      status: Array.isArray(payload.status) ? payload.status : [payload.status || nextStatus].filter(Boolean),
      staff_response: payload.staff_response || payload.staffResponse || staffResponse || "",
    },
  );
}

export const approveBooking = processBookingApproval;
