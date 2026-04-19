import {
  assertRole,
  createNotifications,
  getCurrentActor,
  getFacilityLookup,
  getMemberLookup,
  getStaffLookup,
  syncFacilityStatus,
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
  updateCollectionDoc,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { displayStatus } from "../utils/presentation";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

function mapRepairTicket(item, memberLookup, facilityLookup, staffLookup) {
  const facility = facilityLookup.get(item.facility_id);
  const member = memberLookup.get(item.member_id);
  const staff = staffLookup.get(item.staff_id);

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
    status: item.status || "pending",
    statusLabel: displayStatus(item.status || "pending"),
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

export async function submitRepairTicket(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  if (!payload.facility_id) {
    throw createAppError("invalid-argument", "Please choose a facility.");
  }

  if (!payload.repair_description?.trim()) {
    throw createAppError("invalid-argument", "Please enter a repair description.");
  }

  if (payload.repair_description.trim().length > 500) {
    throw createAppError("invalid-argument", "Repair descriptions must stay within 500 characters.");
  }

  const facility = await getDocById("facility", payload.facility_id);
  if (!facility) {
    throw createAppError("not-found");
  }

  if (String(facility.status || "").toLowerCase() === "deleted") {
    throw createAppError("failed-precondition", "This facility is no longer available for repair reporting.");
  }

  const repairId = await addCollectionDoc("repair", {
    member_id: resolvedActor.id,
    facility_id: payload.facility_id,
    staff_id: facility.staff_id || "",
    type: Array.isArray(payload.type) ? payload.type[0] : payload.type || "other",
    repair_description: payload.repair_description.trim(),
    status: "pending",
    completed_at: "",
  });

  await updateCollectionDoc("facility", payload.facility_id, {
    status: "fixing",
    updated_at: serverTimestamp(),
  });

  await createNotifications(
    [resolvedActor.id, facility.staff_id],
    `A repair ticket for ${facility.name} has been submitted.`,
    "repair_report",
    "pending",
    repairId,
  );

  return { success: true, repairt_id: repairId };
}

export async function updateTicketStatus(payload, actor) {
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

  if (String(repair.status || "").toLowerCase() === "resolved") {
    throw createAppError("failed-precondition");
  }

  await runDbTransaction(async (transaction) => {
    const repairRef = getDocumentRef("repair", repairId);
    const repairSnapshot = await transaction.get(repairRef);

    if (!repairSnapshot.exists()) {
      throw createAppError("not-found");
    }

    const currentRepair = repairSnapshot.data();
    if (String(currentRepair.status || "").toLowerCase() === "resolved") {
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

  await syncFacilityStatus(repair.facility_id);
  await createNotifications(
    [repair.member_id],
    "Your repair report has been resolved.",
    "repair_report",
    "resolved",
    repairId,
  );

  return { success: true };
}
