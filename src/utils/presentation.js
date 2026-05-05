export function statusTone(status = "") {
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
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function displayStatus(value = "") {
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
    normal: "normal",
    closed: "Closed",
    fixing: "fixing",
    outdate: "outdate",
    deleted: "deleted",
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
