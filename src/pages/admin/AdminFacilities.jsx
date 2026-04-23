import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import "./AdminFacilities.css";
import { deleteFacility, getAdminFacilities, getAdminStaff, upsertFacility } from "../../services/adminService";
import { formatEffectiveDateLabel } from "../../services/centreService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";
import { countMeaningfulCharacters } from "../../utils/text";

const SPORT_TYPE_OPTIONS = ["Badminton", "Basketball", "Swimming", "Soccer", "Tennis"];
const FACILITY_DESCRIPTION_MAX_LENGTH = 500;
const FACILITY_GUIDELINES_MAX_LENGTH = 500;

function formatHourInputValue(value) {
  const hour = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(hour)) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:00`;
}

function parseHourInputValue(value) {
  const source = String(value || "").trim();
  if (!source) {
    return Number.NaN;
  }

  const match = source.match(/^(\d{2}):00$/);
  if (!match) {
    return Number.NaN;
  }

  return Number.parseInt(match[1], 10);
}

function getEmptyForm() {
  return {
    facility_id: "",
    name: "",
    sport_type: SPORT_TYPE_OPTIONS[0],
    description: "",
    usage_guidelines: "",
    capacity: "4",
    location: "",
    start_time: "09:00",
    end_time: "18:00",
    staff_id: "",
  };
}

function getUpsertErrorMessage(error) {
  const code = getErrorCode(error);
  if (code === "not-found") {
    return "The selected facility could not be found.";
  }
  if (code === "failed-precondition") {
    return "Please keep one active staff member assigned to this facility.";
  }
  return getErrorMessage(error, "Unable to save this facility.");
}

function getDeleteErrorMessage(error) {
  const code = getErrorCode(error);
  if (code === "not-found") {
    return "This facility could not be found.";
  }
  return getErrorMessage(error, "Unable to delete this facility.");
}

export default function AdminFacilities() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("");
  const [form, setForm] = useState(getEmptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function refreshFacilities({ showLoader = false } = {}) {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const [facilityItems, staffItems] = await Promise.all([
        getAdminFacilities(sessionProfile),
        getAdminStaff(sessionProfile),
      ]);

      setItems(facilityItems);
      setStaffMembers(
        staffItems.filter(
          (item) =>
            String(item.role || "").toLowerCase() === "staff" &&
            String(item.status || "").toLowerCase() === "active",
        ),
      );
      setPageError("");
    } catch (loadError) {
      setPageError(getErrorMessage(loadError, "Unable to load facilities."));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    refreshFacilities({ showLoader: true });
  }, [sessionProfile]);

  const filteredItems = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((item) => String(item.name || "").toLowerCase().includes(query));
  }, [appliedSearch, items]);

  const selectedFacility = useMemo(
    () => items.find((item) => item.id === form.facility_id) || null,
    [form.facility_id, items],
  );
  const isEditMode = drawerMode === "edit";

  function applySearch() {
    setPageMessage("");
    if (!searchInput.trim()) {
      setPageError("Please enter a facility name before searching.");
      return;
    }

    setAppliedSearch(searchInput.trim());
    setPageError("");
  }

  function openCreateDrawer() {
    setDrawerMode("create");
    setForm(getEmptyForm());
    setFormErrors({});
    setFormError("");
    setPageError("");
    setPageMessage("");
    setDrawerOpen(true);
  }

  function openEditDrawer(item) {
    setDrawerMode("edit");
    setForm({
      facility_id: item.id,
      name: item.name || "",
      sport_type: item.sportType || SPORT_TYPE_OPTIONS[0],
      description: item.description || "",
      usage_guidelines: item.usageGuidelines || "",
      capacity: String(item.capacity ?? ""),
      location: item.location || "",
      start_time: formatHourInputValue(item.pendingStartTime ?? item.startTime),
      end_time: formatHourInputValue(item.pendingEndTime ?? item.endTime),
      staff_id: item.staffId || "",
    });
    setFormErrors({});
    setFormError("");
    setPageError("");
    setPageMessage("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) {
      return;
    }

    setDrawerOpen(false);
    setDrawerMode("");
    setForm(getEmptyForm());
    setFormErrors({});
    setFormError("");
  }

  function openDeleteModal(item) {
    setDeleteTarget(item);
    setDeleteError("");
    setPageError("");
    setPageMessage("");
  }

  function closeDeleteModal() {
    if (deleting) {
      return;
    }

    setDeleteTarget(null);
    setDeleteError("");
  }

  function validateForm() {
    const nextErrors = {};
    const trimmedName = String(form.name || "").trim();
    const trimmedSportType = String(form.sport_type || "").trim();
    const trimmedDescription = String(form.description || "").trim();
    const trimmedGuidelines = String(form.usage_guidelines || "").trim();
    const descriptionCharacterCount = countMeaningfulCharacters(form.description);
    const guidelinesCharacterCount = countMeaningfulCharacters(form.usage_guidelines);
    const trimmedLocation = String(form.location || "").trim();
    const trimmedStaffId = String(form.staff_id || "").trim();
    const capacity = Number.parseInt(String(form.capacity || "").trim(), 10);
    const startTime = parseHourInputValue(form.start_time);
    const endTime = parseHourInputValue(form.end_time);

    if (!trimmedName) {
      nextErrors.name = "Facility name is required.";
    }

    if (!trimmedSportType) {
      nextErrors.sport_type = "Sport type is required.";
    }

    if (!trimmedDescription) {
      nextErrors.description = "Description is required.";
    } else if (descriptionCharacterCount > FACILITY_DESCRIPTION_MAX_LENGTH) {
      nextErrors.description = `Description must be ${FACILITY_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
    }

    if (!trimmedGuidelines) {
      nextErrors.usage_guidelines = "Usage guidelines are required.";
    } else if (guidelinesCharacterCount > FACILITY_GUIDELINES_MAX_LENGTH) {
      nextErrors.usage_guidelines = `Usage guidelines must be ${FACILITY_GUIDELINES_MAX_LENGTH} characters or fewer.`;
    }

    if (!trimmedLocation) {
      nextErrors.location = "Location is required.";
    }

    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
      nextErrors.capacity = "Capacity must be a whole number from 1 to 200.";
    }

    if (!form.start_time) {
      nextErrors.start_time = "Opening time is required.";
    } else if (Number.isNaN(startTime) || startTime < 6 || startTime > 22) {
      nextErrors.start_time = "Opening time must use whole hours between 06:00 and 22:00.";
    }

    if (!form.end_time) {
      nextErrors.end_time = "Closing time is required.";
    } else if (Number.isNaN(endTime) || endTime < 7 || endTime > 23) {
      nextErrors.end_time = "Closing time must use whole hours between 07:00 and 23:00.";
    }

    if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime <= startTime) {
      nextErrors.end_time = "Closing time must be later than opening time.";
    }

    if (!trimmedStaffId) {
      nextErrors.staff_id = "Please assign one staff member.";
    }

    return {
      errors: nextErrors,
      payload:
        Object.keys(nextErrors).length > 0
          ? null
          : {
              facility_id: form.facility_id,
              name: trimmedName,
              sport_type: trimmedSportType,
              description: trimmedDescription,
              usage_guidelines: trimmedGuidelines,
              capacity,
              location: trimmedLocation,
              start_time: startTime,
              end_time: endTime,
              staff_id: trimmedStaffId,
            },
    };
  }

  async function handleSave() {
    setFormError("");
    setPageError("");
    setPageMessage("");

    const { errors, payload } = validateForm();
    setFormErrors(errors);
    if (!payload) {
      return;
    }

    setSaving(true);
    try {
      const result = await upsertFacility(payload, sessionProfile);
      await refreshFacilities();
      closeDrawer();
      if (payload.facility_id) {
        setPageMessage(
          result.effective_on
            ? `Facility updated. New opening hours will take effect on ${formatEffectiveDateLabel(result.effective_on)}.`
            : "Facility updated successfully.",
        );
      } else {
        setPageMessage("Facility created successfully.");
      }
    } catch (saveError) {
      setFormError(getUpsertErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }

    setDeleteError("");
    setPageError("");
    setPageMessage("");
    setDeleting(true);

    try {
      const result = await deleteFacility(deleteTarget.id, sessionProfile);
      await refreshFacilities();
      setDeleteTarget(null);
      setPageMessage(
        result.effective_on
          ? `${deleteTarget.name} will be removed on ${formatEffectiveDateLabel(result.effective_on)}.`
          : `${deleteTarget.name} deletion was submitted successfully.`,
      );
    } catch (deleteActionError) {
      setDeleteError(getDeleteErrorMessage(deleteActionError));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-facilities-page">
      <section className="admin-facilities-page__hero">
        <div>
          <h1>Facilities Management</h1>
          <p>Update operating dates and manage facility statuses.</p>
        </div>

        <div className="admin-facilities-page__toolbar">
          <div className="admin-facilities-page__search">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search facilities..."
              aria-label="Search facilities"
            />
            <button className="btn-secondary admin-facilities-page__searchButton" type="button" onClick={applySearch}>
              <Search size={18} aria-hidden="true" />
              <span>Search</span>
            </button>
          </div>

          <button className="btn admin-facilities-page__addButton" type="button" onClick={openCreateDrawer}>
            <Plus size={18} aria-hidden="true" />
            <span>Add New Facility</span>
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

      <section className="admin-facilities-page__tableCard">
        {loading ? (
          <div className="admin-facilities-page__empty">Loading facilities...</div>
        ) : filteredItems.length === 0 ? (
          <div className="admin-facilities-page__empty">No facilities match the current search.</div>
        ) : (
          <div className="admin-facilities-page__tableWrap">
            <table className="admin-facilities-page__table">
              <thead>
                <tr>
                  <th>Facility Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Capacity</th>
                  <th>Assigned Staff</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const deleteDisabled = item.status === "deleted" || item.isDeletionScheduled;
                  const editDisabled = item.status === "deleted" || item.isDeletionScheduled;

                  return (
                    <tr key={item.id}>
                      <td className="admin-facilities-page__nameCell">{item.name || "Unknown facility"}</td>
                      <td>{item.sportType || "Unknown"}</td>
                      <td>
                        <span className={`status-pill ${statusTone(item.status)}`}>{item.status || "unknown"}</span>
                      </td>
                      <td>{item.capacity ?? "-"}</td>
                      <td>
                        {item.assignedStaff?.length ? (
                          <span className="admin-facilities-page__staffChip">{item.assignedStaff[0]}</span>
                        ) : (
                          <span className="admin-facilities-page__none">None</span>
                        )}
                      </td>
                      <td>
                        <div className="admin-facilities-page__actions">
                          <button
                            className="admin-facilities-page__editButton"
                            type="button"
                            disabled={editDisabled}
                            onClick={() => openEditDrawer(item)}
                          >
                            Edit
                          </button>
                          <button
                            className="admin-facilities-page__deleteButton"
                            type="button"
                            disabled={deleteDisabled}
                            onClick={() => openDeleteModal(item)}
                          >
                            {item.isDeletionScheduled ? "Scheduled" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <>
          <div className="admin-facilities-page__drawerOverlay" onClick={closeDrawer} />
          <div className="admin-facilities-page__drawer">
            <div className="admin-facilities-page__drawerHead">
              <h2>{isEditMode ? "Update Facility" : "Create Facility"}</h2>
              <button className="admin-facilities-page__closeButton" type="button" onClick={closeDrawer} aria-label="Close facility drawer">
                <X size={28} aria-hidden="true" />
              </button>
            </div>

            <div className="admin-facilities-page__drawerBody">
              {formError ? <p className="errorMessage">{formError}</p> : null}

              {isEditMode ? (
                <>
                  <div className="admin-facilities-page__summaryCard">
                    <div className="admin-facilities-page__summaryGrid">
                      <div>
                        <span className="admin-facilities-page__summaryLabel">Facility Name</span>
                        <strong>{form.name || "-"}</strong>
                      </div>
                      <div>
                        <span className="admin-facilities-page__summaryLabel">Sport Type</span>
                        <strong>{form.sport_type || "-"}</strong>
                      </div>
                      <div>
                        <span className="admin-facilities-page__summaryLabel">Capacity</span>
                        <strong>{form.capacity || "-"}</strong>
                      </div>
                      <div>
                        <span className="admin-facilities-page__summaryLabel">Location</span>
                        <strong>{form.location || "-"}</strong>
                      </div>
                    </div>
                  </div>

                  <p className="admin-facilities-page__helper">
                    Name, type, capacity, and location are fixed here. This drawer only updates operating hours, descriptions, and the assigned staff member.
                  </p>
                </>
              ) : (
                <>
                  <div className="admin-facilities-page__field">
                    <label htmlFor="facility-name">Facility Name</label>
                    <input
                      id="facility-name"
                      type="text"
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Enter facility name"
                    />
                    {formErrors.name ? <p className="admin-facilities-page__fieldError">{formErrors.name}</p> : null}
                  </div>

                  <div className="admin-facilities-page__field">
                    <label htmlFor="facility-sport">Sport Type</label>
                    <select
                      id="facility-sport"
                      value={form.sport_type}
                      onChange={(event) => setForm((prev) => ({ ...prev, sport_type: event.target.value }))}
                    >
                      {SPORT_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {formErrors.sport_type ? <p className="admin-facilities-page__fieldError">{formErrors.sport_type}</p> : null}
                  </div>

                  <div className="admin-facilities-page__field">
                    <label htmlFor="facility-capacity">Capacity</label>
                    <input
                      id="facility-capacity"
                      type="number"
                      min="1"
                      max="200"
                      value={form.capacity}
                      onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
                      placeholder="Enter capacity"
                    />
                    {formErrors.capacity ? <p className="admin-facilities-page__fieldError">{formErrors.capacity}</p> : null}
                  </div>

                  <div className="admin-facilities-page__field">
                    <label htmlFor="facility-location">Location</label>
                    <input
                      id="facility-location"
                      type="text"
                      value={form.location}
                      onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Enter location"
                    />
                    {formErrors.location ? <p className="admin-facilities-page__fieldError">{formErrors.location}</p> : null}
                  </div>
                </>
              )}

              <div className="admin-facilities-page__timeGrid">
                <div className="admin-facilities-page__field">
                  <label htmlFor="facility-start">Time Start (HH:00)</label>
                  <input
                    id="facility-start"
                    type="time"
                    step="3600"
                    value={form.start_time}
                    onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))}
                  />
                  {formErrors.start_time ? <p className="admin-facilities-page__fieldError">{formErrors.start_time}</p> : null}
                </div>

                <div className="admin-facilities-page__field">
                  <label htmlFor="facility-end">Time End (HH:00)</label>
                  <input
                    id="facility-end"
                    type="time"
                    step="3600"
                    value={form.end_time}
                    onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))}
                  />
                  {formErrors.end_time ? <p className="admin-facilities-page__fieldError">{formErrors.end_time}</p> : null}
                </div>
              </div>

              <p className="admin-facilities-page__helper">
                Opening-hour changes are handled with the existing seven-day rule. The separate operating end date field will be added after backend alignment.
              </p>

              {selectedFacility?.pendingChangeLabel ? (
                <p className="admin-facilities-page__helper">{selectedFacility.pendingChangeLabel}</p>
              ) : null}

              <div className="admin-facilities-page__field">
                <label htmlFor="facility-description">Description</label>
                <textarea
                  id="facility-description"
                  rows="5"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Brief description of the facility..."
                />
                <p className="admin-facilities-page__fieldHint">
                  {countMeaningfulCharacters(form.description)}/{FACILITY_DESCRIPTION_MAX_LENGTH} meaningful characters
                </p>
                {formErrors.description ? <p className="admin-facilities-page__fieldError">{formErrors.description}</p> : null}
              </div>

              <div className="admin-facilities-page__field">
                <label htmlFor="facility-guidelines">Usage Guidelines</label>
                <textarea
                  id="facility-guidelines"
                  rows="5"
                  value={form.usage_guidelines}
                  onChange={(event) => setForm((prev) => ({ ...prev, usage_guidelines: event.target.value }))}
                  placeholder="Rules and regulations..."
                />
                <p className="admin-facilities-page__fieldHint">
                  {countMeaningfulCharacters(form.usage_guidelines)}/{FACILITY_GUIDELINES_MAX_LENGTH} meaningful characters
                </p>
                {formErrors.usage_guidelines ? (
                  <p className="admin-facilities-page__fieldError">{formErrors.usage_guidelines}</p>
                ) : null}
              </div>

              <div className="admin-facilities-page__field">
                <label htmlFor="facility-staff">Assigned Staff (Select One)</label>
                <select
                  id="facility-staff"
                  value={form.staff_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, staff_id: event.target.value }))}
                >
                  <option value="">Select one staff member</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
                {formErrors.staff_id ? <p className="admin-facilities-page__fieldError">{formErrors.staff_id}</p> : null}
              </div>
            </div>

            <div className="admin-facilities-page__drawerFooter">
              <button className="btn-secondary" type="button" disabled={saving} onClick={closeDrawer}>
                Cancel
              </button>
              <button className="btn" type="button" disabled={saving} onClick={handleSave}>
                {saving ? "Saving..." : isEditMode ? "Save Changes" : "Create Facility"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {deleteTarget ? (
        <div className="workspace-modal-overlay">
          <div className="admin-facilities-page__confirmCard">
            <h2>Delete Facility</h2>
            <p className="admin-facilities-page__confirmText">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
            </p>
            <p className="admin-facilities-page__confirmNote">
              Future bookings will be handled by the backend once the scheduled removal takes effect.
            </p>
            {deleteError ? <p className="errorMessage">{deleteError}</p> : null}
            <div className="admin-facilities-page__confirmActions">
              <button className="btn-secondary" type="button" disabled={deleting} onClick={closeDeleteModal}>
                Cancel
              </button>
              <button className="btn-danger" type="button" disabled={deleting} onClick={handleDeleteConfirm}>
                {deleting ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
