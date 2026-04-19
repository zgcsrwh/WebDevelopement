import { doc, getCollectionRef, runDbTransaction, serverTimestamp } from "./firestoreService";
import {
  assertRole,
  BOOKING_ACTIVE_STATUSES,
  buildDateTime,
  buildHourRange,
  createNotifications,
  formatHourRange,
  getEffectiveBookingStatus,
  getEffectiveFacilityStatus,
  getCurrentActor,
  getFacilityLookup,
  getFriendRecord,
  getMemberLookup,
  getStaffLookup,
  getTimeSlotsForFacilityDate,
  isFacilityBookable,
  isFacilityVisible,
  overlaps,
  releaseRequestSlots,
  toHourNumber,
  toHourString,
} from "./centreService";
import {
  buildCollectionQuery,
  buildDocSnapshot,
  getCollectionDocs,
  getDocById,
  getDocumentRef,
  normalizeTimestamp,
  orderBy,
  updateCollectionDoc,
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { displayStatus } from "../utils/presentation";

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getMaxBookingDate() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

function normalizeParticipantIds(item = {}) {
  return [...new Set([...(item.participant_ids || []), ...(item.user_id_list || [])].filter(Boolean))];
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
    sportType: item.sportType,
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
  const effectiveStatus = getEffectiveBookingStatus(item);

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
    statusLabel: displayStatus(effectiveStatus),
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
    throw createAppError("invalid-argument", "Bookings must be made from today up to 7 days in advance.");
  }

  const startTime = toHourNumber(payload.start_time);
  const endTime = toHourNumber(payload.end_time);
  const duration = endTime - startTime;

  if (startTime < facility.startTime || endTime > facility.endTime || duration < 1 || duration > 4) {
    throw createAppError("invalid-argument", "Bookings must fit within facility hours and last between 1 and 4 hours.");
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

async function validateParticipantConflicts(actor, payload, selectedHours) {
  const allRequestsForDate = await getCollectionDocs("request", [where("date", "==", payload.date)]);
  const involvedIds = new Set([actor.id, ...normalizeParticipantIds(payload)]);

  if (hasParticipantConflict(allRequestsForDate, involvedIds, selectedHours)) {
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
  const nextFacilities = [];

  for (const item of facilityDocs) {
    const facilityWithEffectiveStatus = {
      ...item,
      status: getEffectiveFacilityStatus(
        item,
        repairs.filter((repair) => repair.facility_id === item.id),
      ),
    };

    if (!options.includeHidden && !isFacilityVisible(facilityWithEffectiveStatus.status)) {
      continue;
    }

    const slots = await getTimeSlotsForFacilityDate(facilityWithEffectiveStatus, selectedDate);
    nextFacilities.push(mapFacility(facilityWithEffectiveStatus, slots));
  }

  return nextFacilities;
}

export async function getFacilityById(id, selectedDate = getTodayDate()) {
  const [facility, repairs] = await Promise.all([
    getDocById("facility", id),
    getCollectionDocs("repair", [where("facility_id", "==", id)]),
  ]);
  if (!facility) {
    return null;
  }

  const facilityWithEffectiveStatus = {
    ...facility,
    status: getEffectiveFacilityStatus(facility, repairs),
  };
  const slots = await getTimeSlotsForFacilityDate(facilityWithEffectiveStatus, selectedDate);
  return mapFacility(facilityWithEffectiveStatus, slots);
}

export async function getTimeSlotsByFacility(facilityId, selectedDate = getTodayDate()) {
  const facility = await getDocById("facility", facilityId);
  if (!facility) {
    return [];
  }

  const slots = await getTimeSlotsForFacilityDate(facility, selectedDate);
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

  return decorateRequests(relevantRequests, resolvedActor.id);
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
  return booking || null;
}

export async function submitBookingRequest(payload, actor) {
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

export async function getStaffRequests(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const allRequests = await getCollectionDocs("request");
  const pendingRequests = allRequests.filter((item) => {
    const isPending = String(item.status || "").toLowerCase() === "pending";
    if (!isPending) {
      return false;
    }
    return resolvedActor.role === "Admin" ? true : item.staff_id === resolvedActor.id;
  });

  return decorateRequests(pendingRequests, resolvedActor.id);
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
    const status = getEffectiveBookingStatus(item);
    const allowed = ["accepted", "in_progress"].includes(status);
    if (!allowed) {
      return false;
    }
    return resolvedActor.role === "Admin" ? true : item.staff_id === resolvedActor.id;
  });

  return decorateRequests(checkInRequests, resolvedActor.id);
}

export async function checkInBooking(id, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const request = await getRequestByIdOrThrow(id);
  if (resolvedActor.role === "Staff" && request.staff_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }
  if (String(request.status || "").toLowerCase() !== "accepted") {
    throw createAppError("failed-precondition", "Only accepted bookings can be checked in.");
  }

  const now = new Date();
  const bookingStart = buildDateTime(request.date, request.start_time);
  const bookingEnd = buildDateTime(request.date, request.end_time);
  const earliestCheckIn = new Date(bookingStart.getTime() - 30 * 60 * 1000);
  if (now < earliestCheckIn || now > bookingEnd) {
    throw createAppError(
      "failed-precondition",
      "Check-in is only available from 30 minutes before the booking starts until the booking ends.",
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

export async function withdrawPendingBooking(id, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const request = await getRequestByIdOrThrow(id);
  if (request.member_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  const status = String(request.status || "").toLowerCase();
  if (!["pending", "suggested"].includes(status)) {
    throw createAppError("failed-precondition", "Only pending requests can be withdrawn.");
  }

  await updateCollectionDoc("request", id, {
    status: "cancelled",
    completed_at: new Date().toISOString(),
    updated_at: serverTimestamp(),
  });
  await releaseRequestSlots(id);

  await createNotifications(
    [resolvedActor.id, request.staff_id, ...normalizeParticipantIds(request)],
    `The pending booking request for ${request.date} ${formatHourRange(request.start_time, request.end_time)} was withdrawn.`,
    "facility_request",
    "cancelled",
    id,
  );

  return { success: true };
}

export async function cancelConfirmedBooking(id, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const request = await getRequestByIdOrThrow(id);
  if (request.member_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  if (String(request.status || "").toLowerCase() !== "accepted") {
    throw createAppError("failed-precondition", "Only accepted bookings can be cancelled.");
  }

  const bookingStart = buildDateTime(request.date, request.start_time);
  const cancellationDeadline = new Date(bookingStart.getTime() - 2 * 60 * 60 * 1000);
  if (cancellationDeadline <= new Date()) {
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

export async function approveBooking(id, nextStatus = "accepted", staffResponse = "", actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const normalizedStatus = String(nextStatus || "").toLowerCase();
  if (!["accepted", "rejected", "suggested"].includes(normalizedStatus)) {
    throw createAppError("invalid-argument");
  }

  if (["rejected", "suggested"].includes(normalizedStatus) && !staffResponse.trim()) {
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
      throw createAppError("already-processed");
    }

    transaction.update(requestRef, {
      status: normalizedStatus,
      staff_response: staffResponse.trim(),
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
    rejected: `Your booking request has been rejected. ${staffResponse.trim()}`.trim(),
    suggested: `A change was suggested for your booking request. ${staffResponse.trim()}`.trim(),
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
