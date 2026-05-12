// Booking service prepares booking, facility, member, and time slot data for the pages.
import { doc, getCollectionRef, runDbTransaction, serverTimestamp } from "./firestoreService";
import {
  assertRole,
  BOOKING_ACTIVE_STATUSES,
  buildDateTime,
  buildHourRange,
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
import { getLocalDateKey, getMaxLocalBookingDate } from "../utils/bookingSlotRules";
import { callSubmitAction } from "./callableService";

// Get today's local date for booking forms and filters.
function getTodayDate() {
  return getLocalDateKey();
}

// Get the last date that members can choose for a new booking.
function getMaxBookingDate() {
  return getMaxLocalBookingDate(7);
}

// Build full hour labels for time filter options.
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

// Sort time slot labels from early to late.
// Member pages and staff pages both use this order.
// Dropdowns look more natural when morning times come first.
function sortTimeSlots(slots = []) {
  return [...slots].sort((left, right) => {
    const leftStart = Number(String(left).slice(0, 2));
    const rightStart = Number(String(right).slice(0, 2));
    return leftStart - rightStart;
  });
}

// Sort time slot records by their start hour.
// Pages use this after loading slots for one facility and date.
function sortTimeSlotDocs(slots = []) {
  return [...slots].sort((left, right) => toHourNumber(left.start_time) - toHourNumber(right.start_time));
}

// Load the time slot records for one facility and one date.
// Booking pages and staff pages use these slots to show available times.
async function getStoredTimeSlotsForFacilityDate(facilityId, selectedDate = getTodayDate()) {
  const safeDate = toStoredDateString(selectedDate).slice(0, 10);
  const slots = await getCollectionDocs("time_slot", [
    where("facility_id", "==", facilityId),
    where("date", "==", safeDate),
  ]);

  return sortTimeSlotDocs(slots);
}

// Prepare text that appears in labels or filter searches.
function normalizeText(value = "") {
  return String(value || "").trim();
}

// Make a simple compare key for names and labels.
function normalizeKey(value = "") {
  return normalizeText(value).toLowerCase();
}

// Give the booking date limits used by the facility booking page.
export async function getFacilityDateBounds() {
  return {
    minDate: getTodayDate(),
    maxDate: getMaxBookingDate(),
    defaultDate: getTodayDate(),
  };
}

// Load the sport type options shown in facility filters.
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

// Load all facility names for staff and member filter dropdowns.
export async function getAllFacilityFilterOptions() {
  const facilityDocs = await getCollectionDocs("facility", [orderBy("name", "asc")]);

  return facilityDocs
    .map((item) => ({
      id: item.id,
      name: normalizeText(item.name) || item.id,
    }))
    .filter((item) => item.id && item.name);
}

// Build time filter options for the selected sport type.
// The options come from visible facility opening hours.
export async function getFacilityTimeFilterOptions(selectedType = "All") {
  const [facilityDocs, repairs] = await Promise.all([
    getCollectionDocs("facility", [orderBy("sport_type", "asc")]),
    getCollectionDocs("repair"),
  ]);

  // Build the list that the user can see.
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

// Check whether a member can cancel an accepted booking.
// The member page uses this to decide whether to show the cancel action.
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

// Check whether staff can confirm arrival for a booking right now.
// Check in opens shortly before the session starts.
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

// Get the current user for booking actions.
// Pages can also pass a user in when they already have one.
async function resolveActor(actor) {
  return actor || getCurrentActor();
}

// Collect invited friend ids for booking pages and staff detail panels.
function normalizeParticipantIds(item = {}) {
  return [...new Set([...(item.participant_ids || []), ...(item.user_id_list || [])].filter(Boolean))];
}

const MISSING_MEMBER_LABEL = "Member no longer available";

// Check whether a member account can still be shown as a real person.
function isActiveMember(member) {
  return Boolean(member) && String(member.status || "").toLowerCase() === "active";
}

// Choose the member name shown by the current page.
// Staff pages use real names, while social member pages can use nicknames.
function getMemberDisplayName(member, fallback = MISSING_MEMBER_LABEL, options = {}) {
  if (!isActiveMember(member)) {
    return fallback;
  }

  if (options.memberNameMode === "real") {
    return member.name || fallback;
  }

  return member.profile?.nickname || member.name || fallback;
}

// Prepare booking status text before pages compare request states.
function normalizeBookingStatusValue(value = "") {
  const rawStatus = String(value || "").trim().toLowerCase();

  if (!rawStatus) {
    return "";
  }

  return rawStatus.replace(/[_-]+/g, " ");
}

const MEMBER_BOOKING_VISIBLE_STATUSES = new Set([
  "pending",
  "rejected",
  "alternative suggested",
  "upcoming",
  "completed",
  "cancelled",
  "no_show",
]);

// Build the booking status shown on member booking pages.
// Members see accepted bookings as upcoming in their booking list.
function normalizeMemberBookingPageStatus(value = "") {
  const normalizedStatus = normalizeBookingStatusValue(value);
  const compactStatus = normalizedStatus.replace(/\s+/g, "");

  if (compactStatus === "noshow") {
    return "no_show";
  }

  if (normalizedStatus === "suggested" || normalizedStatus === "suggested alternative") {
    return "alternative suggested";
  }

  if (normalizedStatus === "complete") {
    return "completed";
  }

  if (normalizedStatus === "accepted") {
    return "upcoming";
  }

  return normalizedStatus;
}

// Add the member booking display status to one mapped booking.
function applyMemberBookingDisplay(item) {
  const displayStatus = normalizeMemberBookingPageStatus(getMemberBookingDisplayStatus(item.raw || item));
  return {
    ...item,
    status: displayStatus,
    statusLabel: displayStatus || item.statusLabel || "",
  };
}

// Decide whether a booking should appear in the member booking list.
// Invited friends do not see pending bookings there yet.
function isMemberBookingVisibleToActor(item = {}) {
  const status = normalizeMemberBookingPageStatus(item.status || item.raw?.status);

  if (!MEMBER_BOOKING_VISIBLE_STATUSES.has(status)) {
    return false;
  }

  if (item.isParticipant && !item.isOwner && status === "pending") {
    return false;
  }

  return true;
}

// Build the request status used on staff request pages.
// Staff see suggested requests as alternative suggested in their workflow.
export function getStaffRequestPageStatus(value = "") {
  const normalizedStatus = normalizeBookingStatusValue(value);
  return normalizedStatus === "suggested" ? "alternative suggested" : normalizedStatus;
}

// Work out the status shown on the staff check in page.
// Staff see accepted bookings turn into no show after the start time passes.
// The check in page uses this status for its cards and buttons.
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
    return now.getTime() < bookingStartTime.getTime() + 15 * 60 * 1000 ? "accepted" : "no_show";
  }
  if (rawStatus === "no show" || rawStatus === "no_show") {
    return "no_show";
  }

  return rawStatus || "";
}

// Sort booking records by activity date and start time.
// Newer bookings appear first in member and staff lists.
function sortBookings(items) {
  return [...items].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }
    return toHourNumber(right.start_time) - toHourNumber(left.start_time);
  });
}

// Make the facility object used by booking pages.
// It also separates open and locked slot labels for the selected date.
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

// Build the booking object used by booking cards and detail panels.
// It adds facility names, staff names, member names, and readable time text.
// Staff pages ask for real member names, while social member pages can use display names.
function mapBooking(item, memberLookup, facilityLookup, staffLookup, actorId = "", options = {}) {
  const facility = facilityLookup.get(item.facility_id);
  const member = memberLookup.get(item.member_id);
  const staff = staffLookup.get(item.staff_id);
  const participantIds = normalizeParticipantIds(item);
  const participantNames = participantIds
    .map((participantId) => getMemberDisplayName(memberLookup.get(participantId), MISSING_MEMBER_LABEL, options))
    .filter(Boolean);
  const effectiveStatus = normalizeBookingStatusValue(getEffectiveBookingStatus(item));

  return {
    id: item.id,
    facilityId: item.facility_id,
    facilityName: facility?.name || item.facility_id || "Facility",
    facilityLabel: facility ? `${facility.name} (${facility.sportType})` : item.facility_id,
    sportType: facility?.sportType || "",
    memberId: item.member_id || "",
    memberName: getMemberDisplayName(member, MISSING_MEMBER_LABEL, options),
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

// Load the name lists used to fill booking records.
// Booking cards use these lists to show member, facility, and staff names.
async function getLookups() {
  const [memberLookup, facilityLookup, staffLookup] = await Promise.all([
    getMemberLookup(),
    getFacilityLookup(),
    getStaffLookup(),
  ]);
  return { memberLookup, facilityLookup, staffLookup };
}

// Load one booking request before a page action uses it.
// Staff actions use this before checking permission or slot state.
async function getRequestByIdOrThrow(requestId) {
  const request = await getDocById("request", requestId);
  if (!request) {
    throw createAppError("not-found");
  }
  return request;
}

// Check the main fields for a facility booking form.
// It makes sure the date, time, activity text, and attendee count are valid.
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

// Check that invited friends are allowed for this member booking.
// Only accepted and active friends can be submitted as participants.
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

// Check whether the applicant or any invited friend already has a booking then.
// This helps the form stop overlapping accepted or pending bookings.
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

// Run the participant conflict check for one booking date.
// It loads requests on that date and compares all involved member ids.
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

// Add page friendly fields to booking request records.
// Member pages, staff request pages, and check in pages all use this mapper.
// Options decide whether the page should show real names or social display names.
async function decorateRequests(items, actorId = "", options = {}) {
  const { memberLookup, facilityLookup, staffLookup } = await getLookups();
  return sortBookings(items).map((item) => mapBooking(item, memberLookup, facilityLookup, staffLookup, actorId, options));
}

// Load facilities for the member booking pages and staff suggestion panel.
// The result includes the display status and available time slots for the selected date.
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

  if (options.includeHidden) {
    return nonDeletedFacilities;
  }

  return nonDeletedFacilities.filter((item) => isFacilityVisible(item.status));
}

// Load one facility for the booking detail page.
// The returned facility includes its status and slot labels for the selected date.
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
  const slots = await getStoredTimeSlotsForFacilityDate(id, selectedDate);
  return mapFacility(facilityWithEffectiveStatus, slots);
}

// Load time slots for one facility and date.
// The booking form and staff suggestion panel use the returned time labels.
export async function getTimeSlotsByFacility(facilityId, selectedDate = getTodayDate()) {
  const facility = await getDocById("facility", facilityId);
  if (!facility) {
    return [];
  }

  const slots = await getStoredTimeSlotsForFacilityDate(facility.id, selectedDate);
  return slots.map((slot) => ({
    ...slot,
    timeLabel: formatHourRange(slot.start_time, slot.end_time),
  }));
}

// Load bookings shown on the member My Bookings page.
// The list includes owned bookings and accepted invited bookings when they should be visible.
export async function getBookings(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const allRequests = await getCollectionDocs("request");
  const relevantRequests = allRequests.filter((item) => {
    const participantIds = normalizeParticipantIds(item);
    return item.member_id === resolvedActor.id || participantIds.includes(resolvedActor.id);
  });

  const decoratedItems = await decorateRequests(relevantRequests, resolvedActor.id);
  return decoratedItems.map(applyMemberBookingDisplay).filter(isMemberBookingVisibleToActor);
}

// Load one booking for a member detail page.
// Owners and visible invited participants can open the booking.
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
  if (!booking) {
    return null;
  }

  const displayBooking = applyMemberBookingDisplay(booking);
  if (resolvedActor?.role === "Member" && !isMemberBookingVisibleToActor(displayBooking)) {
    throw createAppError("permission-denied");
  }

  return displayBooking;
}

// Create a new booking request with the member booking form data.
// It checks the facility, invited friends, time slots, and participant conflicts.
async function submitBookingRequestDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  // The selected facility must still be bookable on the chosen date.
  const facility = await getFacilityById(payload.facility_id, payload.date);
  if (!facility) {
    throw createAppError("not-found");
  }

  if (!isFacilityBookable(facility.status)) {
    throw createAppError("failed-precondition", "This facility is currently unavailable for booking.");
  }

  await validateFacilityBookingInput(facility, payload);

  // Invited friends count as attendees, so the form cannot invite too many people.
  const participantIds = normalizeParticipantIds(payload);
  if (participantIds.length > Number(payload.attendent || 0) - 1) {
    throw createAppError("invalid-argument", "Invited friends cannot exceed the attendee count minus yourself.");
  }
  await validateInvitedPartners(resolvedActor, participantIds);

  // The selected slots must all be open before the request can be created.
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

  // The request and slot locks are saved together so the booking stays consistent.
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
      date: toStoredDateString(payload.date).slice(0, 10),
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

  return { success: true, request_id: requestRef.id };
}

// Submit a booking request from the new booking page.
// Members send the booking form and any invited friend ids through this action.
export async function submitBookingRequest(payload, actor) {
  const participantIds = [
    ...new Set([...(payload.user_id_list || []), ...(payload.participant_ids || [])].filter(Boolean)),
  ];
  const callablePayload = {
    facility_id: payload.facility_id,
    date: toStoredDateString(payload.date).slice(0, 10),
    start_time: payload.start_time,
    end_time: payload.end_time,
    attendent: Number(payload.attendent || 0),
    activity_description: payload.activity_description,
  };

  if (participantIds.length) {
    callablePayload.user_id_list = participantIds;
  }

  return callSubmitAction("submitBookingRequest", callablePayload);
}

// Modify a pending booking request from the member booking detail page.
// It keeps the same facility and invited friends, but changes date, time, and attendee count.
async function modifyPendingBookingDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  // Only the owner can edit a request that is still waiting for a decision.
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

  // Build the updated booking request before checking the edit.
  // The activity text and invited friends stay with the original request.
  const participantIds = normalizeParticipantIds(existingRequest);
  const nextPayload = {
    facility_id: existingRequest.facility_id,
    date: toStoredDateString(payload.date).slice(0, 10),
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

  // Save the new request time and move the locked slots in one action.
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

  return { success: true };
}

// Send a pending booking edit from the member booking detail page.
// The page only sends the fields that the member is allowed to change.
export async function modifyPendingBooking(payload, actor) {
  return callSubmitAction(
    "modifyPendingBooking",
    {
      request_id: payload.request_id || payload.id,
      date: toStoredDateString(payload.date).slice(0, 10),
      start_time: payload.start_time,
      end_time: payload.end_time,
      attendent: Number(payload.attendent || 0),
    },
  );
}

// Load booking requests that this staff member can review.
// Staff only see their assigned requests and admins see all requests.
// Requests use member names needed by the staff approval screens.
export async function getStaffRequests(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  // Load requests first, then keep the ones that belong to this staff page.
  // Admin can see all staff work from the same screen.
  const allRequests = await getCollectionDocs("request");
  const relevantRequests = filterRequestsForStaff(allRequests, resolvedActor);

  // Staff pages ask for real member names before the request list renders.
  // Approval and check in pages use these names in cards and details.
  return decorateRequests(relevantRequests, resolvedActor.id, { memberNameMode: "real" });
}

// Keep only requests assigned to this staff member.
// Admin users keep every request because they manage all staff work.
function filterRequestsForStaff(items = [], actor = {}) {
  return items.filter((item) => (actor.role === "Admin" ? true : item.staff_id === actor.id));
}

// Keep bookings that belong on the staff check in page.
// Accepted and finished bookings live here.
// Pending requests stay on the approval page.
function filterCheckInRequestsForStaff(items = [], actor = {}) {
  return filterRequestsForStaff(items, actor).filter((item) => {
    const status = normalizeBookingStatusValue(item.status);
    return ["accepted", "cancelled", "no_show", "no show", "completed"].includes(status);
  });
}

// Listen for live changes used by the staff request page.
// Request changes update status and buttons.
// Facility and member changes refresh names shown for each request.
export async function subscribeToStaffRequests(actor, onNext, onError) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  let latestRequests = [];
  let hasRequestSnapshot = false;
  let active = true;
  let version = 0;

  // Rebuild request data when live updates arrive.
  // Staff should only see the latest request list when several updates happen quickly.
  async function emit() {
    if (!hasRequestSnapshot) {
      return;
    }

    const currentVersion = ++version;

    try {
      // Refresh member and facility names while preparing request records.
      // The staff page receives cards that are ready to display.
      const decorated = await decorateRequests(
        filterRequestsForStaff(latestRequests, resolvedActor),
        resolvedActor.id,
        { memberNameMode: "real" },
      );

      if (active && currentVersion === version) {
        onNext?.(decorated);
      }
    } catch (mappingError) {
      if (active) {
        onError?.(mappingError);
      }
    }
  }

  const requestConstraints = resolvedActor.role === "Admin" ? [] : [where("staff_id", "==", resolvedActor.id)];
  const unsubscribers = [
    // Request changes update status, feedback, and buttons.
    // Staff users only subscribe to their own assigned requests.
    subscribeToCollection(
      "request",
      requestConstraints,
      (items) => {
        latestRequests = items;
        hasRequestSnapshot = true;
        void emit();
      },
      onError,
    ),
    // Facility and member changes update names in the same request data.
    // This matters when names change while staff keep the page open.
    subscribeToCollection("facility", [], () => void emit(), onError),
    subscribeToCollection("member", [], () => void emit(), onError),
  ];

  return () => {
    active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

// Load facilities assigned to the current staff member.
// Admin users get the full list.
// Staff pages use this for filters and facility views.
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

// Check whether a request still owns the slots it needs.
// Staff pages use this before approval.
// The returned message helps staff choose approve, reject, or suggest.
export async function getStaffRequestConflictSummary(requestOrId, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  // Staff pages can pass the selected request card or only its id.
  // The request is prepared before the approval checks run.
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

  // Already processed requests return a read only summary.
  // Staff cannot process them again, so no slot lookup is needed.
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

  // Pending requests must still own every slot in their selected time range.
  // Staff need this result before choosing approve, reject, or suggest.
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

  // A conflict means another request now owns at least one needed slot.
  // This stops staff from approving two bookings for the same time.
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

// Give simple starter text for reject and suggest actions.
// Staff can use it as a base message.
// They can still edit the final response before submitting.
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

// Load bookings used by the staff check in page.
// It keeps accepted and finished bookings for this staff member.
// Returned bookings include the member names shown on the check in page.
export async function getStaffCheckIns(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  // The check in page only needs accepted and finished requests.
  // Pending requests stay on the staff approval page.
  const allRequests = await getCollectionDocs("request");
  const checkInRequests = filterCheckInRequestsForStaff(allRequests, resolvedActor);

  // Prepare real member and participant names before the check in page renders.
  // Staff use the mapped booking list directly in the cards.
  return decorateRequests(checkInRequests, resolvedActor.id, { memberNameMode: "real" });
}

// Listen for live changes used by the staff check in page.
// Booking changes update status and buttons.
// Facility and member changes update the labels shown for each booking.
export async function subscribeToStaffCheckIns(actor, onNext, onError) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const constraints = resolvedActor.role === "Admin" ? [] : [where("staff_id", "==", resolvedActor.id)];
  let latestRequests = [];
  let hasRequestSnapshot = false;
  let active = true;
  let version = 0;

  // Rebuild check in booking data when live updates arrive.
  // Staff should only see the latest booking list when several updates happen quickly.
  async function emit() {
    if (!hasRequestSnapshot) {
      return;
    }

    const currentVersion = ++version;

    try {
      // Map again with current facility and member names.
      // The check in page updates without a manual refresh.
      const decorated = await decorateRequests(
        filterCheckInRequestsForStaff(latestRequests, resolvedActor),
        resolvedActor.id,
        { memberNameMode: "real" },
      );
      if (active && currentVersion === version) {
        onNext?.(decorated);
      }
    } catch (mappingError) {
      if (active) {
        onError?.(mappingError);
      }
    }
  }

  const unsubscribers = [
    // Request changes control status and buttons in the check in list.
    // Staff users only listen to bookings assigned to them.
    subscribeToCollection(
      "request",
      constraints,
      (items) => {
        latestRequests = items;
        hasRequestSnapshot = true;
        void emit();
      },
      onError,
    ),
    // Facility and member changes update the labels shown for each booking.
    // Booking cards keep the newest facility and member names.
    subscribeToCollection("facility", [], () => void emit(), onError),
    subscribeToCollection("member", [], () => void emit(), onError),
  ];

  return () => {
    active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

// Send the check in action when staff confirm a member arrival.
// The check in page sends the selected request id for this action.
export async function checkInBooking(idOrPayload, actor) {
  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? { request_id: idOrPayload.request_id || idOrPayload.id }
      : { request_id: idOrPayload };

  return callSubmitAction("checkInBooking", payload);
}

// Withdraw a booking request that is still pending.
// The member page sends only the request id for this action.
export async function withdrawPendingBooking(idOrPayload, actor) {
  void actor;

  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? { request_id: idOrPayload.request_id || idOrPayload.id }
      : { request_id: idOrPayload };

  return callSubmitAction("withdrawPendingBooking", payload);
}

// Cancel an accepted booking from the member booking detail page.
// It checks ownership, the two hour rule, and then releases the slots.
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

  return { success: true };
}

// Send a confirmed booking cancellation from the member booking detail page.
// The cancel action receives the selected request id.
export async function cancelConfirmedBooking(idOrPayload, actor) {
  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? { request_id: idOrPayload.request_id || idOrPayload.id }
      : { request_id: idOrPayload };

  return callSubmitAction("cancelConfirmedBooking", payload);
}

// Process a staff decision for a pending booking request.
// It supports approve, reject, and suggest from the staff request page.
async function processBookingApprovalDirect(idOrPayload, nextStatus = "accepted", staffResponse = "", actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  // The staff page can pass a request object or a request id with separate fields.
  // The selected decision is prepared before the approval checks run.
  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? idOrPayload
      : { request_id: idOrPayload, status: nextStatus, staff_response: staffResponse };
  const id = payload.request_id || payload.id;
  const statusSource = Array.isArray(payload.status) ? payload.status[0] : payload.status;
  const responseText = String(payload.staff_response || payload.staffResponse || "").trim();
  const normalizedStatus = String(statusSource || "").toLowerCase();

  // Staff can only approve, reject, or suggest from this page.
  // Other statuses are not part of this workflow.
  if (!["accepted", "rejected", "suggested"].includes(normalizedStatus)) {
    throw createAppError("invalid-argument");
  }

  if (["rejected", "suggested"].includes(normalizedStatus) && !responseText) {
    throw createAppError("invalid-argument", "Please enter a response for rejected or suggested requests.");
  }

  let request = null;
  await runDbTransaction(async (transaction) => {
    // Read the request again before changing it.
    // This stops two staff actions from processing the same pending request.
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

    // Rejected and suggested requests release their locked slots.
    // Accepted requests keep their slots because the booking is confirmed.
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

  return { success: true };
}

// Send approve, reject, or suggest actions from the staff request page.
// It prepares the selected request id, next status, and staff response.
export async function processBookingApproval(idOrPayload, nextStatus = "accepted", staffResponse = "", actor) {
  const payload =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? idOrPayload
      : { request_id: idOrPayload, status: nextStatus, staff_response: staffResponse };

  return callSubmitAction(
    "processBookingApproval",
    {
      request_id: payload.request_id || payload.id,
      status: Array.isArray(payload.status) ? String(payload.status[0] || "").trim() : String(payload.status || nextStatus || "").trim(),
      staff_response: payload.staff_response || payload.staffResponse || staffResponse || "",
    },
  );
}

export const approveBooking = processBookingApproval;
