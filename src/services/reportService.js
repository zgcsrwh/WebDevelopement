import {
  assertRole,
  createNotifications,
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
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { callSubmitAction } from "./callableService";
import { countMeaningfulCharacters, hasMeaningfulText } from "../utils/text";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

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
    memberName: member?.name || "Member",
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

export async function getRepairTickets(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member", "Staff", "Admin"]);

  const [items, memberLookup, facilityLookup, staffLookup] = await Promise.all([
    getCollectionDocs("repair", [orderBy("created_at", "desc")]),
    getMemberLookup(),
    getFacilityLookup(),
    getStaffLookup(),
  ]);

  const filteredItems = items.filter((item) => {
    if (resolvedActor.role === "Member") {
      return item.member_id === resolvedActor.id;
    }

    if (resolvedActor.role === "Staff") {
      return item.staff_id === resolvedActor.id;
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

  if (resolvedActor.role === "Staff" && item.staff_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  return mapRepairTicket(item, memberLookup, facilityLookup, staffLookup);
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

  await createNotifications(
    [resolvedActor.id, facility.staffId],
    `A repair ticket for ${facility.name} has been submitted.`,
    "repair_report",
    "pending",
    repairId,
  );

  return { success: true, repairt_id: repairId };
}

export async function submitRepairTicket(payload, actor) {
  return callSubmitAction(
    "submitRepairTicket",
    {
      facility_id: payload.facility_id,
      repair_description: payload.repair_description,
      type: Array.isArray(payload.type) ? payload.type : [payload.type].filter(Boolean),
    },
  );
}

async function updateTicketStatusDirect(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Staff", "Admin"]);

  const repairId = payload.repairt_id || payload.id;
  const repair = await getDocById("repair", repairId);
  if (!repair) {
    throw createAppError("not-found");
  }

  if (resolvedActor.role === "Staff" && repair.staff_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  const nextStatus = Array.isArray(payload.status) ? payload.status[0] : payload.status;
  if (String(nextStatus || "").toLowerCase() !== "resolved") {
    throw createAppError("invalid-argument", "Repairs can only be moved to resolved in this workflow.");
  }

  const repairFacility = await getDocById("facility", repair.facility_id);
  const repairEffectiveStatus = getEffectiveRepairStatus(repair, repairFacility);
  if (repairEffectiveStatus !== "pending") {
    throw createAppError("failed-precondition");
  }

  await runDbTransaction(async (transaction) => {
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

    if (resolvedActor.role === "Staff" && currentRepair.staff_id !== resolvedActor.id) {
      throw createAppError("permission-denied");
    }

    transaction.update(repairRef, {
      status: "resolved",
      completed_at: new Date().toISOString(),
      updated_at: serverTimestamp(),
    });
  });

  await createNotifications(
    [repair.member_id],
    "Your repair report has been resolved.",
    "repair_report",
    "resolved",
    repairId,
  );

  return { success: true };
}

export async function updateTicketStatus(payload, actor) {
  return callSubmitAction(
    "updateTicketStatus",
    {
      repairt_id: payload.repairt_id || payload.id,
      status: Array.isArray(payload.status) ? payload.status : [payload.status].filter(Boolean),
    },
  );
}
