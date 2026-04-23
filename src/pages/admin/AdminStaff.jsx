import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import "./AdminStaff.css";
import { createStaffAccount, disableStaffAccount, getAdminStaff } from "../../services/adminService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";

const DEFAULT_PASSWORD = "Staff1234";

function getEmptyCreateForm() {
  return {
    name: "",
    email: "",
    date_of_birth: "",
    address: "",
    password: DEFAULT_PASSWORD,
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(value || ""));
}

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

function getManagedFacilityNames(item) {
  if (!item?.managedFacilityCount) {
    return [];
  }

  return String(item.managedFacility || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function getCreateErrorMessage(error) {
  const code = getErrorCode(error);
  if (code === "already-exists") {
    return "This email address is already registered.";
  }
  return getErrorMessage(error, "Unable to create this staff account.");
}

function getDeactivateErrorMessage(error) {
  const code = getErrorCode(error);
  if (code === "not-found") {
    return "The selected staff account could not be found.";
  }
  if (code === "failed-precondition") {
    return "This staff member still manages facilities. Please transfer those facilities before deactivating.";
  }
  return getErrorMessage(error, "Unable to deactivate this staff account.");
}

export default function AdminStaff() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(getEmptyCreateForm());
  const [createErrors, setCreateErrors] = useState({});
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateError, setDeactivateError] = useState("");
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  async function refreshStaff({ showLoader = false } = {}) {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const nextItems = await getAdminStaff(sessionProfile);
      setItems(nextItems.filter((item) => String(item.role || "").toLowerCase() === "staff"));
      setPageError("");
    } catch (loadError) {
      setPageError(getErrorMessage(loadError, "Unable to load staff accounts."));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    refreshStaff({ showLoader: true });
  }, [sessionProfile]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = appliedSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => String(item.name || "").toLowerCase().includes(normalizedQuery));
  }, [appliedSearch, items]);

  function applySearch() {
    setAppliedSearch(searchInput.trim());
  }

  function openCreateModal() {
    setCreateForm(getEmptyCreateForm());
    setCreateErrors({});
    setCreateError("");
    setCreateOpen(true);
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setCreateForm(getEmptyCreateForm());
    setCreateErrors({});
    setCreateError("");
  }

  function openDeactivateModal(item) {
    setDeactivateTarget(item);
    setDeactivateError("");
  }

  function closeDeactivateModal() {
    if (deactivateSubmitting) {
      return;
    }
    setDeactivateTarget(null);
    setDeactivateError("");
  }

  function validateCreateForm() {
    const nextErrors = {};

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
    }

    if (!createForm.address.trim()) {
      nextErrors.address = "Address is required.";
    }

    if (!isValidPassword(createForm.password)) {
      nextErrors.password = "Temporary password must contain at least 8 characters and include both letters and numbers.";
    }

    return nextErrors;
  }

  async function handleCreateSubmit() {
    setCreateError("");
    setPageError("");
    setPageMessage("");

    const nextErrors = validateCreateForm();
    setCreateErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

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

  return (
    <div className="admin-staff-page">
      <section className="admin-staff-page__hero">
        <div>
          <h1>Staff Management</h1>
          <p>Create new staff accounts and manage existing personnel.</p>
        </div>

        <div className="admin-staff-page__toolbar">
          <div className="admin-staff-page__search">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySearch();
                }
              }}
              placeholder="Search staff name..."
              aria-label="Search staff name"
            />
            <button className="btn-secondary admin-staff-page__searchButton" type="button" onClick={applySearch}>
              <Search size={18} aria-hidden="true" />
              <span>Search</span>
            </button>
          </div>

          <button className="btn admin-staff-page__addButton" type="button" onClick={openCreateModal}>
            <Plus size={18} aria-hidden="true" />
            <span>Add New Staff</span>
          </button>
        </div>
      </section>

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

      {deactivateTarget ? (
        <div className="workspace-modal-overlay">
          <div className="admin-staff-page__confirmCard">
            <h2>Deactivate Staff Account</h2>
            <p className="admin-staff-page__confirmText">
              Are you sure you want to deactivate <strong>{deactivateTarget.name}</strong>?
            </p>
            {deactivateError ? <p className="errorMessage">{deactivateError}</p> : null}
            <div className="admin-staff-page__modalFooter admin-staff-page__modalFooter--confirm">
              <button className="btn-secondary" type="button" disabled={deactivateSubmitting} onClick={closeDeactivateModal}>
                Cancel
              </button>
              <button className="btn-danger" type="button" disabled={deactivateSubmitting} onClick={handleDeactivateConfirm}>
                {deactivateSubmitting ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
