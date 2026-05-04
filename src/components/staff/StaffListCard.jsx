import "./StaffListCard.css";

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
