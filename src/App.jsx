import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./provider/AuthContext";
import AppShell from "./components/layout/AppShell";
import LoginRegister from "./pages/LoginRegister";
import Facilities from "./pages/member/Facilities";
import FacilitiesMap from "./pages/member/FacilitiesMap";
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
import AdminProfile from "./pages/admin/AdminProfile";
import AdminStaff from "./pages/admin/AdminStaff";
import AdminFacilities from "./pages/admin/AdminFacilities";
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

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTE_PATHS.ROOT} element={<Navigate to={ROUTE_PATHS.LOGIN} replace />} />
      <Route path={ROUTE_PATHS.LOGIN} element={<LoginRegister initialMode="login" />} />
      <Route path={ROUTE_PATHS.REGISTER} element={<LoginRegister initialMode="register" />} />

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
        path={ROUTE_PATHS.FACILITIES_MAP}
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <FacilitiesMap />
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
          <ShellRoute allowedRoles={["Staff"]}>
            <StaffProfile />
          </ShellRoute>
        }
      />
      <Route
        path={ROUTE_PATHS.ADMIN_PROFILE}
        element={
          <ShellRoute allowedRoles={["Admin"]}>
            <AdminProfile />
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
