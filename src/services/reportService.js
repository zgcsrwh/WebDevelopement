// Report service prepares repair ticket data for member and staff pages.
// Members use it for their own reports.
// Staff use it to read and resolve tickets for assigned facilities.
import {
  assertRole,
  getCurrentActor,
  getEffectiveRepairStatus,
  getFacilityLookup,
  getMemberLookup,
  getStaffLookup,
  getVirtualFacilityDoc,
} from "./centreService";
import {
  addCollectionDoc,
  getCollectionDocs,
  getDocById,
  getDocumentRef,
  normalizeTimestamp,
  orderBy,
  runDbTransaction,
  serverTimestamp,
  subscribeToCollection,
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { callSubmitAction } from "./callableService";
import { countMeaningfulCharacters, hasMeaningfulText } from "../utils/text";

// Get the current user for repair actions.
// Pages can pass a user in, but this keeps the service working when they do not.
async function resolveActor(actor) {
  return actor || getCurrentActor();
}

// Find the assigned staff member for a facility.
// The staff repair page uses this to decide which tickets a staff member can see.
function getAssignedFacilityStaffId(facility = {}) {
  return facility?.staffId || facility?.staff_id || facility?.raw?.staff_id || "";
}

// Check whether a staff member can see or update a repair ticket.
// A staff member can work on the ticket when the facility belongs to them.
// Admin pages do their own access check before using repair ticket data.
function canStaffAccessRepair(item = {}, facility = {}, staffId = "") {
  if (!staffId) {
    return false;
  }

  return item.staff_id === staffId || getAssignedFacilityStaffId(facility) === staffId;
}

// Turn one repair record into the ticket object used by the UI.
// It adds the names and status text that staff pages show in cards and details.
function mapRepairTicket(item, memberLookup, facilityLookup, staffLookup) {
  const facility = facilityLookup.get(item.facility_id);
  const member = memberLookup.get(item.member_id);
  const staff = staffLookup.get(item.staff_id);
  const rawStatusSource = Array.isArray(item.status) ? item.status[0] : item.status;
  const rawStatus = String(rawStatusSource || "pending").trim().toLowerCase();

  return {
    id: item.id,
    facilityId: item.facility_id,
    facility: facility?.name || item.facility_id || "Facility",
    facilityLabel: facility ? `${facility.name} (${facility.sportType})` : item.facility_id,
    memberId: item.member_id || "",
    memberName: member?.name || "Member no longer available",
    staffId: item.staff_id || "",
    staffName: staff?.name || "Staff",
    type: Array.isArray(item.type) ? item.type : [item.type].filter(Boolean),
    description: item.repair_description || "",
    status: rawStatus,
    statusLabel: rawStatus,
    createdAt: normalizeTimestamp(item.created_at),
    completedAt: normalizeTimestamp(item.completed_at),
    raw: item,
  };
}

// Load repair tickets that the current user can see.
// Members see their own reports, staff see assigned tickets, and admins see all tickets.
export async function getRepairTickets(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member", "Staff", "Admin"]);

  // Build lookup maps first because repair cards need names instead of ids.
  const [items, memberLookup, facilityLookup, staffLookup] = await Promise.all([
    getCollectionDocs("repair", [orderBy("created_at", "desc")]),
    getMemberLookup(),
    getFacilityLookup(),
    getStaffLookup(),
  ]);

  // Filter by role before the page receives the ticket list.
  const filteredItems = items.filter((item) => {
    if (resolvedActor.role === "Member") {
      return item.member_id === resolvedActor.id;
    }

    if (resolvedActor.role === "Staff") {
      return canStaffAccessRepair(item, facilityLookup.get(item.facility_id), resolvedActor.id);
    }

    return true;
  });

  return filteredItems.map((item) => mapRepairTicket(item, memberLookup, facilityLookup, staffLookup));
}

// Load one repair ticket for a detail view.
// The same role checks are used before the ticket is returned.
export async function getRepairTicketById(id, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member", "Staff", "Admin"]);

  const [item, memberLookup, facilityLookup, staffLookup] = await Promise.all([
    getDocById("repair", id),
    getMemberLookup(),
    getFacilityLookup(),
    getStaffLookup(),
  ]);

  if (!item) {
    throw createAppError("not-found");
  }

  if (resolvedActor.role === "Member" && item.member_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  if (resolvedActor.role === "Staff" && !canStaffAccessRepair(item, facilityLookup.get(item.facility_id), resolvedActor.id)) {
    throw createAppError("permission-denied");
  }

  return mapRepairTicket(item, memberLookup, facilityLookup, staffLookup);
}

// Listen for live changes that affect repair tickets.
// Repair changes update status and description.
// Facility, member, and staff changes update names on the page.
export async function subscribeToRepairTickets(actor, onNext, onError) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member", "Staff", "Admin"]);

  let active = true;
  let version = 0;

  // Reload repair tickets after any watched page data changes.
  // Staff should only see the latest ticket list when several updates happen quickly.
  async function emit() {
    const currentVersion = ++version;

    try {
      // Reload through the same repair list that staff and members already use.
      const items = await getRepairTickets(resolvedActor);
      if (active && currentVersion === version) {
        onNext?.(items);
      }
    } catch (error) {
      if (active) {
        onError?.(error);
      }
    }
  }

  const unsubscribers = [
    // Repair changes update the ticket status and description.
    subscribeToCollection("repair", [], () => void emit(), onError),
    // Facility and member changes can change names and staff access.
    subscribeToCollection("facility", [], () => void emit(), onError),
    subscribeToCollection("member", [], () => void emit(), onError),
  ];

  return () => {
    active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

// Load facility options for the member repair form.
// Members use this list when choosing where to report a problem.
export async function getReportFacilities() {
  const items = await getCollectionDocs("facility", [orderBy("name", "asc")]);
  return items
    .map((item) => getVirtualFacilityDoc(item))
    .filter((item) => Boolean(item.id && item.name))
    .sort((left, right) => left.name.localeCompare(right.name));
}

// Create a repair ticket from the member repair form.
// It checks the selected facility and the description before making the ticket data.
async function submitRepairTicketDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  if (!payload.facility_id) {
    throw createAppError("invalid-argument", "Please choose a facility.");
  }

  if (!hasMeaningfulText(payload.repair_description)) {
    throw createAppError("invalid-argument", "Please enter a repair description.");
  }

  if (countMeaningfulCharacters(payload.repair_description) > 500) {
    throw createAppError("invalid-argument", "Repair descriptions must stay within 500 characters.");
  }

  const facilityDoc = await getDocById("facility", payload.facility_id);
  if (!facilityDoc) {
    throw createAppError("not-found");
  }

  const facility = getVirtualFacilityDoc(facilityDoc);
  if (facility.status === "deleted") {
    throw createAppError("failed-precondition", "This facility is no longer available for repair reporting.");
  }

  const repairId = await addCollectionDoc("repair", {
    member_id: resolvedActor.id,
    facility_id: payload.facility_id,
    staff_id: facility.staffId || "",
    type: Array.isArray(payload.type) ? payload.type[0] : payload.type || "other",
    repair_description: payload.repair_description.trim(),
    status: "pending",
    completed_at: "",
  });

  return { success: true, repairt_id: repairId };
}

// Submit a new repair ticket from the member repair form.
// Members send the chosen facility, issue text, and repair type through this action.
export async function submitRepairTicket(payload, actor) {
  return callSubmitAction(
    "submitRepairTicket",
    {
      facility_id: payload.facility_id,
      repair_description: payload.repair_description,
      type: Array.isArray(payload.type) ? String(payload.type[0] || "").trim() : String(payload.type || "").trim(),
    },
  );
}

// Resolve a repair ticket from the staff repair page.
// Staff can only resolve tickets from their facilities when the ticket is still pending.
async function updateTicketStatusDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  // Staff can only resolve tickets they are allowed to access.
  // The selected repair ticket is loaded before the page action continues.
  const repairId = payload.repairt_id || payload.id;
  const repair = await getDocById("repair", repairId);
  if (!repair) {
    throw createAppError("not-found");
  }

  const repairFacility = await getDocById("facility", repair.facility_id);
  const repairFacilityDoc = repairFacility ? getVirtualFacilityDoc(repairFacility) : null;

  if (resolvedActor.role === "Staff" && !canStaffAccessRepair(repair, repairFacilityDoc, resolvedActor.id)) {
    throw createAppError("permission-denied");
  }

  const nextStatus = Array.isArray(payload.status) ? payload.status[0] : payload.status;
  // Staff use this workflow only to mark a pending ticket as resolved.
  // Other repair status changes are handled outside this repair page.
  if (String(nextStatus || "").toLowerCase() !== "resolved") {
    throw createAppError("invalid-argument", "Repairs can only be moved to resolved in this workflow.");
  }

  const repairEffectiveStatus = getEffectiveRepairStatus(repair, repairFacility);
  if (repairEffectiveStatus !== "pending") {
    throw createAppError("failed-precondition");
  }

  await runDbTransaction(async (transaction) => {
    // Read the ticket and facility again before changing the status.
    // Staff should not resolve a ticket that changed while they were reading it.
    const repairRef = getDocumentRef("repair", repairId);
    const repairSnapshot = await transaction.get(repairRef);
    const facilityRef = getDocumentRef("facility", repair.facility_id);
    const facilitySnapshot = await transaction.get(facilityRef);

    if (!repairSnapshot.exists()) {
      throw createAppError("not-found");
    }

    const currentRepair = repairSnapshot.data();
    const currentFacility = facilitySnapshot.exists() ? { id: facilitySnapshot.id, ...facilitySnapshot.data() } : null;
    if (getEffectiveRepairStatus(currentRepair, currentFacility) !== "pending") {
      throw createAppError("failed-precondition");
    }

    const currentFacilityDoc = currentFacility ? getVirtualFacilityDoc(currentFacility) : null;
    if (resolvedActor.role === "Staff" && !canStaffAccessRepair(currentRepair, currentFacilityDoc, resolvedActor.id)) {
      throw createAppError("permission-denied");
    }

    transaction.update(repairRef, {
      status: "resolved",
      completed_at: new Date().toISOString(),
      updated_at: serverTimestamp(),
    });
  });

  return { success: true };
}

// Send a staff repair status update from the repair page.
// Staff send the selected repair id and the status they chose.
export async function updateTicketStatus(payload, actor) {
  return callSubmitAction(
    "updateTicketStatus",
    {
      repairt_id: payload.repairt_id || payload.id,
      status: Array.isArray(payload.status) ? String(payload.status[0] || "").trim() : String(payload.status || "").trim(),
    },
  );
}
