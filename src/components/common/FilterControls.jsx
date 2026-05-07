// FilterControls keeps select boxes, search boxes, and Clear aligned.
import "./FilterControls.css";

export function FilterPanel({
  children,
  actions,
  extraActions,
  onClear,
  clearLabel = "Clear",
  columns,
  className = "",
  surface = true,
}) {
  // A page can pass its own buttons, or use the normal Clear button here.
  const actionContent =
    actions ||
    (onClear || extraActions ? (
      <>
        {onClear ? (
          <FilterClearButton onClick={onClear}>
            {clearLabel}
          </FilterClearButton>
        ) : null}
        {extraActions}
      </>
    ) : null);
  const classNames = [
    "filter-panel",
    surface ? "filter-panel--surface" : "",
    columns ? "filter-panel--fixed-columns" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  // Fixed columns help staff and admin filter bars keep the same width.
  const style = columns ? { "--filter-columns": columns } : undefined;

  return (
    <section className={classNames} style={style}>
      <div className="filter-panel__grid">{children}</div>
      {actionContent ? <div className="filter-panel__actions">{actionContent}</div> : null}
    </section>
  );
}

export function FilterField({ id, label, children, className = "" }) {
  // One label plus one control, so every filter has the same spacing.
  return (
    <div className={`filter-field ${className}`.trim()}>
      {label ? <label htmlFor={id}>{label}</label> : null}
      {children}
    </div>
  );
}

export function FilterClearButton({ children = "Clear", className = "", ...props }) {
  // Small clear button used inside the filter card.
  return (
    <button className={`btn-ghost filter-clear-button ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
