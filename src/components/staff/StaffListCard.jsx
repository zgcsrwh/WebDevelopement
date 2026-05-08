// Shared card used by staff request, check in, and repair pages.
// It shows one business record with several small fields, such as date, member, facility, and status.
// When staff choose the card, the parent page opens the matching detail panel.
import "./StaffListCard.css";

// Staff click this card to open one record from the list.
// Request, check in, and repair pages decide which fields appear on the card.
// Keyboard selection works the same way as a mouse click.
export default function StaffListCard({ isActive, onClick, gridTemplateColumns, cells }) {
  return (
    <article
      className={`staff-list-card ${isActive ? "is-active" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="staff-list-card__row" style={{ "--card-grid-columns": gridTemplateColumns }}>
        {cells.map((cell, index) => (
          <div key={index} className="staff-list-card__cell">
            <span className="staff-list-card__label">{cell.label}</span>
            {cell.isStatus ? (
              <span className={`status-pill ${cell.statusTone}`}>{cell.value}</span>
            ) : (
              <span className="staff-list-card__value" title={cell.title}>{cell.value}</span>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
