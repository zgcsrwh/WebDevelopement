import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./provider/AuthContext";
import AppShell from "./components/layout/AppShell";
import LoginRegister from "./pages/LoginRegister";
import Facilities from "./pages/member/Facilities";
import FacilityDetail from "./pages/member/FacilityDetail";
import BookingNew from "./pages/member/BookingNew";
import BookingDetail from "./pages/member/BookingDetail";
import MyBookings from "./pages/member/MyBookings";
import Discover from "./pages/member/Discover";
import Partner from "./pages/member/Partner";
import PartnerDetail from "./pages/member/PartnerDetail";
import Profile from "./pages/member/Profile";
import Reports from "./pages/member/Reports";
import Requests from "./pages/staff/Requests";
import CheckIn from "./pages/staff/CheckIn";
import Repair from "./pages/staff/Repair";
import StaffProfile from "./pages/staff/StaffProfile";
import AdminStaff from "./pages/admin/AdminStaff";
import AdminFacilities from "./pages/admin/AdminFacilities";
import PreviewMemberShell from "./pages/preview/PreviewMemberShell";
import PreviewBookings from "./pages/preview/PreviewBookings";
import PreviewReports from "./pages/preview/PreviewReports";
import PreviewPartnerDiscover from "./pages/preview/PreviewPartnerDiscover";
import PreviewPartnerDetail from "./pages/preview/PreviewPartnerDetail";
import PreviewProfile from "./pages/preview/PreviewProfile";
import PreviewBookingNew from "./pages/preview/PreviewBookingNew";
import PreviewNotificationsBell from "./pages/preview/PreviewNotificationsBell";
import PreviewStaffShell from "./pages/preview/PreviewStaffShell";
import PreviewStaffRequests from "./pages/preview/PreviewStaffRequests";
import PreviewStaffCheckIn from "./pages/preview/PreviewStaffCheckIn";
import PreviewStaffPlaceholder from "./pages/preview/PreviewStaffPlaceholder";
import { ROUTE_PATHS, getDefaultRouteForRole } from "./constants/routes";

function ProtectedRoute({ children, allowedRoles }) {
  const { authReady, isAuthenticated, sessionRole } = useAuth();

  if (!authReady) {
    return <div className="app-loading">Loading system...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(sessionRole)) {
    return <Navigate to={getDefaultRouteForRole(sessionRole)} replace />;
  }

  return children;
}

function ShellRoute({ children, allowedRoles }) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

function PreviewShellRoute({ children, activeSection }) {
  return <PreviewMemberShell activeSection={activeSection}>{children}</PreviewMemberShell>;
}

function PreviewStaffShellRoute({ children, activeSection }) {
  return <PreviewStaffShell activeSection={activeSection}>{children}</PreviewStaffShell>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTE_PATHS.ROOT} element={<Navigate to={ROUTE_PATHS.LOGIN} replace />} />
      <Route path={ROUTE_PATHS.LOGIN} element={<LoginRegister initialMode="login" />} />
      <Route path={ROUTE_PATHS.REGISTER} element={<LoginRegister initialMode="register" />} />
      <Route
        path={ROUTE_PATHS.PREVIEW_BOOKINGS}
        element={
          <PreviewShellRoute activeSection="bookings">
            <PreviewBookings />
          </PreviewShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PREVIEW_REPORTS}
        element={
          <PreviewShellRoute activeSection="reports">
            <PreviewReports />
          </PreviewShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PREVIEW_PARTNER_DISCOVER}
        element={
          <PreviewShellRoute activeSection="partner">
            <PreviewPartnerDiscover />
          </PreviewShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PREVIEW_PARTNER_DETAIL}
        element={
          <PreviewShellRoute activeSection="partner">
            <PreviewPartnerDetail />
          </PreviewShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PREVIEW_PROFILE}
        element={
          <PreviewShellRoute activeSection="">
            <PreviewProfile />
          </PreviewShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PREVIEW_BOOKING_NEW}
        element={
          <PreviewShellRoute activeSection="">
            <PreviewBookingNew />
          </PreviewShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PREVIEW_NOTIFICATIONS_BELL}
        element={
          <PreviewShellRoute activeSection="">
            <PreviewNotificationsBell />
          </PreviewShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PREVIEW_STAFF_REQUESTS}
        element={
          <PreviewStaffShellRoute activeSection="requests">
            <PreviewStaffRequests />
          </PreviewStaffShellRoute>
        }
      />
        <Route
          path={ROUTE_PATHS.PREVIEW_STAFF_BOOKINGS}
          element={
            <PreviewStaffShellRoute activeSection="checkin">
              <PreviewStaffCheckIn />
            </PreviewStaffShellRoute>
          }
        />
      <Route
        path={ROUTE_PATHS.PREVIEW_STAFF_REPORTS}
        element={
          <PreviewStaffShellRoute activeSection="reports">
            <PreviewStaffPlaceholder
              title="Reported Issues"
              description="Preview navigation only. The employee reported issues preview will be added later."
            />
          </PreviewStaffShellRoute>
        }
      />

      <Route
        path={ROUTE_PATHS.HOME}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Navigate to={ROUTE_PATHS.FACILITIES} replace />
          </ShellRoute>
        }
      />

      <Route
        path={ROUTE_PATHS.FACILITIES}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Facilities />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.FACILITY_DETAIL}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <FacilityDetail />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.BOOKINGS_NEW}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <BookingNew />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.BOOKINGS}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <MyBookings />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.BOOKING_DETAIL}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <BookingDetail />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PARTNER}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Partner />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PARTNER_DISCOVER}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Discover />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PARTNER_REQUESTS}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <PartnerDetail />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PARTNER_DETAIL}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <PartnerDetail />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.PROFILE}
        element={
          <ProtectedRoute allowedRoles={["Member"]}>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.REPORTS}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Reports />
          </ShellRoute>
        }
      />

      <Route
        path={ROUTE_PATHS.STAFF_REQUESTS}
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <Requests />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.STAFF_BOOKINGS}
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <CheckIn />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.STAFF_REPORTS}
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <Repair />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.STAFF_PROFILE}
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <StaffProfile />
          </ShellRoute>
        }
      />

      <Route
        path={ROUTE_PATHS.ADMIN_STAFF}
        element={
          <ShellRoute allowedRoles={["Admin"]}>
            <AdminStaff />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.ADMIN_FACILITIES}
        element={
          <ShellRoute allowedRoles={["Admin"]}>
            <AdminFacilities />
          </ShellRoute>
        }
      />

      <Route path="*" element={<Navigate to={ROUTE_PATHS.LOGIN} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
