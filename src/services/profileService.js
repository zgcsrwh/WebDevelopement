import { deleteUser, signOut, updatePassword } from "firebase/auth";
import { auth } from "../provider/FirebaseConfig";
import { assertRole, getCurrentActor, getEffectiveRepairStatus, toStoredDateString } from "./centreService";
import {
  deleteCollectionDoc,
  getCollectionDocs,
  getDocById,
  updateCollectionDoc,
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { callSubmitAction } from "./callableService";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

function getParticipantIds(item = {}) {
  return [...new Set([...(item.participant_ids || []), ...(item.user_id_list || [])].filter(Boolean))];
}

function getProfileCollection(role) {
  return role === "Member" ? "member" : "admin_staff";
}

export async function updateUserProfile(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member", "Staff", "Admin"]);
  const resolvedDateOfBirth = payload.dateOfBirth || payload.date_of_birth || "";

  if (!payload.name?.trim() || !payload.address?.trim() || !resolvedDateOfBirth) {
    throw createAppError("invalid-argument", "Please complete name, date of birth, and address.");
  }

  await updateCollectionDoc(getProfileCollection(resolvedActor.role), resolvedActor.id, {
    name: payload.name.trim(),
    date_of_birth: toStoredDateString(resolvedDateOfBirth),
    address: payload.address.trim(),
  });

  return { success: true };
}

export async function updateOwnPassword(nextPassword) {
  if (!auth.currentUser) {
    throw createAppError("unauthenticated");
  }

  const normalizedPassword = String(nextPassword || "");
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(normalizedPassword)) {
    throw createAppError("invalid-argument", "Password must be at least 8 characters long and include both letters and numbers.");
  }

  await updatePassword(auth.currentUser, normalizedPassword);
  return { success: true };
}

async function checkAccountDeletableDirect(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const [requests, repairs, allRequests] = await Promise.all([
    getCollectionDocs("request", [where("member_id", "==", resolvedActor.id)]),
    getCollectionDocs("repair", [where("member_id", "==", resolvedActor.id)]),
    getCollectionDocs("request"),
  ]);
  const participantRequests = allRequests.filter((item) => getParticipantIds(item).includes(resolvedActor.id));

  const blockingReasons = [];
  const activeStatuses = ["pending", "accepted", "in_progress", "suggested"];
  if (requests.some((item) => activeStatuses.includes(String(item.status || "").toLowerCase()))) {
    blockingReasons.push("You still have an unfinished booking request or active booking.");
  }
  if (participantRequests.some((item) => activeStatuses.includes(String(item.status || "").toLowerCase()))) {
    blockingReasons.push("You are still listed as a participant in another active booking.");
  }
  const facilityDocs = await Promise.all(repairs.map((item) => getDocById("facility", item.facility_id).catch(() => null)));
  if (
    repairs.some((item, index) => {
      const effectiveStatus = getEffectiveRepairStatus(item, facilityDocs[index]);
      return ["pending", "suspended"].includes(String(effectiveStatus || "").toLowerCase());
    })
  ) {
    blockingReasons.push("You still have an unresolved repair report.");
  }

  return {
    isDeletable: blockingReasons.length === 0,
    blockingReasons,
  };
}

export async function checkAccountDeletable(actor) {
  return callSubmitAction("checkAccountDeletable", {});
}

async function deleteMyAccountDirect(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const eligibility = await checkAccountDeletableDirect(resolvedActor);
  if (!eligibility.isDeletable) {
    throw createAppError("failed-precondition", eligibility.blockingReasons.join(" "));
  }

  const [profiles, notifications, matchRequests] = await Promise.all([
    getCollectionDocs("profile", [where("member_id", "==", resolvedActor.id)]),
    getCollectionDocs("notification", [where("member_id", "==", resolvedActor.id)]),
    getCollectionDocs("matching"),
  ]);
  const friendRecords = await getCollectionDocs("friends");

  await Promise.all([
    ...profiles.map((item) => deleteCollectionDoc("profile", item.id)),
    ...notifications.map((item) => deleteCollectionDoc("notification", item.id)),
    ...matchRequests
      .filter((item) => item.sender_id === resolvedActor.id || item.reciever_id === resolvedActor.id)
      .map((item) =>
        updateCollectionDoc("matching", item.id, {
          status: "invalidated",
          respond_message: "User account deleted.",
          completed_at: new Date().toISOString(),
        }),
      ),
    ...friendRecords
      .filter((item) => Array.isArray(item.friends_ids) && item.friends_ids.includes(resolvedActor.id))
      .map((item) =>
        updateCollectionDoc("friends", item.id, {
          friends_ids: item.friends_ids.filter((friendId) => friendId !== resolvedActor.id),
        }),
      ),
  ]);

  await Promise.all([
    deleteCollectionDoc("friends", resolvedActor.id).catch(() => null),
    deleteCollectionDoc("member", resolvedActor.id).catch(() => null),
  ]);

  if (auth.currentUser) {
    await deleteUser(auth.currentUser);
  }
  await signOut(auth);

  return { success: true };
}

export async function deleteMyAccount(actor) {
  return callSubmitAction("deleteMyAccount", {});
}
