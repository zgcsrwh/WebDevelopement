// Staff handle member repair reports on this page.
// They can filter tickets, open one ticket, read the issue, and mark pending tickets as resolved.
// Resolved and terminated tickets stay visible, but staff can only read them.
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

// Sort repair tickets for the staff repair page.
// New reports appear first so staff can handle recent problems earlier.
function sortRepairItems(items = []) {
  return [...items].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

// Format the repair status shown on staff ticket cards.
// Staff use this label to see whether a ticket still needs action.
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

// Format the resolved time in the ticket detail panel.
// Pending tickets have no resolved time, so the page shows a dash.
function getResolvedAtLabel(item) {
  return item.completedAt ? formatStaffDateTime(item.completedAt) : "-";
}

// Staff use this page to handle repair tickets.
// It keeps repair tickets live and lets staff resolve one selected pending ticket.
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

  // Reload repair tickets after staff resolve one or need fresh data.
  // The selected ticket stays open if it still belongs in the list.
  async function refresh(preferredId = "") {
    setLoading(true);
    try {
      // Load tickets and facility names together for the list and filter.
      const [ticketItems, facilityItems] = await Promise.all([
        getRepairTickets(sessionProfile),
        getAllFacilityFilterOptions(),
      ]);
      // Keep finished tickets for review, but only pending tickets can be resolved.
      const nextItems = sortRepairItems(
        ticketItems.filter((item) => ["pending", "resolved", "terminated"].includes(item.status)),
      );

      setItems(nextItems);
      setFacilityOptions(facilityItems);
      setSelectedId((current) => {
        // Keep the same ticket open after refresh when it still exists.
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

  // Keep repair tickets live while staff stay on the page.
  // Status, description, facility name, and member name changes update the cards.
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    // Load facility names for the dropdown filter.
    // Tickets can still be shown if these options fail.
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

    // Start the repair ticket listener and keep only the states shown on this page.
    async function startSubscription() {
      setLoading(true);
      await updateFacilityOptions();

      try {
        // Repair, facility, and member updates can all change what staff see here.
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

  // Filter repair tickets by ticket id, facility, date, and status.
  // Staff can leave a filter blank when they want to keep all tickets for that field.
  const visibleItems = useMemo(() => {
    const normalizedTicketId = filters.ticketId.trim().toLowerCase();

    return sortRepairItems(
      items.filter((item) => {
        // Staff can type part of a ticket id when they do not know the full number.
        const ticketIdMatch = !normalizedTicketId || item.id.toLowerCase().includes(normalizedTicketId);
        // Staff can choose a facility from the dropdown and still match the ticket card name.
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

  // Clear repair filters and page messages.
  // Staff return to the full ticket list after using this action.
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

  // Open one repair ticket detail panel, or close it when staff click the same card again.
  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
    setDetailError("");
  }

  // Resolve the selected pending repair ticket.
  // After success, the same ticket stays open as a read only record.
  async function handleResolve() {
    if (!selectedItem || selectedItem.status !== "pending") {
      return;
    }

    // Only the selected ticket shows loading while staff wait.
    setResolvingId(selectedItem.id);
    setDetailError("");
    setPageError("");
    setPageMessage("");

    try {
      // Reload after resolving so staff can see the finished ticket state.
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

      {/* Staff can filter repair tickets by id, facility, date, and status here. */}
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

      {/* Repair tickets are listed here, and the selected ticket opens its detail card below. */}
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
                    {/* Error message for the opened ticket only. */}
                    {detailError ? (
                      <section className="staff-repair-inlineError">
                        <strong>Cannot continue</strong>
                        <p>{detailError}</p>
                      </section>
                    ) : null}

                    {/* Ticket id and current repair status. */}
                    <div className="staff-repair-detail__head">
                      <div>
                        <h2>{selectedItem.facility}</h2>
                        <p className="staff-repair-detail__ticketId">Ticket ID: {selectedItem.id}</p>
                      </div>
                      <span className={`status-pill ${statusTone(selectedItem.status)}`}>{getRepairStatusLabel(selectedItem.status)}</span>
                    </div>

                    {/* Member repair description that staff read before resolving the ticket. */}
                    <div className="staff-repair-detail__section">
                      <h3>Issue Description</h3>
                      <p>{selectedItem.description}</p>
                    </div>

                    {/* Reporter name, submitted time, and resolved time for this ticket. */}
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
                        {/* Resolve button for pending tickets. */}
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
                        {/* Read only message for resolved or terminated tickets. */}
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
