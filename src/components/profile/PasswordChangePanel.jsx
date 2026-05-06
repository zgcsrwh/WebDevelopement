import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Lock, LockKeyhole, LockOpen } from "lucide-react";
import { updateOwnPassword } from "../../services/profileService";
import PasswordChangeForm from "./PasswordChangeForm";
import "./PasswordChange.css";

const PasswordChangePanel = forwardRef(function PasswordChangePanel(
  {
    disabled = false,
    idPrefix = "operator-password",
    layout = "grid",
    sectionClassName = "staff-profile__section",
    className = "",
  },
  ref,
) {
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef(null);
  const panelClassName = [sectionClassName, "password-change-panel", className]
    .filter(Boolean)
    .join(" ");

  function reset({ collapse = true } = {}) {
    formRef.current?.reset();
    if (collapse) {
      setExpanded(false);
    }
  }

  useImperativeHandle(ref, () => ({
    isExpanded: () => expanded,
    open: () => setExpanded(true),
    hasPasswordChange: () => (expanded ? Boolean(formRef.current?.hasPasswordChange()) : false),
    validate: (options = {}) => {
      if (!expanded) {
        if (options.requirePassword) {
          setExpanded(true);
          return {
            dirty: true,
            errors: { nextPassword: "Please enter a new password." },
            valid: false,
          };
        }
        return { dirty: false, errors: {}, valid: true };
      }
      return formRef.current?.validate(options) || { dirty: false, errors: {}, valid: true };
    },
    getPassword: () => formRef.current?.getPassword() || "",
    savePassword: () => updateOwnPassword(formRef.current?.getPassword() || ""),
    reset,
  }));

  function handleToggle() {
    if (expanded) {
      reset({ collapse: true });
      return;
    }

    setExpanded(true);
  }

  return (
    <section className={panelClassName}>
      <div className="password-change-panel__header">
        <div className="password-change-panel__title">
          <LockKeyhole size={20} strokeWidth={2} />
          <h2>Security (Change Password)</h2>
        </div>

        <button
          className="password-change-panel__toggle"
          type="button"
          aria-label={expanded ? "Hide password fields" : "Show password fields"}
          onClick={handleToggle}
          disabled={disabled}
        >
          {expanded ? <LockOpen size={22} strokeWidth={2.1} /> : <Lock size={22} strokeWidth={2.1} />}
        </button>
      </div>

      {expanded ? (
        <PasswordChangeForm
          ref={formRef}
          idPrefix={idPrefix}
          layout={layout}
          disabled={disabled}
        />
      ) : null}
    </section>
  );
});

export default PasswordChangePanel;
