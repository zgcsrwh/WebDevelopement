const AVATAR_STORAGE_KEY = "sports-centre-avatar-selections";
const AVATAR_CHANGE_EVENT = "sports-centre-avatar-change";

function buildAvatarSvg({ background, accent, detail, pattern, label }) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="28" fill="${background}" />
      <circle cx="96" cy="26" r="18" fill="${pattern}" opacity="0.45" />
      <circle cx="24" cy="94" r="20" fill="${pattern}" opacity="0.35" />
      <circle cx="60" cy="44" r="22" fill="${accent}" />
      <path d="M28 102c5-18 18-29 32-29s27 11 32 29" fill="${accent}" />
      <path d="${detail}" fill="${pattern}" opacity="0.8" />
      <text x="60" y="112" text-anchor="middle" font-family="Arial" font-size="10" fill="#0f172a">${label}</text>
    </svg>`,
  )}`;
}

const AVATAR_OPTIONS = [
  {
    id: "skyline",
    label: "Skyline",
    src: buildAvatarSvg({
      background: "#dbeafe",
      accent: "#2563eb",
      pattern: "#93c5fd",
      detail: "M16 78c14-10 26-14 44-14s30 4 44 14v8H16z",
      label: "SKY",
    }),
  },
  {
    id: "forest",
    label: "Forest",
    src: buildAvatarSvg({
      background: "#dcfce7",
      accent: "#15803d",
      pattern: "#86efac",
      detail: "M20 80c10-15 20-24 40-24s30 9 40 24v10H20z",
      label: "FOR",
    }),
  },
  {
    id: "sunrise",
    label: "Sunrise",
    src: buildAvatarSvg({
      background: "#fef3c7",
      accent: "#d97706",
      pattern: "#fbbf24",
      detail: "M16 84c16-10 28-14 44-14s28 4 44 14v6H16z",
      label: "SUN",
    }),
  },
  {
    id: "violet",
    label: "Violet",
    src: buildAvatarSvg({
      background: "#ede9fe",
      accent: "#6d28d9",
      pattern: "#c4b5fd",
      detail: "M18 82c12-12 24-18 42-18s30 6 42 18v8H18z",
      label: "VIO",
    }),
  },
  {
    id: "coral",
    label: "Coral",
    src: buildAvatarSvg({
      background: "#ffe4e6",
      accent: "#e11d48",
      pattern: "#fda4af",
      detail: "M16 82c10-12 22-18 44-18s34 6 44 18v8H16z",
      label: "COR",
    }),
  },
  {
    id: "slate",
    label: "Slate",
    src: buildAvatarSvg({
      background: "#e2e8f0",
      accent: "#334155",
      pattern: "#94a3b8",
      detail: "M18 82c13-10 24-15 42-15s29 5 42 15v8H18z",
      label: "SLA",
    }),
  },
];

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAvatarSelections() {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAvatarSelections(nextSelections) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(nextSelections));
  window.dispatchEvent(new CustomEvent(AVATAR_CHANGE_EVENT));
}

function hashSeed(seed = "") {
  return Array.from(String(seed || "member")).reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function getAvatarOwnerKey(actor) {
  if (typeof actor === "string") {
    return actor;
  }

  return actor?.id || actor?.email || actor?.name || "";
}

export function getAvatarOptions() {
  return AVATAR_OPTIONS;
}

export function getStoredAvatarId(actor) {
  const ownerKey = getAvatarOwnerKey(actor);
  if (!ownerKey) {
    return "";
  }

  return readAvatarSelections()[ownerKey] || "";
}

export function setStoredAvatarId(actor, avatarId) {
  const ownerKey = getAvatarOwnerKey(actor);
  if (!ownerKey) {
    return;
  }

  const nextSelections = readAvatarSelections();
  nextSelections[ownerKey] = avatarId;
  writeAvatarSelections(nextSelections);
}

export function subscribeToAvatarChanges(onChange) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => onChange();
  window.addEventListener(AVATAR_CHANGE_EVENT, handler);
  return () => window.removeEventListener(AVATAR_CHANGE_EVENT, handler);
}

export function buildMemberAvatar(seed = "Member") {
  const fallbackIndex = hashSeed(seed) % AVATAR_OPTIONS.length;
  return AVATAR_OPTIONS[fallbackIndex].src;
}

export function getAvatarIdForActor(actor, fallbackSeed = "Member") {
  const selectedAvatarId = getStoredAvatarId(actor);
  if (selectedAvatarId) {
    return selectedAvatarId;
  }

  const fallbackIndex = hashSeed(getAvatarOwnerKey(actor) || fallbackSeed) % AVATAR_OPTIONS.length;
  return AVATAR_OPTIONS[fallbackIndex].id;
}

export function getAvatarForActor(actor, fallbackSeed = "Member") {
  const selectedAvatarId = getAvatarIdForActor(actor, fallbackSeed);
  const selectedAvatar = AVATAR_OPTIONS.find((item) => item.id === selectedAvatarId);
  if (selectedAvatar) {
    return selectedAvatar.src;
  }

  return buildMemberAvatar(getAvatarOwnerKey(actor) || fallbackSeed);
}
