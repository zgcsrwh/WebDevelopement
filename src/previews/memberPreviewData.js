export const previewFacilityTypes = [
  "Badminton",
  "Basketball",
  "Tennis",
  "Swimming",
  "Yoga",
  "Table Tennis",
];

export const previewFacilityOptions = [
  { id: "facility-badminton-a", name: "Badminton Court A" },
  { id: "facility-tennis-a", name: "Tennis Court A" },
  { id: "facility-basketball-b", name: "Basketball Court B" },
  { id: "facility-swimming-l2", name: "Swimming Pool Lane 2" },
];

export const previewBookings = [
  {
    id: "REQ-20260421-001",
    facilityName: "Tennis Court A",
    sportType: "Tennis",
    status: "pending",
    date: "2026-04-21",
    startTime: "15:00",
    endTime: "16:00",
  },
  {
    id: "REQ-20260420-002",
    facilityName: "Badminton Court A",
    sportType: "Badminton",
    status: "upcoming",
    date: "2026-04-20",
    startTime: "18:00",
    endTime: "19:00",
  },
  {
    id: "REQ-20260419-003",
    facilityName: "Yoga Studio B",
    sportType: "Yoga",
    status: "alternative suggested",
    date: "2026-04-19",
    startTime: "10:00",
    endTime: "11:00",
  },
  {
    id: "REQ-20260418-004",
    facilityName: "Swimming Pool Lane 2",
    sportType: "Swimming",
    status: "rejected",
    date: "2026-04-18",
    startTime: "09:00",
    endTime: "10:00",
  },
  {
    id: "REQ-20260417-005",
    facilityName: "Basketball Court B",
    sportType: "Basketball",
    status: "completed",
    date: "2026-04-17",
    startTime: "08:00",
    endTime: "09:00",
  },
  {
    id: "REQ-20260416-006",
    facilityName: "Badminton Court C",
    sportType: "Badminton",
    status: "cancelled",
    date: "2026-04-16",
    startTime: "20:00",
    endTime: "21:00",
  },
];

export const previewReports = [
  {
    id: "REP-20260421-001",
    facilityName: "Badminton Court A",
    sportType: "Badminton",
    status: "pending",
    createdAt: "2026-04-21 10:20",
    type: ["equipment"],
  },
  {
    id: "REP-20260420-002",
    facilityName: "Swimming Pool Lane 2",
    sportType: "Swimming",
    status: "resolved",
    createdAt: "2026-04-20 09:15",
    type: ["surface"],
  },
  {
    id: "REP-20260418-003",
    facilityName: "Basketball Court B",
    sportType: "Basketball",
    status: "resolved",
    createdAt: "2026-04-18 14:30",
    type: ["light"],
  },
];

export const previewPartnerProfiles = [
  {
    id: "preview-alex",
    memberId: "preview-member-alex",
    avatarId: "sunrise",
    nickname: "Alex M.",
    description:
      "Intermediate player looking for weekend matches to stay fit. I am very competitive but also just want to have a good sweat and grab a coffee after.",
    interests: ["Badminton", "Tennis", "Table Tennis", "Basketball"],
    availableTime: ["Saturday_Evening", "Sunday_Afternoon", "Friday_Evening"],
    openMatch: true,
  },
  {
    id: "preview-emma",
    memberId: "preview-member-emma",
    avatarId: "violet",
    nickname: "Emma W.",
    description:
      "Yoga enthusiast trying to get back into tennis. Would love a practice partner for relaxed weekday sessions.",
    interests: ["Yoga", "Tennis", "Swimming"],
    availableTime: ["Monday_Evening", "Wednesday_Morning", "Saturday_Morning"],
    openMatch: true,
  },
  {
    id: "preview-jason",
    memberId: "preview-member-jason",
    avatarId: "slate",
    nickname: "Jason Lee",
    description:
      "Ping pong fanatic! I play defensively but love a good challenge. Happy to train after work or on Friday evenings.",
    interests: ["Table Tennis", "Badminton", "Basketball"],
    availableTime: ["Friday_Evening", "Tuesday_Afternoon", "Sunday_Evening"],
    openMatch: true,
  },
];

export const previewMatchedFriends = [
  {
    id: "friend-alex",
    avatarId: "sunrise",
    nickname: "Alex M.",
    status: "accepted",
    interests: ["Badminton", "Tennis"],
    note: "Usually available on weekends and open to doubles matches.",
  },
  {
    id: "friend-emma",
    avatarId: "violet",
    nickname: "Emma W.",
    status: "accepted",
    interests: ["Yoga", "Tennis"],
    note: "Prefers lighter sessions after work and weekend practice slots.",
  },
  {
    id: "friend-jason",
    avatarId: "slate",
    nickname: "Jason Lee",
    status: "accepted",
    interests: ["Table Tennis", "Basketball"],
    note: "Best for fast rallies and weekday evening sessions.",
  },
];

export const previewBookingFriends = [
  {
    id: "invite-alex",
    avatarId: "sunrise",
    name: "Alex M.",
    summary: "Badminton · Saturday Evening",
  },
  {
    id: "invite-emma",
    avatarId: "violet",
    name: "Emma W.",
    summary: "Yoga · Monday Evening",
  },
  {
    id: "invite-jason",
    avatarId: "slate",
    name: "Jason Lee",
    summary: "Table Tennis · Friday Evening",
  },
];
