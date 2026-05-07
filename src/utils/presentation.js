// Display helpers turn database values into readable labels and badge colors.
export function statusTone(status = "") {
  // Badge color is only visual. The database value is not changed here.
  const value = status.toLowerCase();

  if (["active", "booked", "completed", "resolved", "accepted", "normal", "upcoming"].includes(value)) {
    return "status-active";
  }

  if (["pending approval", "pending", "suggested alternative", "alternative suggested", "suggested", "suspended", "fixing", "maintenance", "unassigned"].includes(value)) {
    return "status-pending";
  }

  if (["rejected", "cancelled", "no show", "no_show", "closed", "deactivated", "deactivate", "terminated", "inactive", "outdate", "deleted", "invalidated", "removed"].includes(value)) {
    return "status-rejected";
  }

  return "status-unlisted";
}

export function formatRole(role = "") {
  const value = role.toLowerCase();
  if (value === "admin") return "Admin";
  if (value === "staff") return "Staff";
  if (value === "member") return "Member";
  return role || "Unknown";
}

export function toTitleText(value = "") {
  // Convert values like no_show or alternative-suggested into title text.
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAvailabilityLabel(value = "") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  return toTitleText(source);
}

export function displayFilterOption(value = "") {
  const source = Array.isArray(value) ? value.find(Boolean) : value;
  return toTitleText(String(source || ""));
}

export function displayStatus(value = "") {
  // Accepted is shown as Upcoming in member-facing booking pages.
  const normalized = String(value).toLowerCase();
  
  const labels = {
    accepted: "Upcoming",
    rejected: "Rejected",
    pending: "Pending",
    cancelled: "Cancelled",
    completed: "Completed",
    no_show: "No Show",
    resolved: "Resolved",
    suspended: "Suspended",
    terminated: "Terminated",
    normal: "Normal",
    closed: "Closed",
    fixing: "Fixing",
    outdate: "Outdate",
    deleted: "Deleted",
    active: "Active",
    unassigned: "Unassigned",
    deactivated: "Deactivated",
    deactivate: "Deactivated",
    inactive: "Inactive",
    suggested: "Alternative Suggested",
    invalidated: "Invalidated",
  };
  return labels[normalized] || toTitleText(normalized || "unknown");
}
