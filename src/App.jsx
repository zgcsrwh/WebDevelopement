import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./provider/AuthContext";
import AppShell from "./components/layout/AppShell";
import LoginRegister from "./pages/LoginRegister";
import Home from "./pages/member/Home";
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
import Notifications from "./pages/Notifications";
import Requests from "./pages/staff/Requests";
import CheckIn from "./pages/staff/CheckIn";
import Repair from "./pages/staff/Repair";
import StaffProfile from "./pages/staff/StaffProfile";
import AdminStaff from "./pages/admin/AdminStaff";
import AdminFacilities from "./pages/admin/AdminFacilities";

function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, authReady, sessionRole } = useAuth();

  if (!authReady) {
    return <div className="app-loading">Loading system...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(sessionRole)) {
    return <Navigate to={sessionRole === "Admin" ? "/admin/facilities" : sessionRole === "Staff" ? "/staff/requests" : "/home"} replace />;
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
      <Route path="/" element={<LoginRegister />} />
      <Route path="/register" element={<Navigate to="/" replace />} />

      <Route
        path="/home"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Home />
          </ShellRoute>
        }
      />

      <Route
        path="/facilities"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Facilities />
          </ShellRoute>
        }
      />
      <Route
        path="/facilities/:id"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <FacilityDetail />
          </ShellRoute>
        }
      />
      <Route
        path="/bookings/new"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <BookingNew />
          </ShellRoute>
        }
      />
      <Route
        path="/bookings"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <MyBookings />
          </ShellRoute>
        }
      />
      <Route
        path="/bookings/:id"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <BookingDetail />
          </ShellRoute>
        }
      />
      <Route
        path="/partner"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Partner />
          </ShellRoute>
        }
      />
      <Route
        path="/partner/discover"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Discover />
          </ShellRoute>
        }
      />
      <Route
        path="/partner/requests"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <PartnerDetail />
          </ShellRoute>
        }
      />
      <Route
        path="/partner/:id"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <PartnerDetail />
          </ShellRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Profile />
          </ShellRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ShellRoute allowedRoles={["Member"]}>
            <Reports />
          </ShellRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ShellRoute allowedRoles={["Member", "Staff", "Admin"]}>
            <Notifications />
          </ShellRoute>
        }
      />

      <Route
        path="/staff/requests"
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <Requests />
          </ShellRoute>
        }
      />
      <Route
        path="/staff/bookings"
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <CheckIn />
          </ShellRoute>
        }
      />
      <Route
        path="/staff/reports"
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <Repair />
          </ShellRoute>
        }
      />
      <Route
        path="/staff/profile"
        element={
          <ShellRoute allowedRoles={["Staff", "Admin"]}>
            <StaffProfile />
          </ShellRoute>
        }
      />

      <Route
        path="/admin/staff"
        element={
          <ShellRoute allowedRoles={["Admin"]}>
            <AdminStaff />
          </ShellRoute>
        }
      />
      <Route
        path="/admin/facilities"
        element={
          <ShellRoute allowedRoles={["Admin"]}>
            <AdminFacilities />
          </ShellRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
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
