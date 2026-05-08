// Admin edits their own profile on this page.
// It uses the shared profile form with admin labels and admin styling.
// The page stays simple so profile edits are not mixed with management tables.
import "../../components/profile/StaffProfile.css";
import OperatorProfilePage from "../../components/profile/OperatorProfilePage";

// Admin opens the shared profile form from the admin workspace here.
export default function AdminProfile() {
  return <OperatorProfilePage roleVariant="admin" roleLabel="Admin" />;
}
