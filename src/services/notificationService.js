import { createNotification, getCurrentActor } from "./centreService";
import { getCollectionDocs, normalizeTimestamp, subscribeToCollection, updateCollectionDoc, where } from "./firestoreService";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

function mapNotification(item) {
  return {
    id: item.id,
    type: item.type || "system",
    statusContext: item.status_context || "",
    memberId: item.member_id || "",
    message: item.message || item.information || "System notification",
    referenceId: item.reference_id || "",
    isRead: Boolean(item.isRead ?? item.is_read ?? false),
    createdAt: normalizeTimestamp(item.created_at),
  };
}

export async function getNotifications(actor) {
  const resolvedActor = await resolveActor(actor);
  if (!resolvedActor?.id) {
    return [];
  }

  const docs = await getCollectionDocs("notification", [where("member_id", "==", resolvedActor.id)]);
  return docs
    .map(mapNotification)
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

export async function subscribeToNotifications(actor, onNext, onError) {
  const resolvedActor = await resolveActor(actor);
  if (!resolvedActor?.id) {
    onNext([]);
    return () => {};
  }

  return subscribeToCollection(
    "notification",
    [where("member_id", "==", resolvedActor.id)],
    (docs) => {
      onNext(
        docs
          .map(mapNotification)
          .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || ""))),
      );
    },
    onError,
  );
}

export async function getUnreadNotificationCount(actor) {
  const items = await getNotifications(actor);
  return items.filter((item) => !item.isRead).length;
}

export async function markNotificationRead(id) {
  await updateCollectionDoc("notification", id, { is_read: true });
  return { success: true };
}

export async function markAllNotificationsRead(actor) {
  const items = await getNotifications(actor);
  await Promise.all(items.filter((item) => !item.isRead).map((item) => markNotificationRead(item.id)));
  return { success: true };
}

export async function createFrontendLog(message, type = "system", actor) {
  const resolvedActor = await resolveActor(actor);
  if (!resolvedActor?.id) {
    return { success: false };
  }

  const id = await createNotification(resolvedActor.id, message, type, "", "");
  return { success: true, id };
}
