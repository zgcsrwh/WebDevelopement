import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import { getRepairTickets, submitRepairTicket } from "../../services/reportService";
import { getFacilities } from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone, toTitleText } from "../../utils/presentation";

export default function Reports() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    facilityId: "",
    type: "other",
    description: "",
  });

  useEffect(() => {
    getRepairTickets(sessionProfile).then(setItems).catch(() => setItems([]));
    getFacilities().then((facilityItems) => {
      setFacilities(facilityItems);
      if (facilityItems[0]) {
        setForm((prev) => ({ ...prev, facilityId: facilityItems[0].id }));
      }
    });
  }, [sessionProfile]);

  const selectedFacility = useMemo(() => facilities.find((item) => item.id === form.facilityId) || null, [facilities, form.facilityId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.facilityId) {
      setError("Please select a facility before submitting a repair ticket.");
      return;
    }

    if (!form.description.trim()) {
      setError("Please describe the issue before submitting.");
      return;
    }

    if (form.description.trim().length > 500) {
      setError("Repair descriptions must stay within 500 characters.");
      return;
    }

    try {
      await submitRepairTicket(
        {
          facility_id: form.facilityId,
          repair_description: form.description.trim(),
          type: [form.type],
        },
        sessionProfile,
      );
      setForm((prev) => ({ ...prev, description: "" }));
      setItems(await getRepairTickets(sessionProfile));
      setMessage("Repair ticket submitted.");
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Unable to submit the repair ticket."));
    }
  };

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Repair reports</h1>
          <p>Submit new facility issues and track only the repair tickets linked to your member account.</p>
        </div>
      </section>

      <div className="split-layout">
        <article className="form-card">
          <h2>Submit a repair ticket</h2>
          {error && <p className="errorMessage">{error}</p>}
          {message && <p className="successMessage">{message}</p>}
          <form onSubmit={handleSubmit} className="field-grid" style={{ marginTop: 18 }}>
            <div className="field-span">
              <label>Facility</label>
              <select value={form.facilityId} onChange={(event) => setForm((prev) => ({ ...prev, facilityId: event.target.value }))}>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
              {selectedFacility && (
                <p className="soft-text" style={{ marginTop: 8 }}>
                  {selectedFacility.sportType} | {selectedFacility.location}
                </p>
              )}
            </div>
            <div className="field-span">
              <label>Issue type</label>
              <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
                <option value="other">Other</option>
                <option value="equipment">Equipment</option>
                <option value="lighting">Lighting</option>
                <option value="plumbing">Plumbing</option>
                <option value="surface">Surface</option>
              </select>
            </div>
            <div className="field-span">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Describe what is damaged and how it affects the facility."
              />
              <p className="soft-text" style={{ marginTop: 8 }}>{form.description.length}/500 characters</p>
            </div>
            <div className="field-span form-actions">
              <button className="btn" type="submit" disabled={!form.facilityId}>
                Submit report
              </button>
            </div>
          </form>
        </article>

        <article className="page-panel">
          <h2>My repair tickets</h2>
          <div className="card-list" style={{ marginTop: 18 }}>
            {items.map((item) => (
              <div key={item.id} className="report-item">
                <div className="item-row">
                  <div>
                    <h3>{item.facilityLabel}</h3>
                    <p className="meta-row">{item.createdAt}</p>
                    <p className="soft-text" style={{ marginTop: 8 }}>
                      Type: {item.type.map((part) => toTitleText(part)).join(", ")}
                    </p>
                    <p className="soft-text" style={{ marginTop: 8 }}>{item.description}</p>
                  </div>
                  <span className={`status-pill ${statusTone(item.status)}`}>
                    {item.statusLabel || displayStatus(item.status)}
                  </span>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="soft-text">No repair tickets found for this account.</p>}
          </div>
        </article>
      </div>
    </div>
  );
}
