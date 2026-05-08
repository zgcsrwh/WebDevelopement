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

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

// Read the staff id from a facility object.
// Some callers pass mapped facility data and some pass raw database data.
// This keeps staff repair checks working with both shapes.
function getAssignedFacilityStaffId(facility = {}) {
  return facility?.staffId || facility?.staff_id || facility?.raw?.staff_id || "";
}

// Check whether a staff member can see or update a repair ticket.
// Access is allowed when the ticket or the facility is assigned to that staff member.
// Admin access is handled outside this helper.
function canStaffAccessRepair(item = {}, facility = {}, staffId = "") {
  if (!staffId) {
    return false;
  }

  return item.staff_id === staffId || getAssignedFacilityStaffId(facility) === staffId;
}

// Turn one raw repair record into the ticket object used by the UI.
// It adds facility names, real member names, staff names, and clean status text.
// Staff pages use this object instead of raw database fields.
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
// Members only see reports they created.
// Staff see assigned facility tickets and admins see all tickets.
export async function getRepairTickets(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member", "Staff", "Admin"]);

  // Load tickets with member, facility, and staff lookup maps.
  // Repair rows store ids, and the page needs readable names.
  const [items, memberLookup, facilityLookup, staffLookup] = await Promise.all([
    getCollectionDocs("repair", [orderBy("created_at", "desc")]),
    getMemberLookup(),
    getFacilityLookup(),
    getStaffLookup(),
  ]);

  // Apply role based visibility before mapping display fields.
  // Staff should not see tickets outside their assigned facilities.
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

  // Reload mapped tickets after any watched collection changes.
  // The version number skips old reloads that finish late.
  // This keeps stale ticket data off the page.
  async function emit() {
    const currentVersion = ++version;

    try {
      // Use getRepairTickets again for every live update.
      // This keeps live updates using the same filters as the first load.
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
    // Repair changes update status and description.
    // Any repair update can affect the staff ticket list.
    subscribeToCollection("repair", [], () => void emit(), onError),
    // Facility and member changes update names shown in the staff table.
    // Facility assignment changes can also change ticket access.
    subscribeToCollection("facility", [], () => void emit(), onError),
    subscribeToCollection("member", [], () => void emit(), onError),
  ];

  return () => {
    active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export async function getReportFacilities() {
  const items = await getCollectionDocs("facility", [orderBy("name", "asc")]);
  return items
    .map((item) => getVirtualFacilityDoc(item))
    .filter((item) => Boolean(item.id && item.name))
    .sort((left, right) => left.name.localeCompare(right.name));
}

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

// Local backup for resolving a repair ticket if the callable is unavailable.
// Normal frontend flow calls the backend callable first.
// This backup keeps the same staff permission checks and pending only rule.
async function updateTicketStatusDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  // Staff can only resolve tickets they are allowed to access.
  // The repair id may come from the payload or the mapped ticket object.
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
  // This staff workflow only moves a pending ticket to resolved.
  // Other status changes belong in a different backend workflow.
  if (String(nextStatus || "").toLowerCase() !== "resolved") {
    throw createAppError("invalid-argument", "Repairs can only be moved to resolved in this workflow.");
  }

  const repairEffectiveStatus = getEffectiveRepairStatus(repair, repairFacility);
  if (repairEffectiveStatus !== "pending") {
    throw createAppError("failed-precondition");
  }

  await runDbTransaction(async (transaction) => {
    // Read the ticket again inside the transaction.
    // The facility is read again too because it can change while staff are viewing the page.
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

// Send a staff repair status update to the backend callable.
// The callable owns the real database update.
// The frontend only sends the repair id and target status.
export async function updateTicketStatus(payload, actor) {
  return callSubmitAction(
    "updateTicketStatus",
    {
      repairt_id: payload.repairt_id || payload.id,
      status: Array.isArray(payload.status) ? String(payload.status[0] || "").trim() : String(payload.status || "").trim(),
    },
  );
}
