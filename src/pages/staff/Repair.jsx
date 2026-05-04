import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import "../pageStyles.css";
import "./Repair.css";
import { getAllFacilityFilterOptions } from "../../services/bookingService";
import { getRepairTickets, updateTicketStatus } from "../../services/reportService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";
import { formatStaffCardTimestamp, formatStaffDateTime, getDateInputMaxValue, toDateInputValue } from "../../utils/staffPages";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";

function sortRepairItems(items = []) {
  return [...items].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

function getRepairStatusLabel(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pending") {
    return "pending";
  }

  if (normalized === "resolved") {
    return "resolved";
  }

  return normalized || "unknown";
}

function getResolvedAtLabel(item) {
  return item.completedAt ? formatStaffDateTime(item.completedAt) : "-";
}

export default function Repair() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [filters, setFilters] = useState({
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

  async function refresh(preferredId = "") {
    setLoading(true);
    try {
      const [ticketItems, facilityItems] = await Promise.all([
        getRepairTickets(sessionProfile),
        getAllFacilityFilterOptions(),
      ]);
      const nextItems = sortRepairItems(
        ticketItems.filter((item) => ["pending", "resolved"].includes(item.status)),
      );

      setItems(nextItems);
      setFacilityOptions(facilityItems);
      setSelectedId((current) => {
        const candidate = preferredId || current;
        if (candidate && nextItems.some((item) => item.id === candidate)) {
          return candidate;
        }
        return "";
      });
      setPageError("");
    } catch (loadError) {
      setPageError(getErrorMessage(loadError, "Unable to load repair tickets."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionProfile?.id) {
      refresh();
    }
  }, [sessionProfile]);

  const visibleItems = useMemo(() => {
    return sortRepairItems(
      items.filter((item) => {
        const facilityMatch =
          !filters.facility ||
          item.facilityId === filters.facility ||
          item.facility === filters.facility;
        const dateMatch = !filters.date || toDateInputValue(item.createdAt) === filters.date;
        const statusMatch = !filters.status || item.status === filters.status;
        return facilityMatch && dateMatch && statusMatch;
      }),
    );
  }, [filters.date, filters.facility, filters.status, items]);

  useEffect(() => {
    if (selectedId && !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }, [selectedId, visibleItems]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) || null,
    [selectedId, visibleItems],
  );

  function clearFilters() {
    setFilters({
      facility: "",
      date: "",
      status: "",
    });
    setPageError("");
    setPageMessage("");
    setDetailError("");
  }

  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
    setDetailError("");
  }

  async function handleResolve() {
    if (!selectedItem || selectedItem.status !== "pending") {
      return;
    }

    setResolvingId(selectedItem.id);
    setDetailError("");
    setPageError("");
    setPageMessage("");

    try {
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
      setDetailError(getErrorMessage(resolveError, "Unable to update this repair ticket."));
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
        columns={3}
        onClear={clearFilters}
      >
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
              <option value="pending">pending</option>
              <option value="resolved">resolved</option>
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
              <article
                key={item.id}
                className={`staff-repair-card ${selectedItem?.id === item.id ? "is-active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleSelection(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSelection(item.id);
                  }
                }}
              >
                <div className="staff-repair-card__header">
                  <h3>{item.facility}</h3>
                  <div className="staff-repair-card__headerMeta">
                    <p className="staff-repair-card__ticketId">Ticket ID: {item.id}</p>
                    <span className={`status-pill ${statusTone(item.status)}`}>{getRepairStatusLabel(item.status)}</span>
                  </div>
                </div>

                <p className="staff-repair-card__summary">{item.description}</p>
                <p className="staff-repair-card__footer">
                  By: {item.memberName} / {formatStaffCardTimestamp(item.createdAt)}
                </p>
              </article>
            ))
          ) : (
            <div className="staff-repair-empty">
              <p>No repair tickets match the current filters.</p>
            </div>
          )}
        </div>

        <aside className="staff-repair-detail">
          {selectedItem ? (
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
                  <span>This ticket has been fully resolved.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="staff-repair-empty">
              <p>Select a repair ticket to preview its detail panel, or click the same card again to hide it.</p>
            </div>
          )}
        </aside>
      </section>
    </PageLayout>
  );
}
