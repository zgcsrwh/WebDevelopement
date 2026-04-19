function buildAvatar(seed, background, accent) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="28" fill="${background}" />
      <circle cx="60" cy="46" r="22" fill="${accent}" />
      <path d="M28 104c5-20 18-30 32-30s27 10 32 30" fill="${accent}" />
      <text x="60" y="112" text-anchor="middle" font-family="Arial" font-size="12" fill="#0f172a">${seed}</text>
    </svg>`,
  )}`;
}

export function buildMemberAvatar(seed = "Member") {
  const palettes = [
    ["#dbeafe", "#0f4c5c"],
    ["#dcfce7", "#166534"],
    ["#fef3c7", "#92400e"],
    ["#ede9fe", "#4338ca"],
  ];
  const paletteIndex = Math.abs(seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0)) % palettes.length;
  const [background, accent] = palettes[paletteIndex];
  return buildAvatar(seed, background, accent);
}
