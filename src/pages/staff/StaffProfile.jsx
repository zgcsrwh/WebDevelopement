// Staff profile page for personal account edits.
// It shows the shared profile form with staff styling.
// Staff can update basic details without the page being refreshed by listeners.
import "../../components/profile/StaffProfile.css";
import OperatorProfilePage from "../../components/profile/OperatorProfilePage";

// Staff open the shared profile form from this page.
// The form lets them update personal details and change password in the staff layout.
export default function StaffProfile() {
  return <OperatorProfilePage roleVariant="staff" roleLabel="Staff" />;
}
