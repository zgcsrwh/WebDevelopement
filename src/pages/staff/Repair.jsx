// Staff use this page to work on repair reports from members.
// The screen has filters, ticket cards, and a detail panel for the open ticket.
// Pending tickets can be resolved here and finished tickets are only for checking.
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import "../pageStyles.css";
import "./Repair.css";
import { getAllFacilityFilterOptions } from "../../services/bookingService";
import { getRepairTickets, subscribeToRepairTickets, updateTicketStatus } from "../../services/reportService";
import { useAuth } from "../../provider/AuthContext";
import { getActionErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { formatStaffCardTimestamp, formatStaffDateTime, getDateInputMaxValue, toDateInputValue } from "../../utils/staffPages";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";
import StaffListCard from "../../components/staff/StaffListCard";

// Put the newest repair reports at the top.
// Staff usually need to see the latest problem first.
// Empty times are treated like blank text so the page does not break.
function sortRepairItems(items = []) {
  return [...items].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

// Make the repair status text shown in the staff list.
// Stored values are lowercase.
// The list shows cleaner words that are easier to read.
function getRepairStatusLabel(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pending") {
    return "Pending";
  }

  if (normalized === "resolved") {
    return "Resolved";
  }

  if (normalized === "terminated") {
    return "Terminated";
  }

  return normalized || "unknown";
}

// Make the completed time text in the ticket details.
// Pending tickets do not have a completed time yet.
// The detail panel shows a dash when there is no finished time.
function getResolvedAtLabel(item) {
  return item.completedAt ? formatStaffDateTime(item.completedAt) : "-";
}

// Main repair ticket page for staff.
// It looks like a filter bar above ticket cards with one detail panel.
// Staff use it to read reports and resolve pending tickets.
export default function Repair() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [filters, setFilters] = useState({
    ticketId: "",
    facility: "",
    date: "",
    status: "",
  });
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [resolvingId, setResolvingId] = useState("");

  const staffCreatedDate = useMemo(
    () => toDateInputValue(sessionProfile?.created_at || sessionProfile?.createdAt),
    [sessionProfile?.createdAt, sessionProfile?.created_at],
  );
  const maxFilterDate = useMemo(() => getDateInputMaxValue(0), []);

  // Reload tickets after staff resolve one or need fresh data.
  // Facility options are loaded at the same time for the filter.
  // The same ticket stays open if it is still in the list.
  async function refresh(preferredId = "") {
    setLoading(true);
    try {
      // Load tickets and facility names together.
      // The ticket list and facility filter both need fresh data.
      const [ticketItems, facilityItems] = await Promise.all([
        getRepairTickets(sessionProfile),
        getAllFacilityFilterOptions(),
      ]);
      // Staff can still read resolved and terminated tickets.
      // Only pending tickets can show the resolve action.
      const nextItems = sortRepairItems(
        ticketItems.filter((item) => ["pending", "resolved", "terminated"].includes(item.status)),
      );

      setItems(nextItems);
      setFacilityOptions(facilityItems);
      setSelectedId((current) => {
        // Keep the same ticket open after refresh when it still exists.
        // Close the panel when the ticket leaves the list.
        const candidate = preferredId || current;
        if (candidate && nextItems.some((item) => item.id === candidate)) {
          return candidate;
        }
        return "";
      });
      setPageError("");
    } catch (loadError) {
      setPageError(getActionErrorMessage(loadError, "repair.load", "Unable to load repair tickets."));
    } finally {
      setLoading(false);
    }
  }

  // Start live updates for repair tickets.
  // Repair changes update status and description.
  // Facility and member changes update the names in the cards.
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    // Load facility names for the dropdown.
    // If this fails, the tickets can still be shown without filter options.
    async function updateFacilityOptions() {
      try {
        const facilityItems = await getAllFacilityFilterOptions();
        if (active) {
          setFacilityOptions(facilityItems);
        }
      } catch {
        if (active) {
          setFacilityOptions([]);
        }
      }
    }

    // Start the repair ticket listener.
    // Each update is filtered to the ticket states shown on this page.
    async function startSubscription() {
      setLoading(true);
      await updateFacilityOptions();

      try {
        // The service watches repairs, facilities, and members.
        // Staff see real member names so they know who reported the problem.
        // Facility changes can also change what appears in this list.
        unsubscribe = await subscribeToRepairTickets(
          sessionProfile,
          (ticketItems) => {
            if (!active) {
              return;
            }

            const nextItems = sortRepairItems(
              ticketItems.filter((item) => ["pending", "resolved", "terminated"].includes(item.status)),
            );
            // Close the detail panel when the selected ticket no longer belongs here.
            // This can happen after another update changes its status.
            setItems(nextItems);
            setSelectedId((current) => (current && nextItems.some((item) => item.id === current) ? current : ""));
            setPageError("");
            setLoading(false);
            void updateFacilityOptions();
          },
          (subscriptionError) => {
            if (!active) {
              return;
            }
            setPageError(getActionErrorMessage(subscriptionError, "repair.load", "Unable to keep repair tickets up to date."));
            setLoading(false);
          },
        );
      } catch (subscriptionError) {
        if (active) {
          setPageError(getActionErrorMessage(subscriptionError, "repair.load", "Unable to keep repair tickets up to date."));
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

  // Apply ticket id, facility, date, and status filters.
  // Empty fields do not hide anything.
  // Matching tickets are sorted with the newest one first.
  const visibleItems = useMemo(() => {
    const normalizedTicketId = filters.ticketId.trim().toLowerCase();

    return sortRepairItems(
      items.filter((item) => {
        // Ticket id search works with partial ids.
        // Staff do not need to type the full database id.
        const ticketIdMatch = !normalizedTicketId || item.id.toLowerCase().includes(normalizedTicketId);
        // Facility can match by id or display name.
        // Older rows may have either value.
        const facilityMatch =
          !filters.facility ||
          item.facilityId === filters.facility ||
          item.facility === filters.facility;
        const dateMatch = !filters.date || toDateInputValue(item.createdAt) === filters.date;
        const statusMatch = !filters.status || item.status === filters.status;
        return ticketIdMatch && facilityMatch && dateMatch && statusMatch;
      }),
    );
  }, [filters.ticketId, filters.date, filters.facility, filters.status, items]);

  useEffect(() => {
    if (selectedId && !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }, [selectedId, visibleItems]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) || null,
    [selectedId, visibleItems],
  );

  // Clear all filters and old messages.
  // Detail errors are cleared too because the selected ticket may change.
  function clearFilters() {
    setFilters({
      ticketId: "",
      facility: "",
      date: "",
      status: "",
    });
    setPageError("");
    setPageMessage("");
    setDetailError("");
  }

  // Open or close a repair ticket detail panel.
  // Clicking a new card selects that ticket.
  // Clicking the same card again hides the panel.
  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
    setDetailError("");
  }

  // Resolve the selected pending repair ticket.
  // The backend action changes the real ticket status.
  // After success, the ticket stays open as a read only record.
  async function handleResolve() {
    if (!selectedItem || selectedItem.status !== "pending") {
      return;
    }

    // Save the selected id so only this ticket shows loading.
    // Other ticket cards stay readable while the action runs.
    setResolvingId(selectedItem.id);
    setDetailError("");
    setPageError("");
    setPageMessage("");

    try {
      // Ask the backend to mark this repair as resolved.
      // The facility status may also change after the repair is finished.
      await updateTicketStatus(
        {
          repairt_id: selectedItem.id,
          status: "resolved",
        },
        sessionProfile,
      );
      await refresh(selectedItem.id);
      setPageMessage(`Ticket ${selectedItem.id} was updated to resolved.`);
    } catch (resolveError) {
      setDetailError(getActionErrorMessage(resolveError, "repair.resolve", "Unable to update this repair ticket."));
    } finally {
      setResolvingId("");
    }
  }

  return (
    <PageLayout
      className="staff-repair-page"
      title="Facility Repair Tickets"
      subtitle="Track and resolve maintenance issues reported by members."
    >

      {pageError ? (
        <section className="staff-repair-banner staff-repair-banner--error">
          <strong>Cannot continue</strong>
          <p>{pageError}</p>
        </section>
      ) : null}

      {pageMessage ? (
        <section className="staff-repair-banner staff-repair-banner--success">
          <strong>Success</strong>
          <p>{pageMessage}</p>
        </section>
      ) : null}

      <FilterPanel
        className="staff-repair-filters"
        columns={4}
        onClear={clearFilters}
      >
          <FilterField id="staff-repair-ticketId" label="Ticket ID">
            <input
              id="staff-repair-ticketId"
              type="text"
              value={filters.ticketId}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, ticketId: event.target.value }));
                setPageError("");
                setPageMessage("");
                setDetailError("");
              }}
              placeholder="Search Ticket ID"
            />
          </FilterField>

          <FilterField id="staff-repair-facility" label="Facility">
            <select
              id="staff-repair-facility"
              value={filters.facility}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, facility: event.target.value }));
                setPageError("");
                setPageMessage("");
                setDetailError("");
              }}
            >
              <option value="">All Facilities</option>
                {facilityOptions.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
            </select>
          </FilterField>

          <FilterField id="staff-repair-date" label="Date">
            <input
              id="staff-repair-date"
              type="date"
              min={staffCreatedDate}
              max={maxFilterDate}
              value={filters.date}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, date: event.target.value }));
                setPageError("");
                setPageMessage("");
                setDetailError("");
              }}
            />
          </FilterField>

          <FilterField id="staff-repair-status" label="Status">
            <select
              id="staff-repair-status"
              value={filters.status}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, status: event.target.value }));
                setPageError("");
                setPageMessage("");
                setDetailError("");
              }}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="terminated">Terminated</option>
            </select>
          </FilterField>

      </FilterPanel>

      <section className="staff-repair-layout">
        <div className="staff-repair-list">
          {loading ? (
            <div className="staff-repair-empty">
              <p>Loading repair tickets...</p>
            </div>
          ) : visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <div key={item.id} className="staff-repair-group">
                <StaffListCard
                  isActive={selectedItem?.id === item.id}
                  onClick={() => toggleSelection(item.id)}
                  gridTemplateColumns="2.4fr 1.8fr 0.8fr 0.8fr 0.8fr 0.8fr"
                  cells={[
                    { label: "Facility", value: item.facility, title: item.facility },
                    { label: "Ticket ID", value: item.id, title: item.id },
                    { label: "Member", value: item.memberName, title: item.memberName },
                    { label: "Type", value: displayStatus(item.type), title: item.type },
                    { label: "Status", value: getRepairStatusLabel(item.status), isStatus: true, statusTone: statusTone(item.status) },
                    { label: "Submitted", value: formatStaffCardTimestamp(item.createdAt), title: formatStaffCardTimestamp(item.createdAt) },
                  ]}
                />

                {selectedItem?.id === item.id ? (
                  <div className="staff-repair-detail__card">
                    {detailError ? (
                      <section className="staff-repair-inlineError">
                        <strong>Cannot continue</strong>
                        <p>{detailError}</p>
                      </section>
                    ) : null}

                    <div className="staff-repair-detail__head">
                      <div>
                        <h2>{selectedItem.facility}</h2>
                        <p className="staff-repair-detail__ticketId">Ticket ID: {selectedItem.id}</p>
                      </div>
                      <span className={`status-pill ${statusTone(selectedItem.status)}`}>{getRepairStatusLabel(selectedItem.status)}</span>
                    </div>

                    <div className="staff-repair-detail__section">
                      <h3>Issue Description</h3>
                      <p>{selectedItem.description}</p>
                    </div>

                    <div className="staff-repair-detail__grid">
                      <div>
                        <span>Reported By</span>
                        <strong>{selectedItem.memberName}</strong>
                      </div>
                      <div>
                        <span>Submitted At</span>
                        <strong>{formatStaffDateTime(selectedItem.createdAt)}</strong>
                      </div>
                      <div>
                        <span>Resolved At</span>
                        <strong>{getResolvedAtLabel(selectedItem)}</strong>
                      </div>
                    </div>

                    {selectedItem.status === "pending" ? (
                      <div className="staff-repair-detail__actions">
                        <button
                          className="btn staff-repair-detail__action"
                          type="button"
                          disabled={resolvingId !== ""}
                          onClick={handleResolve}
                        >
                          {resolvingId === selectedItem.id ? "Updating..." : "Mark as Resolved"}
                        </button>
                      </div>
                    ) : (
                      <div className="staff-repair-detail__readonly">
                        <CheckCircle2 size={18} />
                        <span>
                          {selectedItem.status === "terminated"
                            ? "This ticket was terminated and is read-only."
                            : "This ticket has been fully resolved."}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="staff-repair-empty">
              <p>No repair tickets match the current filters.</p>
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
