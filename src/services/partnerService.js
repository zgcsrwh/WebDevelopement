import {
  assertRole,
  createNotifications,
  getCurrentActor,
  getFriendRecord,
  getMemberLookup,
  linkFriends,
  normalizeProfileDoc,
  unlinkFriends,
} from "./centreService";
import {
  addCollectionDoc,
  getCollectionDocs,
  getDocById,
  normalizeTimestamp,
  orderBy,
  serverTimestamp,
  updateCollectionDoc,
  where,
} from "./firestoreService";
import { createAppError } from "../utils/errors";
import { displayStatus, toTitleText } from "../utils/presentation";

async function resolveActor(actor) {
  return actor || getCurrentActor();
}

async function getOwnProfile(actorId) {
  const profiles = await getCollectionDocs("profile", [where("member_id", "==", actorId)]);
  return profiles[0] || null;
}

function mapProfile(item, memberLookup, currentActorId = "") {
  const normalized = normalizeProfileDoc(item);
  const member = memberLookup.get(normalized.memberId);

  return {
    id: normalized.id,
    memberId: normalized.memberId,
    nickname: normalized.nickname || member?.name || "Member",
    sport: normalized.interests[0] ? toTitleText(normalized.interests[0]) : "Sports",
    interests: normalized.interests,
    interestsRaw: normalized.interests,
    availability: normalized.availableTime.map((entry) => toTitleText(entry)).join(", "),
    availableTimeRaw: normalized.availableTime,
    bio: normalized.bio,
    openMatch: normalized.openMatch,
    isActive: normalized.openMatch,
    level: item.level || "Intermediate",
    updatedAt: normalizeTimestamp(normalized.lastUpdated),
    memberStatus: member?.status || "active",
    isCurrentUser: normalized.memberId === currentActorId,
    raw: item,
  };
}

function mapMatchRequest(item, memberLookup, actorId = "") {
  const sender = memberLookup.get(item.sender_id);
  const receiver = memberLookup.get(item.reciever_id);
  const isIncoming = item.reciever_id === actorId;

  return {
    id: item.id,
    fromId: item.sender_id,
    from: sender?.profile?.nickname || sender?.name || item.sender_id,
    toId: item.reciever_id,
    to: receiver?.profile?.nickname || receiver?.name || item.reciever_id,
    message: item.apply_description || "",
    response: item.respond_message || "",
    status: item.status || "pending",
    statusLabel: displayStatus(item.status || "pending"),
    createdAt: normalizeTimestamp(item.created_at),
    completedAt: normalizeTimestamp(item.completed_at),
    direction: isIncoming ? "incoming" : "outgoing",
    raw: item,
  };
}

export async function getCurrentMatchProfile(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const ownProfile = await getOwnProfile(resolvedActor.id);
  if (!ownProfile) {
    return null;
  }

  const memberLookup = await getMemberLookup();
  return mapProfile(ownProfile, memberLookup, resolvedActor.id);
}

export async function getPartnerProfiles(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const ownProfile = await getOwnProfile(resolvedActor.id);
  if (!ownProfile || !ownProfile.open_match) {
    throw createAppError("failed-precondition", "Please complete your partner profile and enable matching first.");
  }

  const [profiles, memberLookup] = await Promise.all([
    getCollectionDocs("profile", [orderBy("last_updated", "desc")]),
    getMemberLookup(),
  ]);

  return profiles
    .map((item) => mapProfile(item, memberLookup, resolvedActor.id))
    .filter((item) => item.openMatch && !item.isCurrentUser && item.memberStatus === "active");
}

export async function getFriendProfiles(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const [friendRecord, memberLookup] = await Promise.all([
    getFriendRecord(resolvedActor.id),
    getMemberLookup(),
  ]);

  const friendIds = friendRecord?.friends_ids || [];
  return friendIds
    .map((friendId) => memberLookup.get(friendId))
    .filter(Boolean)
    .map((member) => ({
      id: member.id,
      name: member.profile?.nickname || member.name,
      nickname: member.profile?.nickname || member.name,
      sport: member.profile?.interests?.[0] ? toTitleText(member.profile.interests[0]) : "Sports",
      level: member.profile?.raw?.level || "Intermediate",
      bio: member.profile?.bio || "No description yet.",
      availability: member.profile?.availableTime || [],
      status: member.status,
    }));
}

export async function saveMatchProfile(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  if (!payload.nickname?.trim() || !payload.self_description?.trim()) {
    throw createAppError("invalid-argument", "Please complete the nickname and profile description.");
  }

  if (!payload.interests?.length || !payload.available_time?.length) {
    throw createAppError("invalid-argument", "Please select at least one interest and one available time.");
  }

  const existingProfile = await getOwnProfile(resolvedActor.id);
  const profilePayload = {
    member_id: resolvedActor.id,
    nickname: payload.nickname.trim(),
    open_match: true,
    interests: payload.interests,
    level: payload.level || "Intermediate",
    self_description: payload.self_description.trim(),
    available_time: payload.available_time,
    last_updated: new Date().toISOString(),
  };

  if (existingProfile?.id) {
    await updateCollectionDoc("profile", existingProfile.id, profilePayload);
    return { success: true, id: existingProfile.id };
  }

  const profileId = await addCollectionDoc("profile", profilePayload);
  await updateCollectionDoc("member", resolvedActor.id, { profile_ID: profileId });
  return { success: true, id: profileId };
}

export async function toggleMatchStatus(isActive, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const existingProfile = await getOwnProfile(resolvedActor.id);
  if (!existingProfile) {
    throw createAppError("failed-precondition", "Please complete your partner profile before changing the match status.");
  }

  await updateCollectionDoc("profile", existingProfile.id, {
    open_match: Boolean(isActive),
    last_updated: new Date().toISOString(),
  });

  if (!isActive) {
    const requests = await getCollectionDocs("matching");
    const pendingRelated = requests.filter(
      (item) =>
        (item.reciever_id === resolvedActor.id || item.sender_id === resolvedActor.id) &&
        String(item.status || "").toLowerCase() === "pending",
    );

    await Promise.all(
      pendingRelated.map((item) =>
        updateCollectionDoc("matching", item.id, {
          status: "invalidated",
          respond_message: "Automatically invalidated because matching was closed.",
          completed_at: new Date().toISOString(),
        }),
      ),
    );

    const affectedMemberIds = pendingRelated.map((item) =>
      item.sender_id === resolvedActor.id ? item.reciever_id : item.sender_id,
    );
    await createNotifications(
      affectedMemberIds,
      "A pending partner request was invalidated because the other member closed matching.",
      "match_request",
      "invalidated",
      resolvedActor.id,
    );
  }

  return { success: true, isActive: Boolean(isActive) };
}

export async function getMatchRequests(actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const [requests, memberLookup] = await Promise.all([
    getCollectionDocs("matching", [orderBy("created_at", "desc")]),
    getMemberLookup(),
  ]);

  return requests
    .filter((item) => item.sender_id === resolvedActor.id || item.reciever_id === resolvedActor.id)
    .map((item) => mapMatchRequest(item, memberLookup, resolvedActor.id));
}

export async function sendMatchRequest(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const receiverId = payload.reciever_id || payload.receiver_id;
  if (!receiverId || receiverId === resolvedActor.id) {
    throw createAppError("invalid-argument", "Please choose another member to send a request to.");
  }

  const [ownProfile, receiverProfile, requests, memberLookup, friendRecord] = await Promise.all([
    getOwnProfile(resolvedActor.id),
    getOwnProfile(receiverId),
    getCollectionDocs("matching"),
    getMemberLookup(),
    getFriendRecord(resolvedActor.id),
  ]);

  if (!ownProfile || !ownProfile.open_match) {
    throw createAppError("failed-precondition", "Please complete your partner profile and enable matching first.");
  }

  if (!receiverProfile || !receiverProfile.open_match) {
    throw createAppError("failed-precondition", "The selected member is currently unavailable for matching.");
  }

  if (String(memberLookup.get(receiverId)?.status || "").toLowerCase() !== "active") {
    throw createAppError("failed-precondition", "The selected member is currently unavailable for matching.");
  }

  if ((friendRecord?.friends_ids || []).includes(receiverId)) {
    throw createAppError("already-exists", "You are already connected with this member.");
  }

  const duplicate = requests.find((item) => {
    const samePair =
      (item.sender_id === resolvedActor.id && item.reciever_id === receiverId) ||
      (item.sender_id === receiverId && item.reciever_id === resolvedActor.id);
    const active = ["pending", "accepted"].includes(String(item.status || "").toLowerCase());
    return samePair && active;
  });

  if (duplicate) {
    throw createAppError("already-exists");
  }

  const requestId = await addCollectionDoc("matching", {
    sender_id: resolvedActor.id,
    reciever_id: receiverId,
    apply_description: payload.apply_description?.trim() || "Would you like to train together?",
    respond_message: "",
    status: "pending",
    created_at: serverTimestamp(),
    completed_at: "",
  });

  const senderName = ownProfile.nickname || memberLookup.get(resolvedActor.id)?.name || "A member";
  await createNotifications(
    [receiverId],
    `${senderName} sent you a partner matching request.`,
    "match_request",
    "pending",
    requestId,
  );

  return { success: true, match_id: requestId };
}

export async function respondToMatchRequest(payload, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);

  const requestId = payload.match_id || payload.id;
  const request = await getDocById("matching", requestId);
  if (!request) {
    throw createAppError("not-found");
  }

  if (request.reciever_id !== resolvedActor.id) {
    throw createAppError("permission-denied");
  }

  if (String(request.status || "").toLowerCase() !== "pending") {
    throw createAppError("failed-precondition", "This request has already been processed.");
  }

  const nextStatus = Array.isArray(payload.status) ? payload.status[0] : payload.status;
  if (!["accepted", "rejected"].includes(String(nextStatus || "").toLowerCase())) {
    throw createAppError("invalid-argument");
  }

  await updateCollectionDoc("matching", requestId, {
    status: nextStatus,
    respond_message: payload.respond_message?.trim() || "",
    completed_at: new Date().toISOString(),
  });

  if (String(nextStatus).toLowerCase() === "accepted") {
    await linkFriends(request.sender_id, request.reciever_id);

    const reverseRequests = await getCollectionDocs("matching");
    await Promise.all(
      reverseRequests
        .filter(
          (item) =>
            item.id !== requestId &&
            String(item.status || "").toLowerCase() === "pending" &&
            ((item.sender_id === request.sender_id && item.reciever_id === request.reciever_id) ||
              (item.sender_id === request.reciever_id && item.reciever_id === request.sender_id)),
        )
        .map((item) =>
          updateCollectionDoc("matching", item.id, {
            status: "invalidated",
            respond_message: "Automatically invalidated because the members are already matched.",
            completed_at: new Date().toISOString(),
          }),
        ),
    );
  }

  await createNotifications(
    [request.sender_id],
    String(nextStatus).toLowerCase() === "accepted"
      ? "Your partner request has been accepted."
      : "Your partner request has been rejected.",
    "match_request",
    String(nextStatus).toLowerCase(),
    requestId,
  );

  return { success: true };
}

export async function removeFriend(friendId, actor) {
  const resolvedActor = await resolveActor(actor);
  assertRole(resolvedActor, ["Member"]);
  await unlinkFriends(resolvedActor.id, friendId);
  return { success: true };
}
