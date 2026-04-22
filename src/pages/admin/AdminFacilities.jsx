import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import {
  deleteFacility,
  getAdminFacilities,
  getAdminStaff,
  getFacilityStatusSummary,
  upsertFacility,
} from "../../services/adminService";
import { formatEffectiveDateLabel } from "../../services/centreService";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

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
  const selectedFacility = items.find((item) => item.id === form.facility_id) || null;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const typeMatch = filters.type === "All" || item.sportType === filters.type;
      const statusMatch = filters.status === "All" || item.status === filters.status;
      const searchMatch =
        !filters.search ||
        item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.location.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.assignedStaff.join(", ").toLowerCase().includes(filters.search.toLowerCase());

      return typeMatch && statusMatch && searchMatch;
    });
  }, [filters, items]);

  function openCreateDrawer() {
    setForm(getEmptyForm());
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
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
      start_time: item.pendingStartTime ?? item.startTime,
      end_time: item.pendingEndTime ?? item.endTime,
      location: item.location || "",
      staff_id: item.staffId || "",
    });
    setDrawerOpen(true);
  }

  async function handleSave() {
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const result = await upsertFacility(form, sessionProfile);
      await load();
      if (form.facility_id && result.effective_on) {
        setMessage(`Facility updated. New opening hours will take effect on ${formatEffectiveDateLabel(result.effective_on)}.`);
      } else {
        setMessage(form.facility_id ? "Facility updated successfully." : "Facility created successfully.");
      }
      closeDrawer();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save this facility."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setError("");
    setMessage("");
    setDeletingId(deleteTarget.id);

    try {
      const result = await deleteFacility(deleteTarget.id, sessionProfile);
      await load();
      setMessage(`${deleteTarget.name} will be removed on ${formatEffectiveDateLabel(result.effective_on)}.`);
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete this facility."));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="workspace-page">
      <section className="workspace-header">
        <div>
          <h1>Facilities management</h1>
          <p>Update real facility data, adjust assigned staff, and schedule operating-hour changes that take effect seven days later.</p>
        </div>
        <div className="workspace-toolbar">
          <input
            className="workspace-search"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search facility, location, or staff"
          />
          <button className="btn" type="button" onClick={openCreateDrawer}>
            Add facility
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
          <span>Facilities in catalogue</span>
          <strong>{items.length}</strong>
        </article>
        <article>
          <span>Open for booking</span>
          <strong>{items.filter((item) => item.status === "normal").length}</strong>
        </article>
        <article>
          <span>Unavailable or off shelf</span>
          <strong>{items.filter((item) => item.status !== "normal").length}</strong>
        </article>
      </section>

      <section className="workspace-surface">
        <div className="filter-grid">
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
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="workspace-surface">
        <h2>Current facilities</h2>
        <div className="workspace-table-wrap" style={{ marginTop: 18 }}>
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Facility name</th>
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
                    <div className="workspace-note" style={{ marginTop: 6 }}>
                      {item.location}
                    </div>
                  </td>
                  <td>{item.sportType}</td>
                  <td>
                    <span className={`status-pill ${statusTone(item.status)}`}>{item.statusLabel || item.status}</span>
                    {item.pendingChangeLabel && (
                      <div className="workspace-note" style={{ marginTop: 8 }}>
                        {item.pendingChangeLabel}
                      </div>
                    )}
                  </td>
                  <td>
                    {item.startTime}:00 - {item.endTime}:00
                    {item.pendingChangeType === "update" && (
                      <div className="workspace-note" style={{ marginTop: 8 }}>
                        Pending: {String(item.pendingStartTime).padStart(2, "0")}:00 - {String(item.pendingEndTime).padStart(2, "0")}:00
                      </div>
                    )}
                  </td>
                  <td>{item.capacity}</td>
                  <td>{item.assignedStaff?.length ? item.assignedStaff.join(", ") : "Unassigned"}</td>
                  <td>
                    <div className="workspace-action-row">
                      <button
                        className="btn-secondary"
                        type="button"
                        disabled={item.status === "deleted" || item.isDeletionScheduled}
                        onClick={() => loadForEdit(item)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-danger"
                        type="button"
                        disabled={item.status === "deleted" || item.isDeletionScheduled}
                        onClick={() => setDeleteTarget(item)}
                      >
                        {item.isDeletionScheduled ? "Scheduled" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredItems.length === 0 && <p style={{ marginTop: 16 }}>No facilities match the current admin filters.</p>}
      </section>

      {drawerOpen && (
        <>
          <div className="workspace-drawer-overlay" onClick={closeDrawer} />
          <div className="workspace-drawer-card">
            <div className="workspace-drawer-head">
              <h2 style={{ margin: 0 }}>{form.facility_id ? "Edit facility" : "Create facility"}</h2>
              <button className="btn-ghost" type="button" onClick={closeDrawer}>
                Close
              </button>
            </div>
            <div className="workspace-drawer-body">
              <div className="workspace-form-grid">
                <div className="is-wide">
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
                  <label>Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={form.capacity}
                    onChange={(event) => setForm((prev) => ({ ...prev, capacity: Number(event.target.value) }))}
                  />
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
                <div className="is-wide">
                  <label>Location</label>
                  <input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
                </div>
                <div className="is-wide">
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
                <div className="is-wide">
                  <label>Description</label>
                  <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
                </div>
                <div className="is-wide">
                  <label>Usage guidelines</label>
                  <textarea
                    value={form.usage_guidelines}
                    onChange={(event) => setForm((prev) => ({ ...prev, usage_guidelines: event.target.value }))}
                  />
                </div>
              </div>

              <div className="workspace-helper">
                {selectedFacility?.pendingChangeLabel
                  ? selectedFacility.pendingChangeLabel
                  : "Changing the opening hours schedules the new hours to take effect seven days later."}
              </div>

              {selectedFacility && (
                <div className="workspace-helper">
                  Status meaning: {getFacilityStatusSummary(selectedFacility.status)}.
                </div>
              )}
            </div>
            <div className="workspace-drawer-foot">
              <button className="btn-secondary" type="button" disabled={saving} onClick={closeDrawer}>
                Cancel
              </button>
              <button className="btn" type="button" disabled={saving} onClick={handleSave}>
                {saving ? "Saving..." : form.facility_id ? "Save changes" : "Create facility"}
              </button>
            </div>
          </div>
        </>
      )}

      {deleteTarget && (
        <div className="workspace-modal-overlay">
          <div className="workspace-modal-card">
            <h2 style={{ margin: 0 }}>Delete facility</h2>
            <p className="workspace-note">
              Delete <strong>{deleteTarget.name}</strong> and schedule the removal to take effect seven days from today.
            </p>
            <div className="workspace-helper">
              The employee assignment will be unbound when the deletion takes effect, and the historical records will remain.
            </div>
            <div className="workspace-action-row" style={{ justifyContent: "flex-end" }}>
              <button className="btn-secondary" type="button" disabled={deletingId !== ""} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn-danger" type="button" disabled={deletingId !== ""} onClick={handleDelete}>
                {deletingId === deleteTarget.id ? "Deleting..." : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
