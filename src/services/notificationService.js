import { createNotification, getCurrentActor } from "./centreService";
import { getCollectionDocs, normalizeTimestamp, subscribeToCollection, updateCollectionDoc, where } from "./firestoreService";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

function getNotificationSortValue(value) {
  if (!value) {
    return 0;
  }

  if (value?.seconds) {
    return value.seconds * 1000;
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mapNotification(item) {
  const createdAt = normalizeTimestamp(item.created_at);

  return {
    id: item.id,
    type: item.type || "system",
    statusContext: item.status_context || "",
    memberId: item.member_id || "",
    message: item.message || item.information || "System notification",
    referenceId: item.reference_id || "",
    isRead: Boolean(item.isRead ?? item.is_read ?? false),
    createdAt,
    sortValue: getNotificationSortValue(item.created_at),
  };
}

function getDisplayableNotifications(docs = []) {
  return docs
    .map(mapNotification)
    .filter((item) => item.createdAt && item.sortValue > 0)
    .sort((left, right) => {
      const timeDifference = right.sortValue - left.sortValue;
      if (timeDifference !== 0) {
        return timeDifference;
      }

      return String(right.id || "").localeCompare(String(left.id || ""));
    });
}

export async function getNotifications(actor) {
  const resolvedActor = await resolveActor(actor);
  if (!resolvedActor?.id) {
    return [];
  }

  const docs = await getCollectionDocs("notification", [where("member_id", "==", resolvedActor.id)]);
  return getDisplayableNotifications(docs);
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
      onNext(getDisplayableNotifications(docs));
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
