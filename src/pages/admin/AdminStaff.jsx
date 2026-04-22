import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import {
  buildStaffEmailPreview,
  createStaffAccount,
  disableStaffAccount,
  getAdminStaff,
  updateStaffAccount,
} from "../../services/adminService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { formatRole, statusTone } from "../../utils/presentation";

function getEmptyForm() {
  return {
    staff_id: "",
    name: "",
    date_of_birth: "1998-01-01",
    address: "",
    email: "",
    password: "",
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value) {
  return value.length >= 8;
}

export default function AdminStaff() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    role: "All",
    search: "",
    status: "All",
  });
  const [form, setForm] = useState(getEmptyForm());
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const refresh = async () => {
    try {
      setItems(await getAdminStaff(sessionProfile));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load staff accounts."));
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        const nextItems = await getAdminStaff(sessionProfile);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load staff accounts."));
        }
      }
    }

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const roleMatch = filters.role === "All" || formatRole(item.role) === filters.role;
      const statusMatch = filters.status === "All" || item.status === filters.status;
      const searchMatch =
        !filters.search ||
        item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.email.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.managedFacility.toLowerCase().includes(filters.search.toLowerCase());
      return roleMatch && statusMatch && searchMatch;
    });
  }, [filters, items]);

  function openCreateModal() {
    setForm(getEmptyForm());
    setFormOpen(true);
  }

  function loadForEdit(item) {
    setError("");
    setMessage("");
    setForm({
      staff_id: item.id,
      name: item.name || "",
      date_of_birth: item.dateOfBirth || "1998-01-01",
      address: item.address || "",
      email: item.email || "",
      password: "",
    });
    setFormOpen(true);
  }

  function closeModal() {
    setFormOpen(false);
    setForm(getEmptyForm());
  }

  async function handleSave() {
    setError("");
    setMessage("");

    if (!form.name.trim()) {
      setError("Please complete the staff member's name before saving.");
      return;
    }

    if (!form.date_of_birth || !form.address.trim()) {
      setError("Please complete the staff member's date of birth and address before saving.");
      return;
    }

    setSaving(true);
    try {
      if (form.staff_id) {
        await updateStaffAccount(form, sessionProfile);
        setMessage(`Staff profile updated for ${form.email}.`);
      } else {
        if (!form.email.trim() || !form.password.trim()) {
          setError("Please complete name, email, and initial password before creating the employee account.");
          return;
        }

        if (!isValidEmail(form.email)) {
          setError("Please enter a valid employee email address.");
          return;
        }

        if (!isValidPassword(form.password)) {
          setError("Initial password must contain at least 8 characters.");
          return;
        }

        await createStaffAccount(form, sessionProfile);
        setMessage(`Staff account created for ${form.email}. ${buildStaffEmailPreview({ name: form.name, email: form.email })}`);
      }

      await refresh();
      closeModal();
    } catch (saveError) {
      setError(getErrorMessage(saveError, form.staff_id ? "Unable to update this staff account." : "Unable to create this staff account."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) {
      return;
    }

    setError("");
    setMessage("");
    setDeactivating(deactivateTarget.id);

    try {
      await disableStaffAccount(deactivateTarget.id, sessionProfile);
      await refresh();
      setMessage(`${deactivateTarget.name} has been deactivated.`);
      setDeactivateTarget(null);
    } catch (deactivateError) {
      setError(getErrorMessage(deactivateError, "Unable to deactivate this staff account."));
    } finally {
      setDeactivating("");
    }
  }

  return (
    <div className="workspace-page">
      <section className="workspace-header">
        <div>
          <h1>Staff management</h1>
          <p>Create new staff accounts, review role and status, and deactivate staff only after facilities are transferred.</p>
        </div>
        <div className="workspace-toolbar">
          <input
            className="workspace-search"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search staff, email, or facility"
          />
          <button className="btn" type="button" onClick={openCreateModal}>
            Add new staff
          </button>
        </div>
      </section>

      {error && (
        <section className="workspace-surface">
          <p className="errorMessage">{error}</p>
        </section>
      )}
      {message && (
        <section className="workspace-surface">
          <p className="successMessage">{message}</p>
        </section>
      )}

      <section className="workspace-metrics">
        <article>
          <span>Total admin and staff records</span>
          <strong>{items.length}</strong>
        </article>
        <article>
          <span>Active staff members</span>
          <strong>{items.filter((item) => item.role?.toLowerCase() === "staff" && item.status === "active").length}</strong>
        </article>
        <article>
          <span>Admin accounts</span>
          <strong>{items.filter((item) => item.role?.toLowerCase() === "admin").length}</strong>
        </article>
      </section>

      <section className="workspace-surface">
        <div className="filter-grid">
          <div>
            <label>Role</label>
            <select value={filters.role} onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="All">All</option>
              <option value="Staff">Staff</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="All">All</option>
              <option value="active">Active</option>
              <option value="deactivate">Deactivated</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>

      <section className="workspace-surface">
        <h2>Team members</h2>
        <div className="workspace-table-wrap" style={{ marginTop: 18 }}>
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Managed facilities</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="workspace-note" style={{ marginTop: 6 }}>
                      {item.address || "Address not available"}
                    </div>
                  </td>
                  <td>{item.email}</td>
                  <td>{item.roleLabel || formatRole(item.role)}</td>
                  <td>
                    <span className={`status-pill ${statusTone(item.status)}`}>{item.statusLabel || item.status}</span>
                  </td>
                  <td>
                    {item.managedFacility}
                    {item.managedFacilityCount > 0 && (
                      <div className="workspace-note" style={{ marginTop: 6 }}>
                        {item.managedFacilityCount} facility record(s)
                      </div>
                    )}
                  </td>
                  <td>{item.joinedDate || "Not available"}</td>
                  <td>
                    <div className="workspace-action-row">
                      <button className="btn-secondary" type="button" onClick={() => loadForEdit(item)}>
                        Edit
                      </button>
                      {item.role?.toLowerCase() === "staff" && (
                        <button className="btn-danger" type="button" onClick={() => setDeactivateTarget(item)}>
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredItems.length === 0 && <p style={{ marginTop: 16 }}>No staff accounts match the current filters.</p>}
      </section>

      {formOpen && (
        <div className="workspace-modal-overlay">
          <div className="workspace-modal-card">
            <h2 style={{ margin: 0 }}>{form.staff_id ? "Edit staff account" : "Create staff account"}</h2>
            <div className="workspace-form-grid">
              <div className="is-wide">
                <label>Employee name</label>
                <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div>
                <label>Date of birth</label>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(event) => setForm((prev) => ({ ...prev, date_of_birth: event.target.value }))}
                />
              </div>
              <div>
                <label>Employee email</label>
                <input
                  type="email"
                  value={form.email}
                  disabled={Boolean(form.staff_id)}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="is-wide">
                <label>Address</label>
                <input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
              </div>
              {!form.staff_id && (
                <div className="is-wide">
                  <label>Initial password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className="workspace-helper">
              {form.staff_id
                ? "Email stays fixed for this account."
                : "Use the employee email and initial password shown here for the first sign-in."}
            </div>
            <div className="workspace-action-row" style={{ justifyContent: "flex-end" }}>
              <button className="btn-secondary" type="button" disabled={saving} onClick={closeModal}>
                Cancel
              </button>
              <button className="btn" type="button" disabled={saving} onClick={handleSave}>
                {saving ? (form.staff_id ? "Saving..." : "Creating...") : form.staff_id ? "Save changes" : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateTarget && (
        <div className="workspace-modal-overlay">
          <div className="workspace-modal-card">
            <h2 style={{ margin: 0 }}>Deactivate staff account</h2>
            <p className="workspace-note">
              Deactivate <strong>{deactivateTarget.name}</strong> only after all active facilities have been transferred away.
            </p>
            <div className="workspace-helper">
              Current managed facilities: {deactivateTarget.managedFacilityCount > 0 ? deactivateTarget.managedFacility : "None"}.
            </div>
            <div className="workspace-action-row" style={{ justifyContent: "flex-end" }}>
              <button className="btn-secondary" type="button" disabled={deactivating !== ""} onClick={() => setDeactivateTarget(null)}>
                Cancel
              </button>
              <button className="btn-danger" type="button" disabled={deactivating !== ""} onClick={handleDeactivate}>
                {deactivating === deactivateTarget.id ? "Deactivating..." : "Yes, deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
