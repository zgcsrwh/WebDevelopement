// Notification service reads notification documents for the current signed-in user.
import { getCurrentActor } from "./centreService";
import { getCollectionDocs, normalizeTimestamp, subscribeToCollection, updateCollectionDoc, where } from "./firestoreService";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

// Sort by real stored time only. Notifications without time are hidden from users.
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

// Support both old and new notification field names from the database.
function mapNotification(item) {
  const createdAt = normalizeTimestamp(item.created_at);
  const isRead = Boolean(item.isRead ?? item.is_read ?? false);

  return {
    id: item.id,
    type: item.type || "system",
    statusContext: item.status_context || item.status || "",
    memberId: item.member_id || item.recipient_id || "",
    message: item.message || item.information || "System notification",
    referenceId: item.reference_id || item.related_id || "",
    isRead,
    createdAt,
    sortValue: getNotificationSortValue(item.created_at),
    rawDocument: {
      ...item,
      id: item.id,
      is_read: isRead,
    },
  };
}

// Do not show temporary or broken notification rows with no real created_at value.
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

// Some documents use member_id and some use recipient_id, so merge both queries.
function mergeNotificationDocs(...groups) {
  const merged = new Map();
  groups.flat().forEach((item) => {
    if (item?.id) {
      merged.set(item.id, item);
    }
  });
  return [...merged.values()];
}

export async function getNotifications(actor) {
  const resolvedActor = await resolveActor(actor);
  if (!resolvedActor?.id) {
    return [];
  }

  const [memberDocs, recipientDocs] = await Promise.all([
    getCollectionDocs("notification", [where("member_id", "==", resolvedActor.id)]),
    getCollectionDocs("notification", [where("recipient_id", "==", resolvedActor.id)]),
  ]);
  const docs = mergeNotificationDocs(memberDocs, recipientDocs);
  return getDisplayableNotifications(docs);
}

export async function subscribeToNotifications(actor, onNext, onError) {
  const resolvedActor = await resolveActor(actor);
  if (!resolvedActor?.id) {
    onNext([]);
    return () => {};
  }

  let latestMemberDocs = [];
  let latestRecipientDocs = [];
  let unsubscribeMember = () => {};
  let unsubscribeRecipient = () => {};

  function emit() {
    onNext(getDisplayableNotifications(mergeNotificationDocs(latestMemberDocs, latestRecipientDocs)));
  }

  unsubscribeMember = await subscribeToCollection(
    "notification",
    [where("member_id", "==", resolvedActor.id)],
    (docs) => {
      latestMemberDocs = docs;
      emit();
    },
    onError,
  );

  unsubscribeRecipient = await subscribeToCollection(
    "notification",
    [where("recipient_id", "==", resolvedActor.id)],
    (docs) => {
      latestRecipientDocs = docs;
      emit();
    },
    onError,
  );

  return () => {
    unsubscribeMember();
    unsubscribeRecipient();
  };
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

