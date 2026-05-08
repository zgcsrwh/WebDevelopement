// Admin page for facility management.
// The screen has filters, facility cards, and a drawer for create or edit work.
// It shows the real staff name for the person assigned to each facility.
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import "./AdminFacilities.css";
import {
  deleteFacility,
  getAdminFacilities,
  getAdminStaff,
  subscribeToAdminFacilities,
  subscribeToAdminStaff,
  upsertFacility,
} from "../../services/adminService";
import { formatEffectiveDateLabel } from "../../services/centreService";
import { useAuth } from "../../provider/AuthContext";
import { getActionErrorMessage, getErrorCode } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";
import { countMeaningfulCharacters } from "../../utils/text";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import PageLayout from "../../components/common/PageLayout";
import { Button } from "../../components/common/Button";

const SPORT_TYPE_OPTIONS = ["Badminton", "Basketball", "Swimming", "Soccer", "Tennis"];
const FACILITY_DESCRIPTION_MAX_LENGTH = 500;
const FACILITY_GUIDELINES_MAX_LENGTH = 500;

// Make the hour options for opening and closing dropdowns.
// The form only lets admin choose full hours.
function buildHourOptions(startHour, endHour) {
  return Array.from({ length: endHour - startHour + 1 }, (_, index) =>
    `${String(startHour + index).padStart(2, "0")}:00`,
  );
}

const START_HOUR_OPTIONS = buildHourOptions(6, 22);
const END_HOUR_OPTIONS = buildHourOptions(7, 23);

// Turn a stored hour into the value used by the dropdown.
// Valid numbers become full hour text.
// Bad values become blank so validation can catch them.
function formatHourInputValue(value) {
  const hour = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(hour)) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:00`;
}

// Read the selected dropdown value as an hour number.
// The form uses it to compare opening and closing time.
// Bad values are left for validation to handle.
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

// Make the blank form for the create facility drawer.
// Default values give admin a normal starting point.
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

// Make the error message for create or edit failures.
// Some backend errors need clearer wording for admin.
function getUpsertErrorMessage(error) {
  const code = getErrorCode(error);
  if (code === "not-found") {
    return "The selected facility could not be found.";
  }
  if (code === "failed-precondition") {
    return "Please keep one active staff member assigned to this facility.";
  }
  return getActionErrorMessage(error, "facility.save", "Unable to save this facility.");
}

// Make the error message for a failed delete action.
// The text is shown inside the confirm dialog.
function getDeleteErrorMessage(error) {
  const code = getErrorCode(error);
  if (code === "not-found") {
    return "This facility could not be found.";
  }
  return getActionErrorMessage(error, "facility.delete", "Unable to delete this facility.");
}

// Main facility management page for admins.
// It shows facility cards with status, sport type, and assigned staff.
// It also controls the create drawer, edit drawer, and delete dialog.
export default function AdminFacilities() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("");
  const [form, setForm] = useState(getEmptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Reload facility cards and staff dropdown options.
  // This runs after save and delete actions.
  // Staff options only include active or unassigned staff accounts.
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
        staffItems.filter((item) => {
          const status = String(item.status || "").toLowerCase();
          return String(item.role || "").toLowerCase() === "staff" && ["active", "unassigned"].includes(status);
        }),
      );
      setPageError("");
    } catch (loadError) {
      setPageError(getActionErrorMessage(loadError, "facility.load", "Unable to load facilities."));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  // Start live listeners for facilities and assignable staff.
  // Facility changes update the cards.
  // Staff changes update the assigned staff dropdown and displayed names.
  useEffect(() => {
    let active = true;
    let unsubscribeFacilities = () => {};
    let unsubscribeStaff = () => {};

    // Listen to the two collections used by this page.
    // Facilities and staff are separate because they change for different reasons.
    async function startSubscriptions() {
      setLoading(true);

      try {
        unsubscribeFacilities = await subscribeToAdminFacilities(
          sessionProfile,
          (facilityItems) => {
            if (!active) {
              return;
            }
            setItems(facilityItems);
            setPageError("");
            setLoading(false);
          },
          (subscriptionError) => {
            if (!active) {
              return;
            }
            setPageError(getActionErrorMessage(subscriptionError, "facility.load", "Unable to keep facilities up to date."));
            setLoading(false);
          },
        );

        unsubscribeStaff = await subscribeToAdminStaff(
          sessionProfile,
          (staffItems) => {
            if (!active) {
              return;
            }
            setStaffMembers(
              staffItems.filter((item) => {
                const status = String(item.status || "").toLowerCase();
                return String(item.role || "").toLowerCase() === "staff" && ["active", "unassigned"].includes(status);
              }),
            );
            setPageError("");
          },
          (subscriptionError) => {
            if (!active) {
              return;
            }
            setPageError(getActionErrorMessage(subscriptionError, "staff.load", "Unable to keep staff options up to date."));
          },
        );
      } catch (subscriptionError) {
        if (active) {
          setPageError(getActionErrorMessage(subscriptionError, "facility.load", "Unable to keep facilities up to date."));
          setLoading(false);
        }
      }
    }

    if (sessionProfile?.id) {
      startSubscriptions();
    }

    return () => {
      active = false;
      unsubscribeFacilities();
      unsubscribeStaff();
    };
  }, [sessionProfile]);

  // Build the facility cards after search and sport filters.
  // Filters only change what is shown on screen.
  const filteredItems = useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    return items.filter((item) => {
      const nameMatch = !query || String(item.name || "").toLowerCase().includes(query);
      const typeMatch = typeFilter === "all" || String(item.sportType || "").toLowerCase() === typeFilter;
      return nameMatch && typeMatch;
    });
  }, [items, searchInput, typeFilter]);

  const facilityTypeOptions = useMemo(() => {
    const types = items
      .map((item) => String(item.sportType || "").trim())
      .filter(Boolean)
      .filter((type, index, list) => list.findIndex((item) => item.toLowerCase() === type.toLowerCase()) === index)
      .sort((left, right) => left.localeCompare(right));
    return [{ value: "all", label: "All Types" }, ...types.map((type) => ({ value: type.toLowerCase(), label: type }))];
  }, [items]);

  const selectedFacility = useMemo(
    () => items.find((item) => item.id === form.facility_id) || null,
    [form.facility_id, items],
  );
  const isEditMode = drawerMode === "edit";
  const startHourOptions = useMemo(() => {
    const selectedEndHour = parseHourInputValue(form.end_time);
    return START_HOUR_OPTIONS.filter((option) => {
      const optionHour = parseHourInputValue(option);
      return Number.isNaN(selectedEndHour) || optionHour < selectedEndHour;
    });
  }, [form.end_time]);
  const endHourOptions = useMemo(() => {
    const selectedStartHour = parseHourInputValue(form.start_time);
    return END_HOUR_OPTIONS.filter((option) => {
      const optionHour = parseHourInputValue(option);
      return Number.isNaN(selectedStartHour) || optionHour > selectedStartHour;
    });
  }, [form.start_time]);

  // Clear facility filters and old page messages.
  // The drawer stays as it is because filtering is separate from editing.
  function clearFilters() {
    setSearchInput("");
    setTypeFilter("all");
    setPageError("");
    setPageMessage("");
  }

  // Update a long text field and check its real character count.
  // Description and usage guidelines both use this helper.
  // Too long text shows a field error and the old value stays.
  function handleLimitedTextField(field, value, maxLength, label) {
    if (countMeaningfulCharacters(value) > maxLength) {
      setFormErrors((previous) => ({
        ...previous,
        [field]: `${label} must be ${maxLength} characters or fewer.`,
      }));
      setFormError("");
      return;
    }

    setForm((previous) => ({ ...previous, [field]: value }));
    setFormErrors((previous) => ({ ...previous, [field]: "" }));
    setFormError("");
  }

  // Update the opening time in the drawer form.
  // If the old closing time is now wrong, clear it.
  // This stops admin from saving a bad time range.
  function handleStartTimeChange(value) {
    const nextStartHour = parseHourInputValue(value);
    setForm((previous) => {
      const previousEndHour = parseHourInputValue(previous.end_time);
      const shouldClearEnd =
        !Number.isNaN(nextStartHour) && !Number.isNaN(previousEndHour) && previousEndHour <= nextStartHour;
      return {
        ...previous,
        start_time: value,
        end_time: shouldClearEnd ? "" : previous.end_time,
      };
    });
    setFormErrors((previous) => ({ ...previous, start_time: "", end_time: "" }));
    setFormError("");
  }

  // Update the closing time in the drawer form.
  // If the old opening time is now wrong, clear it.
  // This keeps the time range valid before saving.
  function handleEndTimeChange(value) {
    const nextEndHour = parseHourInputValue(value);
    setForm((previous) => {
      const previousStartHour = parseHourInputValue(previous.start_time);
      const shouldClearStart =
        !Number.isNaN(nextEndHour) && !Number.isNaN(previousStartHour) && previousStartHour >= nextEndHour;
      return {
        ...previous,
        start_time: shouldClearStart ? "" : previous.start_time,
        end_time: value,
      };
    });
    setFormErrors((previous) => ({ ...previous, start_time: "", end_time: "" }));
    setFormError("");
  }

  // Open the drawer for a new facility.
  // The form starts from default values and old messages are cleared.
  function openCreateDrawer() {
    setDrawerMode("create");
    setForm(getEmptyForm());
    setFormErrors({});
    setFormError("");
    setPageError("");
    setPageMessage("");
    setDrawerOpen(true);
  }

  // Open the drawer for editing a facility.
  // The form is filled from the selected card.
  // Pending opening hours are shown when they exist.
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

  // Close the drawer when no save is running.
  // The form is reset so the next open starts clean.
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

  // Open the delete dialog for one facility.
  // The selected facility is saved for the confirm action.
  function openDeleteModal(item) {
    setDeleteTarget(item);
    setDeleteError("");
    setPageError("");
    setPageMessage("");
  }

  // Close the delete dialog when no delete request is running.
  // It stays open during submit so the action cannot be clicked twice.
  function closeDeleteModal() {
    if (deleting) {
      return;
    }

    setDeleteTarget(null);
    setDeleteError("");
  }

  // Check the facility form and build the backend payload.
  // Create mode needs full facility details.
  // Edit mode keeps fixed values from the selected facility and updates editable fields.
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
    const fixedName = String(selectedFacility?.name || form.name || "").trim();
    const fixedSportType = String(selectedFacility?.sportType || form.sport_type || "").trim();
    const fixedLocation = String(selectedFacility?.location || form.location || "").trim();
    const fixedCapacity = Number.parseInt(String(selectedFacility?.capacity ?? form.capacity ?? "").trim(), 10);
    const startTime = parseHourInputValue(form.start_time);
    const endTime = parseHourInputValue(form.end_time);

    if (isEditMode && !form.facility_id) {
      nextErrors.facility_id = "Please choose a facility before saving.";
    }

    if (isEditMode && !selectedFacility) {
      nextErrors.facility_id = "The selected facility could not be found. Please reopen this drawer.";
    }

    if (!isEditMode && !trimmedName) {
      nextErrors.name = "Facility name is required.";
    }

    if (!isEditMode && !trimmedSportType) {
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

    if (!isEditMode && !trimmedLocation) {
      nextErrors.location = "Location is required.";
    }

    if (!isEditMode && (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)) {
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

    const editablePayload = {
      description: trimmedDescription,
      usage_guidelines: trimmedGuidelines,
      start_time: startTime,
      end_time: endTime,
      staff_id: trimmedStaffId,
    };

    return {
      errors: nextErrors,
      payload:
        Object.keys(nextErrors).length > 0
          ? null
          : isEditMode
            ? {
                facility_id: form.facility_id,
                name: fixedName,
                sport_type: fixedSportType,
                capacity: fixedCapacity,
                location: fixedLocation,
                ...editablePayload,
              }
            : {
                name: trimmedName,
                sport_type: trimmedSportType,
                capacity,
                location: trimmedLocation,
                ...editablePayload,
              },
    };
  }

  // Save a new or edited facility.
  // The form is checked first and then sent to the backend.
  // After success, cards reload and the drawer closes.
  async function handleSave() {
    setFormError("");
    setPageError("");
    setPageMessage("");

    const { errors, payload } = validateForm();
    setFormErrors(errors);
    if (!payload) {
      if (errors.facility_id) {
        setFormError(errors.facility_id);
      }
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

  // Delete the selected facility or schedule its deletion.
  // The backend decides whether it happens now or on a later date.
  // The cards reload afterward so status text is current.
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

  const filterActions = (
      <Button className="admin-facilities-page__addButton" type="button" onClick={openCreateDrawer}>
        <Plus size={18} aria-hidden="true" />
        <span>Add New Facility</span>
      </Button>
  );

  return (
    <PageLayout
      className="admin-facilities-page"
      title="Facilities Management"
      subtitle="Update operating dates and manage facility statuses."
    >
      <FilterPanel columns={2} onClear={clearFilters} extraActions={filterActions}>
        <FilterField id="admin-facilities-search" label="">
          <input
            id="admin-facilities-search"
            type="text"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPageError("");
              setPageMessage("");
            }}
            placeholder="Search facilities..."
            aria-label="Search facilities"
          />
        </FilterField>

        <FilterField id="admin-facilities-type" label="">
          <select
            id="admin-facilities-type"
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPageError("");
              setPageMessage("");
            }}
            aria-label="Filter facility type"
          >
            {facilityTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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

      <section className="admin-facilities-page__tableCard">
        {loading ? (
          <div className="admin-facilities-page__empty">Loading facilities...</div>
        ) : filteredItems.length === 0 ? (
          <div className="admin-facilities-page__empty">No facilities match the current filters.</div>
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
                    <select
                      id="facility-start"
                      value={startHourOptions.includes(form.start_time) ? form.start_time : ""}
                      onChange={(event) => handleStartTimeChange(event.target.value)}
                    >
                      <option value="" disabled>
                        Select start time
                      </option>
                      {startHourOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {formErrors.start_time ? <p className="admin-facilities-page__fieldError">{formErrors.start_time}</p> : null}
                  </div>

                  <div className="admin-facilities-page__field">
                    <label htmlFor="facility-end">Time End (HH:00)</label>
                    <select
                      id="facility-end"
                      value={endHourOptions.includes(form.end_time) ? form.end_time : ""}
                      onChange={(event) => handleEndTimeChange(event.target.value)}
                    >
                      <option value="" disabled>
                        Select end time
                      </option>
                      {endHourOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
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
                  onChange={(event) =>
                    handleLimitedTextField(
                      "description",
                      event.target.value,
                      FACILITY_DESCRIPTION_MAX_LENGTH,
                      "Description",
                    )
                  }
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
                  onChange={(event) =>
                    handleLimitedTextField(
                      "usage_guidelines",
                      event.target.value,
                      FACILITY_GUIDELINES_MAX_LENGTH,
                      "Usage guidelines",
                    )
                  }
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Facility"
        description={deleteTarget ? `Are you sure you want to delete ${deleteTarget.name}?` : ""}
        tone="danger"
        pending={deleting}
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        onCancel={closeDeleteModal}
        onConfirm={handleDeleteConfirm}
      >
        <p>Future bookings will be handled by the backend once the scheduled removal takes effect.</p>
        {deleteError ? <p className="errorMessage">{deleteError}</p> : null}
      </ConfirmDialog>
    </PageLayout>
  );
}
