import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import {
  deleteFacility,
  getAdminFacilities,
  getAdminStaff,
  getFacilityStatusSummary,
  upsertFacility,
} from "../../services/adminService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";

function getEmptyForm() {
  return {
    facility_id: "",
    name: "",
    sport_type: "Badminton",
    description: "",
    usage_guidelines: "",
    capacity: 4,
    start_time: 9,
    end_time: 18,
    location: "",
    staff_id: "",
    status: "normal",
  };
}

export default function AdminFacilities() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    type: "All",
    status: "All",
    search: "",
  });
  const [form, setForm] = useState(getEmptyForm());

  async function load() {
    try {
      const [facilityItems, staffItems] = await Promise.all([
        getAdminFacilities(sessionProfile),
        getAdminStaff(sessionProfile),
      ]);
      setItems(facilityItems);
      setStaffMembers(staffItems.filter((item) => item.role?.toLowerCase() === "staff" && item.status === "active"));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load admin facilities."));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        const [facilityItems, staffItems] = await Promise.all([
          getAdminFacilities(sessionProfile),
          getAdminStaff(sessionProfile),
        ]);
        if (!cancelled) {
          setItems(facilityItems);
          setStaffMembers(staffItems.filter((item) => item.role?.toLowerCase() === "staff" && item.status === "active"));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load admin facilities."));
        }
      }
    }

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const types = useMemo(() => ["All", ...new Set(items.map((item) => item.sportType))], [items]);
  const statuses = useMemo(() => ["All", ...new Set(items.map((item) => item.status))], [items]);

  const selectedStaff = staffMembers.find((member) => member.id === form.staff_id);
  const selectedFacility = items.find((item) => item.id === form.facility_id) || null;

  const filteredItems = items.filter((item) => {
    const typeMatch = filters.type === "All" || item.sportType === filters.type;
    const statusMatch = filters.status === "All" || item.status === filters.status;
    const searchMatch =
      !filters.search ||
      item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.location.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.assignedStaff.join(", ").toLowerCase().includes(filters.search.toLowerCase());

    return typeMatch && statusMatch && searchMatch;
  });

  function resetForm() {
    setForm(getEmptyForm());
  }

  function loadForEdit(item) {
    setError("");
    setMessage("");
    setForm({
      facility_id: item.id,
      name: item.name,
      sport_type: item.sportType,
      description: item.description || "",
      usage_guidelines: item.usageGuidelines || "",
      capacity: item.capacity,
      start_time: item.startTime,
      end_time: item.endTime,
      location: item.location || "",
      staff_id: item.staffId || "",
      status: item.status || "normal",
    });
  }

  function adjustCapacity(delta) {
    setForm((prev) => ({
      ...prev,
      capacity: Math.min(200, Math.max(1, Number(prev.capacity || 1) + delta)),
    }));
  }

  async function handleSave() {
    setError("");
    setMessage("");
    try {
      await upsertFacility(form, sessionProfile);
      await load();
      setMessage(form.facility_id ? "Facility updated successfully." : "Facility created successfully.");
      resetForm();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save this facility."));
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete ${item.name}? This will remove the facility from the member catalogue and reject affected bookings.`)) {
      return;
    }

    setError("");
    setMessage("");
    try {
      await deleteFacility(item.id, sessionProfile);
      await load();
      setMessage(`${item.name} has been deleted from service.`);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete this facility."));
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Facility management</h1>
          <p>Create, edit, delete, and reassign facilities while keeping staff ownership and status changes aligned with the real database.</p>
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
          <span className="soft-text">Facilities in catalogue</span>
          <strong>{items.length}</strong>
        </article>
        <article className="stat-card">
          <span className="soft-text">Open for booking</span>
          <strong>{items.filter((item) => item.status === "normal").length}</strong>
        </article>
        <article className="stat-card">
          <span className="soft-text">Unavailable or off shelf</span>
          <strong>{items.filter((item) => item.status !== "normal").length}</strong>
        </article>
      </section>

      <section className="split-layout">
        <article className="form-card">
          <h2>{form.facility_id ? "Edit facility" : "Create facility"}</h2>
          <p className="soft-text">
            Every active facility must have one assigned staff member. Repairs switch the status to fixing automatically, while unstaffed facilities should use outdate.
          </p>

          <div className="field-grid" style={{ marginTop: 18 }}>
            <div className="field-span">
              <label>Facility name</label>
              <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div>
              <label>Sport type</label>
              <select value={form.sport_type} onChange={(event) => setForm((prev) => ({ ...prev, sport_type: event.target.value }))}>
                <option>Badminton</option>
                <option>Basketball</option>
                <option>Swimming</option>
                <option>Soccer</option>
                <option>Tennis</option>
              </select>
            </div>
            <div>
              <label>Status</label>
              <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="normal">Normal</option>
                <option value="fixing">Fixing</option>
                <option value="outdate">Off shelf</option>
              </select>
            </div>
            <div>
              <label>Capacity</label>
              <div className="inline-actions">
                <button className="btn-secondary" type="button" onClick={() => adjustCapacity(-1)}>
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={form.capacity}
                  onChange={(event) => setForm((prev) => ({ ...prev, capacity: Number(event.target.value) }))}
                />
                <button className="btn-secondary" type="button" onClick={() => adjustCapacity(1)}>
                  +
                </button>
              </div>
              <p className="soft-text" style={{ marginTop: 8 }}>Enter a whole number from 1 to 200.</p>
            </div>
            <div>
              <label>Opening hour</label>
              <input
                type="number"
                min="6"
                max="22"
                value={form.start_time}
                onChange={(event) => setForm((prev) => ({ ...prev, start_time: Number(event.target.value) }))}
              />
            </div>
            <div>
              <label>Closing hour</label>
              <input
                type="number"
                min="7"
                max="23"
                value={form.end_time}
                onChange={(event) => setForm((prev) => ({ ...prev, end_time: Number(event.target.value) }))}
              />
            </div>
            <div className="field-span">
              <label>Location</label>
              <input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
            </div>
            <div className="field-span">
              <label>Assigned staff</label>
              <select value={form.staff_id} onChange={(event) => setForm((prev) => ({ ...prev, staff_id: event.target.value }))}>
                <option value="">Select responsible staff member</option>
                {staffMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="field-span">
              <label>Description</label>
              <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            <div className="field-span">
              <label>Usage guidelines</label>
              <textarea
                value={form.usage_guidelines}
                onChange={(event) => setForm((prev) => ({ ...prev, usage_guidelines: event.target.value }))}
              />
            </div>
            <div className="field-span">
              <div className="helper-box">
                <p className="soft-text">
                  {selectedStaff
                    ? `Responsible staff member: ${selectedStaff.name}. Current managed facilities: ${selectedStaff.managedFacility}.`
                    : "Select an active staff member before saving."}
                </p>
              </div>
            </div>
            <div className="field-span form-actions">
              <button className="btn" type="button" onClick={handleSave}>
                {form.facility_id ? "Save changes" : "Create facility"}
              </button>
              <button className="btn-secondary" type="button" onClick={resetForm}>
                Clear form
              </button>
            </div>
          </div>
        </article>

        <article className="detail-card">
          <h2>Admin reminders</h2>
          <ul className="card-list" style={{ marginTop: 18 }}>
            <li className="mini-card">Deleting a facility removes it from the member catalogue and rejects affected bookings.</li>
            <li className="mini-card">Repairs move the facility into fixing automatically until all pending repairs are resolved.</li>
            <li className="mini-card">If a staff member is deactivated and no replacement is assigned, the facility should move to off shelf.</li>
          </ul>

          {selectedFacility && (
            <div className="helper-box" style={{ marginTop: 18 }}>
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>{selectedFacility.name}</h3>
              <p className="soft-text">{selectedFacility.description}</p>
              <div className="tags-row" style={{ marginTop: 12 }}>
                <span className="tag">{selectedFacility.sportType}</span>
                <span className="tag">Capacity {selectedFacility.capacity}</span>
                <span className="tag">
                  {selectedFacility.startTime}:00 - {selectedFacility.endTime}:00
                </span>
              </div>
              <p className="soft-text" style={{ marginTop: 12 }}>
                Status meaning: {getFacilityStatusSummary(selectedFacility.status)}.
              </p>
            </div>
          )}
        </article>
      </section>

      <section className="table-card">
        <h2>Filters</h2>
        <div className="filter-grid" style={{ marginTop: 16, marginBottom: 22 }}>
          <div>
            <label>Sport type</label>
            <select value={filters.type} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status === "All" ? "All" : status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Search</label>
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search facility, location, or staff"
            />
          </div>
        </div>

        <h2>Current facilities</h2>
        <table style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Hours</th>
              <th>Capacity</th>
              <th>Assigned staff</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <div className="soft-text" style={{ marginTop: 6 }}>
                    {item.location}
                  </div>
                </td>
                <td>{item.sportType}</td>
                <td>
                  <span className={`status-pill ${statusTone(item.status)}`}>{item.statusLabel || item.status}</span>
                </td>
                <td>
                  {item.startTime}:00 - {item.endTime}:00
                </td>
                <td>{item.capacity}</td>
                <td>{item.assignedStaff?.length ? item.assignedStaff.join(", ") : "Unassigned"}</td>
                <td>
                  <div className="inline-actions">
                    <button className="btn-secondary" type="button" onClick={() => loadForEdit(item)}>
                      Edit
                    </button>
                    <button className="btn-danger" type="button" onClick={() => handleDelete(item)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {filteredItems.length === 0 && !error && (
        <section className="page-panel">
          <p>No facilities match the current admin filters.</p>
        </section>
      )}
    </div>
  );
}
