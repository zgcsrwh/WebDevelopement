// Admin manages staff accounts on this page.
// Admin can search staff, create a new staff account, view assigned facilities, and deactivate staff.
// Staff are shown with real names for admin management work.
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import "./AdminStaff.css";
import { createStaffAccount, disableStaffAccount, getAdminStaff, subscribeToAdminStaff } from "../../services/adminService";
import { useAuth } from "../../provider/AuthContext";
import { getActionErrorMessage } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import PageLayout from "../../components/common/PageLayout";
import { Button } from "../../components/common/Button";

const DEFAULT_PASSWORD = "Staff1234";

// Create the starting form for the create staff modal.
// Admin fills in the new staff profile while the temporary password is already shown.
function getEmptyCreateForm() {
  return {
    name: "",
    email: "",
    date_of_birth: "",
    address: "",
    password: DEFAULT_PASSWORD,
  };
}

// Check the email typed in the create staff modal.
// Admin sees a field message before the account is submitted.
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

// Check the temporary password shown in the create staff modal.
// The new staff account needs a password with letters and numbers.
function isValidPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(value || ""));
}

// Format the joined date shown in the staff table.
// Admin can still read the staff row even when the joined date is not available.
function formatJoinedDate(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

// Build the facility chips shown in the staff table.
// Admin can see which facilities each staff member is responsible for.
function getManagedFacilityNames(item) {
  if (!item?.managedFacilityCount) {
    return [];
  }

  return String(item.managedFacility || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

// Build the create error shown in the staff modal.
// Admin sees the message near the form that failed.
function getCreateErrorMessage(error) {
  return getActionErrorMessage(error, "staff.create", "Unable to create this staff account.");
}

// Build the deactivate error shown in the confirm dialog.
// Admin sees why the selected staff account was not changed.
function getDeactivateErrorMessage(error) {
  return getActionErrorMessage(error, "staff.disable", "Unable to deactivate this staff account.");
}

// Admin manages staff accounts on this screen.
// The page keeps staff records live, searches real names, and opens create or deactivate dialogs.
export default function AdminStaff() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(getEmptyCreateForm());
  const [createErrors, setCreateErrors] = useState({});
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateError, setDeactivateError] = useState("");
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  // Reload staff accounts after create or deactivate actions.
  // Admin sees only staff accounts in this management table.
  async function refreshStaff({ showLoader = false } = {}) {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const nextItems = await getAdminStaff(sessionProfile);
      setItems(nextItems.filter((item) => String(item.role || "").toLowerCase() === "staff"));
      setPageError("");
    } catch (loadError) {
      setPageError(getActionErrorMessage(loadError, "staff.load", "Unable to load staff accounts."));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  // Keep staff account data live after the admin profile is ready.
  // Admin sees status and facility assignment changes without a manual refresh.
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    // Start live staff updates for this admin page.
    // Admin can see active, inactive, and unassigned staff records.
    async function startSubscription() {
      setLoading(true);

      try {
        unsubscribe = await subscribeToAdminStaff(
          sessionProfile,
          (nextItems) => {
            if (!active) {
              return;
            }
            setItems(nextItems.filter((item) => String(item.role || "").toLowerCase() === "staff"));
            setPageError("");
            setLoading(false);
          },
          (subscriptionError) => {
            if (!active) {
              return;
            }
            setPageError(getActionErrorMessage(subscriptionError, "staff.load", "Unable to keep staff accounts up to date."));
            setLoading(false);
          },
        );
      } catch (subscriptionError) {
        if (active) {
          setPageError(getActionErrorMessage(subscriptionError, "staff.load", "Unable to keep staff accounts up to date."));
          setLoading(false);
        }
      }
    }

    if (sessionProfile?.id) {
      startSubscription();
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [sessionProfile]);

  // Build the staff list after search is applied.
  // Admin searches by real staff names on this page.
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchInput.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => String(item.name || "").toLowerCase().includes(normalizedQuery));
  }, [searchInput, items]);

  // Clear the staff search box and page messages.
  // Admin returns to the full staff table without closing any open dialog.
  function clearFilters() {
    setSearchInput("");
    setPageError("");
    setPageMessage("");
  }

  // Open the create staff modal with a fresh form.
  // Admin starts a new account without messages from the last attempt.
  function openCreateModal() {
    setCreateForm(getEmptyCreateForm());
    setCreateErrors({});
    setCreateError("");
    setCreateOpen(true);
  }

  // Close the create staff modal and reset the form.
  // The next create action starts with a clean staff profile form.
  function closeCreateModal() {
    setCreateOpen(false);
    setCreateForm(getEmptyCreateForm());
    setCreateErrors({});
    setCreateError("");
  }

  // Open the deactivate dialog for one staff account.
  // Admin can confirm the exact staff member before changing the account status.
  function openDeactivateModal(item) {
    setDeactivateTarget(item);
    setDeactivateError("");
  }

  // Close the deactivate dialog when no request is running.
  // During submit, the dialog stays open until the staff status action finishes.
  function closeDeactivateModal() {
    if (deactivateSubmitting) {
      return;
    }
    setDeactivateTarget(null);
    setDeactivateError("");
  }

  // Check the create staff form before submit.
  // Admin gets field messages when profile details or email need fixing.
  // The submit action only starts after the form is ready.
  function validateCreateForm() {
    const nextErrors = {};

    // Admin must enter the basic staff profile details before creating the account.
    if (!createForm.name.trim()) {
      nextErrors.name = "Full name is required.";
    }

    if (!createForm.email.trim()) {
      nextErrors.email = "Email address is required.";
    } else if (!isValidEmail(createForm.email)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!createForm.date_of_birth) {
      nextErrors.date_of_birth = "Date of birth is required.";
    } else if (new Date(createForm.date_of_birth) > new Date()) {
      nextErrors.date_of_birth = "Date of birth cannot be in the future.";
    }

    if (!createForm.address.trim()) {
      nextErrors.address = "Address is required.";
    }

    // The temporary password must still follow the rule shown in the modal.
    if (!isValidPassword(createForm.password)) {
      nextErrors.password = "Temporary password must contain at least 8 characters and include both letters and numbers.";
    }

    return nextErrors;
  }

  // Submit a new staff account from the modal.
  // The form is checked first, then admin sees the staff table update after success.
  async function handleCreateSubmit() {
    setCreateError("");
    setPageError("");
    setPageMessage("");

    const nextErrors = validateCreateForm();
    setCreateErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

    // A successful create closes the modal and shows a success message on the page.
    setCreateSubmitting(true);
    try {
      await createStaffAccount(
        {
          ...createForm,
          password: DEFAULT_PASSWORD,
        },
        sessionProfile,
      );
      closeCreateModal();
      setPageMessage("Staff account created successfully.");
      await refreshStaff();
    } catch (error) {
      setCreateError(getCreateErrorMessage(error));
    } finally {
      setCreateSubmitting(false);
    }
  }

  // Deactivate the selected staff account after admin confirms.
  // The staff table reloads so admin can see the new account status.
  async function handleDeactivateConfirm() {
    if (!deactivateTarget) {
      return;
    }

    setDeactivateError("");
    setPageError("");
    setPageMessage("");
    setDeactivateSubmitting(true);

    try {
      await disableStaffAccount(deactivateTarget.id, sessionProfile);
      setDeactivateTarget(null);
      setPageMessage("Staff account deactivated successfully.");
      await refreshStaff();
    } catch (error) {
      setDeactivateError(getDeactivateErrorMessage(error));
    } finally {
      setDeactivateSubmitting(false);
    }
  }

  const filterActions = (
      <Button className="admin-staff-page__addButton" type="button" onClick={openCreateModal}>
        <Plus size={18} aria-hidden="true" />
        <span>Add New Staff</span>
      </Button>
  );

  return (
    <PageLayout
      className="admin-staff-page"
      title="Staff Management"
      subtitle="Create new staff accounts and manage existing personnel."
    >
      {/* The top bar searches staff names and opens the create staff modal. */}
      <FilterPanel columns={1} onClear={clearFilters} extraActions={filterActions}>
        <FilterField id="admin-staff-search" label="">
          <input
            id="admin-staff-search"
            type="text"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPageError("");
              setPageMessage("");
            }}
            placeholder="Search staff name..."
            aria-label="Search staff name"
          />
        </FilterField>
      </FilterPanel>

      {pageError ? (
        <section className="workspace-surface">
          <p className="errorMessage">{pageError}</p>
        </section>
      ) : null}

      {pageMessage ? (
        <section className="workspace-surface">
          <p className="successMessage">{pageMessage}</p>
        </section>
      ) : null}

      {/* The table shows real staff names, account status, and assigned facilities. */}
      <section className="admin-staff-page__tableCard">
        {loading ? (
          <div className="admin-staff-page__empty">Loading staff accounts...</div>
        ) : filteredItems.length === 0 ? (
          <div className="admin-staff-page__empty">No staff accounts match the current search.</div>
        ) : (
          <div className="admin-staff-page__tableWrap">
            <table className="admin-staff-page__table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Managed Facilities</th>
                  <th>Joined Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const managedFacilities = getManagedFacilityNames(item);
                  const isDeactivated = String(item.status || "").toLowerCase() === "deactivate";

                  return (
                    <tr key={item.id}>
                      <td className="admin-staff-page__nameCell">{item.name || "Unknown staff"}</td>
                      <td>{item.email || "Not available"}</td>
                      <td>
                        <span className={`status-pill ${statusTone(item.status)}`}>{item.status || "unknown"}</span>
                      </td>
                      <td>
                        {managedFacilities.length ? (
                          <div className="admin-staff-page__facilityList">
                            {managedFacilities.map((facilityName) => (
                              <span key={`${item.id}-${facilityName}`} className="admin-staff-page__facilityChip">
                                {facilityName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="admin-staff-page__none">None</span>
                        )}
                      </td>
                      <td>{formatJoinedDate(item.joinedDate)}</td>
                      <td>
                        {isDeactivated ? (
                          <span className="admin-staff-page__disabledAction">Deactivated</span>
                        ) : (
                          <button className="admin-staff-page__deactivateButton" type="button" onClick={() => openDeactivateModal(item)}>
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createOpen ? (
        <div className="workspace-modal-overlay">
          <div className="admin-staff-page__modalCard">
            {/* The create modal collects the basic staff profile fields. */}
            <div className="admin-staff-page__modalHead">
              <div>
                <h2>Create Staff Account</h2>
              </div>
              <button className="admin-staff-page__closeButton" type="button" onClick={closeCreateModal} aria-label="Close create staff account dialog">
                <X size={28} aria-hidden="true" />
              </button>
            </div>

            <div className="admin-staff-page__modalBody">
              {createError ? <p className="errorMessage">{createError}</p> : null}

              {/* Admin fills these fields once, then the new staff can update their own profile later. */}
              <div className="admin-staff-page__field">
                <label htmlFor="staff-name">Full Name</label>
                <input
                  id="staff-name"
                  type="text"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Enter staff full name"
                />
                {createErrors.name ? <p className="admin-staff-page__fieldError">{createErrors.name}</p> : null}
              </div>

              <div className="admin-staff-page__field">
                <label htmlFor="staff-email">Email Address</label>
                <input
                  id="staff-email"
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="e.g., staff@sportscenter.com"
                />
                {createErrors.email ? <p className="admin-staff-page__fieldError">{createErrors.email}</p> : null}
              </div>

              <div className="admin-staff-page__field">
                <label htmlFor="staff-dob">Date of Birth</label>
                <input
                  id="staff-dob"
                  type="date"
                  value={createForm.date_of_birth}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, date_of_birth: event.target.value }))}
                />
                {createErrors.date_of_birth ? <p className="admin-staff-page__fieldError">{createErrors.date_of_birth}</p> : null}
              </div>

              <div className="admin-staff-page__field">
                <label htmlFor="staff-address">Address</label>
                <input
                  id="staff-address"
                  type="text"
                  value={createForm.address}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Enter address"
                />
                {createErrors.address ? <p className="admin-staff-page__fieldError">{createErrors.address}</p> : null}
              </div>

              <div className="admin-staff-page__field">
                <label htmlFor="staff-password">Temporary Password</label>
                <input id="staff-password" type="text" value={DEFAULT_PASSWORD} readOnly />
                {createErrors.password ? <p className="admin-staff-page__fieldError">{createErrors.password}</p> : null}
              </div>
            </div>

            <div className="admin-staff-page__modalFooter">
              <button className="btn-secondary" type="button" disabled={createSubmitting} onClick={closeCreateModal}>
                Cancel
              </button>
              <button className="btn" type="button" disabled={createSubmitting} onClick={handleCreateSubmit}>
                {createSubmitting ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Deactivate Staff Account"
        description={
          deactivateTarget
            ? `Are you sure you want to deactivate ${deactivateTarget.name}?`
            : ""
        }
        tone="danger"
        pending={deactivateSubmitting}
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        onCancel={closeDeactivateModal}
        onConfirm={handleDeactivateConfirm}
      >
        {/* The dialog keeps deactivation separate from normal table browsing. */}
        {deactivateError ? <p className="errorMessage">{deactivateError}</p> : null}
      </ConfirmDialog>
    </PageLayout>
  );
}
