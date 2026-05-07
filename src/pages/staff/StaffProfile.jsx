// This staff page shows StaffProfile content.
import "../../components/profile/StaffProfile.css";
import OperatorProfilePage from "../../components/profile/OperatorProfilePage";

export default function StaffProfile() {
  return <OperatorProfilePage roleVariant="staff" roleLabel="Staff" />;
}
