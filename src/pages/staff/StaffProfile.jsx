import { useEffect, useState } from "react";
import "../pageStyles.css";
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
            title: `${item.status === "resolved" ? "Resolved repair" : "Open repair"} for ${item.facility}`,
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

  const managedFacilities = sessionProfile?.id ? facilities.filter((item) => item.staffId === sessionProfile.id) : [];

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Staff profile</h1>
          <p>Review your account details, assigned facilities, and recent workload pulled from the live booking and repair records.</p>
        </div>
      </section>

      <section className="split-layout">
        <article className="detail-card">
          <h2>Account snapshot</h2>
          <div className="booking-summary" style={{ marginTop: 18 }}>
            <span>Name: {sessionProfile?.name || "Not available"}</span>
            <span>Email: {sessionProfile?.email || "Not available"}</span>
            <span>Role: {sessionProfile?.role || "Staff"}</span>
            <span>Status: {displayStatus(sessionProfile?.status || "active")}</span>
          </div>
        </article>

        <article className="detail-card">
          <h2>Managed facilities</h2>
          <div className="tags-row" style={{ marginTop: 18 }}>
            {managedFacilities.map((item) => (
              <span key={item.id} className="tag">{item.name}</span>
            ))}
            {managedFacilities.length === 0 && <span className="tag">No currently assigned facilities</span>}
          </div>
        </article>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span className="soft-text">Pending approvals</span>
          <strong>{pendingRequests.length}</strong>
        </article>
        <article className="stat-card">
          <span className="soft-text">Open repairs</span>
          <strong>{repairItems.filter((item) => item.status !== "resolved").length}</strong>
        </article>
        <article className="stat-card">
          <span className="soft-text">Assigned facilities</span>
          <strong>{managedFacilities.length}</strong>
        </article>
      </section>

      <section className="page-panel">
        <h2>Recent workload</h2>
        <div className="card-list" style={{ marginTop: 18 }}>
          {recentActivity.map((item) => (
            <article key={item.id} className="mini-card">
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>{item.title}</h3>
              <p className="soft-text">{item.detail}</p>
              <p className="meta-row" style={{ marginTop: 8 }}>{item.createdAt || "Not available"}</p>
            </article>
          ))}
          {recentActivity.length === 0 && <article className="mini-card">No assigned requests or repair records were found yet.</article>}
        </div>
      </section>
    </div>
  );
}
