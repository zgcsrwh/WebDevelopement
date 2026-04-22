import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import { getFacilities, getStaffCheckIns, getStaffRequests } from "../../services/bookingService";
import { getRepairTickets } from "../../services/reportService";
import { useAuth } from "../../provider/AuthContext";
import { displayStatus } from "../../utils/presentation";

export default function StaffProfile() {
  const { sessionProfile } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [repairItems, setRepairItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getFacilities(new Date().toISOString().slice(0, 10), { includeHidden: true }),
      getStaffRequests(sessionProfile),
      getStaffCheckIns(sessionProfile),
      getRepairTickets(sessionProfile),
    ])
      .then(([facilityItems, requestItems, checkInItems, repairRecords]) => {
        if (cancelled) {
          return;
        }

        setFacilities(facilityItems);
        setPendingRequests(requestItems);
        setRepairItems(repairRecords);

        const nextActivity = [
          ...requestItems.map((item) => ({
            id: `request-${item.id}`,
            title: `Pending approval for ${item.facilityName}`,
            detail: `${item.memberName} requested ${item.date} ${item.time}.`,
            createdAt: item.createdAt || `${item.date} ${item.startTime}`,
          })),
          ...checkInItems.map((item) => ({
            id: `checkin-${item.id}`,
            title: `${item.status === "in_progress" ? "Checked-in session" : "Upcoming session"} at ${item.facilityName}`,
            detail: `${item.memberName} is booked for ${item.date} ${item.time}.`,
            createdAt: item.createdAt || `${item.date} ${item.startTime}`,
          })),
          ...repairRecords.map((item) => ({
            id: `repair-${item.id}`,
            title:
              item.status === "resolved"
                ? `Resolved repair for ${item.facility}`
                : item.status === "terminated"
                  ? `Terminated repair for ${item.facility}`
                  : item.status === "suspended"
                    ? `Suspended repair for ${item.facility}`
                    : `Open repair for ${item.facility}`,
            detail: item.description,
            createdAt: item.createdAt || "",
          })),
        ]
          .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
          .slice(0, 8);

        setRecentActivity(nextActivity);
      })
      .catch(() => {
        if (!cancelled) {
          setFacilities([]);
          setPendingRequests([]);
          setRepairItems([]);
          setRecentActivity([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const managedFacilities = useMemo(
    () => (sessionProfile?.id ? facilities.filter((item) => item.staffId === sessionProfile.id) : []),
    [facilities, sessionProfile?.id],
  );

  return (
    <div className="workspace-page">
      <section className="workspace-header">
        <div>
          <h1>Staff profile</h1>
          <p>See your account summary, assigned facilities, and the latest workload pulled from real booking and repair records.</p>
        </div>
      </section>

      <section className="workspace-metrics">
        <article>
          <span>Pending approvals</span>
          <strong>{pendingRequests.length}</strong>
        </article>
        <article>
          <span>Open repairs</span>
          <strong>{repairItems.filter((item) => !["resolved", "terminated"].includes(item.status)).length}</strong>
        </article>
        <article>
          <span>Assigned facilities</span>
          <strong>{managedFacilities.length}</strong>
        </article>
      </section>

      <section className="workspace-surface">
        <h2>Account snapshot</h2>
        <div className="workspace-detail-grid" style={{ marginTop: 18 }}>
          <div className="workspace-detail-item">
            <label>Name</label>
            <span>{sessionProfile?.name || "Not available"}</span>
          </div>
          <div className="workspace-detail-item">
            <label>Email</label>
            <span>{sessionProfile?.email || "Not available"}</span>
          </div>
          <div className="workspace-detail-item">
            <label>Role</label>
            <span>{sessionProfile?.role || "Staff"}</span>
          </div>
          <div className="workspace-detail-item">
            <label>Status</label>
            <span>{displayStatus(sessionProfile?.status || "active")}</span>
          </div>
        </div>
      </section>

      <section className="workspace-surface">
        <h2>Managed facilities</h2>
        <div className="workspace-tag-list" style={{ marginTop: 18 }}>
          {managedFacilities.map((item) => (
            <span key={item.id} className="workspace-tag">
              {item.name}
            </span>
          ))}
          {managedFacilities.length === 0 && <span className="workspace-tag">No currently assigned facilities</span>}
        </div>
      </section>

      <section className="workspace-surface">
        <h2>Recent workload</h2>
        <div className="workspace-list" style={{ marginTop: 18 }}>
          {recentActivity.map((item) => (
            <article key={item.id} className="workspace-request-card">
              <div className="workspace-request-top">
                <div>
                  <h3>{item.title}</h3>
                  <p className="workspace-note">{item.detail}</p>
                </div>
              </div>
              <p className="workspace-note" style={{ marginTop: 10 }}>
                {item.createdAt || "Not available"}
              </p>
            </article>
          ))}
          {recentActivity.length === 0 && <p>No assigned requests or repair records were found yet.</p>}
        </div>
      </section>
    </div>
  );
}
