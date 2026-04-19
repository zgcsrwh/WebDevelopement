export function statusTone(status = "") {
  const value = status.toLowerCase();

  if (["active", "booked", "completed", "resolved", "accepted", "normal"].includes(value)) {
    return "status-active";
  }

  if (["pending approval", "pending", "in progress", "in_progress", "suggested alternative", "suggested", "suspended", "fixing"].includes(value)) {
    return "status-pending";
  }

  if (["rejected", "cancelled", "no show", "no_show", "maintenance", "closed", "deactivated", "terminated", "inactive"].includes(value)) {
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
    accepted: "Accepted",
    rejected: "Rejected",
    pending: "Pending",
    cancelled: "Cancelled",
    completed: "Completed",
    in_progress: "In Progress",
    no_show: "No Show",
    resolved: "Resolved",
    suspended: "Suspended",
    terminated: "Terminated",
    normal: "Normal",
    closed: "Closed",
    fixing: "Fixing",
    outdate: "Off Shelf",
    deleted: "Deleted",
    active: "Active",
    deactivated: "Deactivated",
    inactive: "Inactive",
    suggested: "Suggested Change",
    invalidated: "Invalidated",
  };

  return labels[normalized] || toTitleText(normalized || "unknown");
}
