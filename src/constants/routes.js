export const ROUTE_PATHS = {
  ROOT: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  HOME: "/home",
  FACILITIES: "/facilities",
  FACILITIES_MAP: "/facilities/map",
  FACILITY_DETAIL: "/facilities/:id",
  BOOKINGS_NEW: "/bookings/new",
  BOOKINGS: "/bookings",
  BOOKING_DETAIL: "/bookings/:id",
  REPORTS: "/reports",
  PARTNER: "/partner",
  PARTNER_DISCOVER: "/partner/discover",
  PARTNER_REQUESTS: "/partner/requests",
  PARTNER_DETAIL: "/partner/:id",
  PROFILE: "/profile",
  STAFF_REQUESTS: "/staff/requests",
  STAFF_BOOKINGS: "/staff/bookings",
  STAFF_REPORTS: "/staff/reports",
  STAFF_PROFILE: "/staff/profile",
  ADMIN_PROFILE: "/admin/profile",
  ADMIN_STAFF: "/admin/staff",
  ADMIN_FACILITIES: "/admin/facilities",
};

export function getFacilityDetailRoute(id) {
  return `${ROUTE_PATHS.FACILITIES}/${id}`;
}

export function getBookingDetailRoute(id) {
  return `${ROUTE_PATHS.BOOKINGS}/${id}`;
}

export function getPartnerDetailRoute(id) {
  return `${ROUTE_PATHS.PARTNER}/${id}`;
}

export function getBookingNewRoute({ facilityId, date } = {}) {
  const search = new URLSearchParams();

  if (facilityId) {
    search.set("facility", facilityId);
  }

  if (date) {
    search.set("date", date);
  }

  const query = search.toString();
  return query ? `${ROUTE_PATHS.BOOKINGS_NEW}?${query}` : ROUTE_PATHS.BOOKINGS_NEW;
}

export function getDefaultRouteForRole(role) {
  if (role === "Admin") {
    return ROUTE_PATHS.ADMIN_FACILITIES;
  }

  if (role === "Staff") {
    return ROUTE_PATHS.STAFF_REQUESTS;
  }

  return ROUTE_PATHS.FACILITIES;
}

export function getProfileRouteForRole(role) {
  if (role === "Admin") {
    return ROUTE_PATHS.ADMIN_PROFILE;
  }

  if (role === "Staff") {
    return ROUTE_PATHS.STAFF_PROFILE;
  }

  return ROUTE_PATHS.PROFILE;
}
