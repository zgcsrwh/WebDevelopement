import { useEffect, useState } from "react";
import "../pageStyles.css";
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

  const filteredItems = items.filter((item) => {
    const roleMatch = filters.role === "All" || formatRole(item.role) === filters.role;
    const statusMatch = filters.status === "All" || item.status === filters.status;
    const searchMatch =
      !filters.search ||
      item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.email.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.managedFacility.toLowerCase().includes(filters.search.toLowerCase());
    return roleMatch && statusMatch && searchMatch;
  });

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
  }

  async function handleSave() {
    setError("");
    setMessage("");

    if (!form.name.trim()) {
      setError("Please complete the staff member's name before saving.");
      return;
    }

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
      setForm(getEmptyForm());
    } catch (saveError) {
      setError(getErrorMessage(saveError, form.staff_id ? "Unable to update this staff account." : "Unable to create this staff account."));
    }
  }

  async function handleDeactivate(item) {
    if (!window.confirm(`Deactivate ${item.name}? Any facilities still assigned to this staff member will be moved off shelf until a replacement is assigned.`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await disableStaffAccount(item.id, sessionProfile);
      await refresh();
      setMessage(`${item.name} has been deactivated and their assigned facilities were taken off shelf if needed.`);
    } catch (deactivateError) {
      setError(getErrorMessage(deactivateError, "Unable to deactivate this staff account."));
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Staff management</h1>
          <p>Create employee accounts, inspect managed facilities, and deactivate staff while automatically handling affected facilities.</p>
        </div>
      </section>

      {error && (
        <section className="page-panel">
          <p className="errorMessage">{error}</p>
        </section>
      )}
      {message && (
        <section className="page-panel">
          <p className="successMessage">{message}</p>
        </section>
      )}

      <section className="stats-grid">
        <article className="stat-card">
          <span className="soft-text">Total admin and staff records</span>
          <strong>{items.length}</strong>
        </article>
        <article className="stat-card">
          <span className="soft-text">Active staff members</span>
          <strong>{items.filter((item) => item.role?.toLowerCase() === "staff" && item.status === "active").length}</strong>
        </article>
        <article className="stat-card">
          <span className="soft-text">Admin accounts</span>
          <strong>{items.filter((item) => item.role?.toLowerCase() === "admin").length}</strong>
        </article>
      </section>

      <section className="split-layout">
        <article className="form-card">
          <h2>{form.staff_id ? "Edit staff account" : "Create staff account"}</h2>
          <p className="soft-text">
            Public registration only creates member accounts. Staff accounts are created here and can log in immediately with the generated credentials.
          </p>

          <div className="field-grid" style={{ marginTop: 18 }}>
            <div className="field-span">
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
            <div className="field-span">
              <label>Address</label>
              <input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
            </div>
            {!form.staff_id && (
              <div className="field-span">
                <label>Initial password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </div>
            )}
            <div className="field-span">
              <div className="helper-box">
                <p className="soft-text">
                  {form.staff_id
                    ? "Email is fixed to keep the login credential aligned with Firebase Auth. You can still update the name, date of birth, and address here."
                    : "Once the account is created, the staff member can sign in directly using this email and password."}
                </p>
              </div>
            </div>
            <div className="field-span form-actions">
              <button className="btn" type="button" onClick={handleSave}>
                {form.staff_id ? "Save changes" : "Create account"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setForm(getEmptyForm())}>
                {form.staff_id ? "Cancel edit" : "Clear form"}
              </button>
            </div>
          </div>
        </article>

        <article className="detail-card">
          <h2>Admin notes</h2>
          <ul className="card-list" style={{ marginTop: 18 }}>
            <li className="mini-card">Role is fixed by the admin workflow. Public registration never creates staff or admin identities.</li>
            <li className="mini-card">Deactivating a staff member automatically removes them from active facilities.</li>
            <li className="mini-card">Facilities without staff are moved off shelf until another staff member is assigned.</li>
          </ul>
        </article>
      </section>

      <section className="table-card">
        <h2>Filters</h2>
        <div className="filter-grid" style={{ marginTop: 16, marginBottom: 22 }}>
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
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label>Search</label>
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search by staff member, email, or managed facility"
            />
          </div>
        </div>

        <h2>Team members</h2>
        <table style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Managed facilities</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <div className="soft-text" style={{ marginTop: 6 }}>
                    {item.address || "Address not available"}
                  </div>
                </td>
                <td>{item.email}</td>
                <td>{item.roleLabel || formatRole(item.role)}</td>
                <td>
                  <span className={`status-pill ${statusTone(item.status)}`}>{item.statusLabel || item.status}</span>
                </td>
                <td>{item.joinedDate || "Not available"}</td>
                <td>
                  {item.managedFacility}
                  {item.managedFacilityCount > 0 && (
                    <div className="soft-text" style={{ marginTop: 6 }}>
                      {item.managedFacilityCount} facility record(s)
                    </div>
                  )}
                </td>
                <td>
                  <div className="inline-actions">
                    <button className="btn-secondary" type="button" onClick={() => loadForEdit(item)}>
                      Edit
                    </button>
                    {item.role?.toLowerCase() === "staff" && (
                      <button className="btn-danger" type="button" onClick={() => handleDeactivate(item)}>
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {filteredItems.length === 0 && !error && (
        <section className="page-panel">
          <p>No staff accounts match the current filters.</p>
        </section>
      )}
    </div>
  );
}
