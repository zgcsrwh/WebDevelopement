import { Routes, Route } from "react-router-dom";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
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
import Requests from "./pages/staff/Requests";
import CheckIn from "./pages/staff/CheckIn";
import Repair from "./pages/staff/Repair";
import StaffProfile from "./pages/staff/StaffProfile";
import AdminStaff from "./pages/admin/AdminStaff";
import AdminFacilities from "./pages/admin/AdminFacilities";
import LoginRegister from "./pages/LoginRegister"

import { AuthProvider } from './provider/AuthContext'; // 确保路径正确

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LoginRegister />} />
        <Route path="/register" element={<Register />} />
        <Route path="/home" element={<Home />} />
        <Route path="/facilities" element={<Facilities />} />
        <Route path="/facilities/:id" element={<FacilityDetail />} />
        <Route path="/booking/new" element={<BookingNew />} />
        <Route path="/booking/:id" element={<BookingDetail />} />
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/partner" element={<Partner />} />
        <Route path="/partner/:id" element={<PartnerDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/reports" element={<Reports />} />

        <Route path="/staff/requests" element={<Requests />} />
        <Route path="/staff/checkin" element={<CheckIn />} />
        <Route path="/staff/repair" element={<Repair />} />
        <Route path="/staff/profile" element={<StaffProfile />} />

        <Route path="/admin/staff" element={<AdminStaff />} />
        <Route path="/admin/facilities" element={<AdminFacilities />} />
      </Routes>
    </AuthProvider>

  );
}

export default App;