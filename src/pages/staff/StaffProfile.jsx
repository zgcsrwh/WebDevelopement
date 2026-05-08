// Staff profile page for personal account edits.
// It shows the shared profile form with staff styling.
// Staff can update basic details without the page being refreshed by listeners.
import "../../components/profile/StaffProfile.css";
import OperatorProfilePage from "../../components/profile/OperatorProfilePage";

// Render the shared profile form as a staff page.
// The form itself handles saving details and changing passwords.
// This wrapper only chooses the staff label and staff layout.
export default function StaffProfile() {
  return <OperatorProfilePage roleVariant="staff" roleLabel="Staff" />;
}
