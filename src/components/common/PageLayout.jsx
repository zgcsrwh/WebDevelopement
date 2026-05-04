import { Link } from "react-router-dom";
import "./Button.css";
import "./PageLayout.css";

export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
  backLabel,
  className = "",
}) {
  return (
    <header className={["page-header", className].filter(Boolean).join(" ")}>
      <div className="page-header__copy">
        {backTo ? (
          <Link className="page-header__back" to={backTo}>
            <span aria-hidden="true">&larr;</span>
            {backLabel}
          </Link>
        ) : null}
        {title ? <h1>{title}</h1> : null}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export default function PageLayout({
  title,
  subtitle,
  actions,
  backTo,
  backLabel,
  children,
  className = "",
  headerClassName = "",
}) {
  return (
    <div className={["page-layout", className].filter(Boolean).join(" ")}>
      {title || subtitle || actions || backTo ? (
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={actions}
          backTo={backTo}
          backLabel={backLabel}
          className={headerClassName}
        />
      ) : null}
      {children}
    </div>
  );
}
