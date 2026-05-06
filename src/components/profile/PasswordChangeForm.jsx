import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { validatePasswordDraft } from "./passwordChangeUtils";
import "./PasswordChange.css";

const EMPTY_DRAFT = {
  nextPassword: "",
  confirmPassword: "",
};

const PasswordChangeForm = forwardRef(function PasswordChangeForm(
  { className = "", idPrefix = "password-change", layout = "stack", disabled = false },
  ref,
) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [errors, setErrors] = useState({});
  const [visible, setVisible] = useState({
    nextPassword: false,
    confirmPassword: false,
  });

  const dirty = useMemo(() => validatePasswordDraft(draft).dirty, [draft]);

  function reset() {
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setVisible({ nextPassword: false, confirmPassword: false });
  }

  function validate(options) {
    const result = validatePasswordDraft(draft, options);
    setErrors(result.errors);
    return result;
  }

  useImperativeHandle(ref, () => ({
    hasPasswordChange: () => dirty,
    validate,
    getPassword: () => draft.nextPassword,
    reset,
  }));

  function updateField(field) {
    return (event) => {
      const value = event.target.value;
      setDraft((previous) => ({
        ...previous,
        [field]: value,
      }));
      setErrors((previous) => ({
        ...previous,
        [field]: "",
      }));
    };
  }

  function toggleVisibility(field) {
    setVisible((previous) => ({
      ...previous,
      [field]: !previous[field],
    }));
  }

  const formClass = [
    "password-change-form",
    layout === "grid" ? "password-change-form--grid" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={formClass}>
      <div className="password-change-form__field">
        <label htmlFor={`${idPrefix}-next`}>New Password</label>
        <div className="password-change-form__inputWrap">
          <input
            id={`${idPrefix}-next`}
            type={visible.nextPassword ? "text" : "password"}
            value={draft.nextPassword}
            onChange={updateField("nextPassword")}
            placeholder="Enter a new password"
            disabled={disabled}
          />
          <button
            className="password-change-form__toggle"
            type="button"
            aria-label={visible.nextPassword ? "Hide password" : "Show password"}
            onClick={() => toggleVisibility("nextPassword")}
            disabled={disabled}
          >
            {visible.nextPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.nextPassword ? <p className="password-change-form__error">{errors.nextPassword}</p> : null}
      </div>

      <div className="password-change-form__field">
        <label htmlFor={`${idPrefix}-confirm`}>Confirm New Password</label>
        <div className="password-change-form__inputWrap">
          <input
            id={`${idPrefix}-confirm`}
            type={visible.confirmPassword ? "text" : "password"}
            value={draft.confirmPassword}
            onChange={updateField("confirmPassword")}
            placeholder="Re-enter the new password"
            disabled={disabled}
          />
          <button
            className="password-change-form__toggle"
            type="button"
            aria-label={visible.confirmPassword ? "Hide password" : "Show password"}
            onClick={() => toggleVisibility("confirmPassword")}
            disabled={disabled}
          >
            {visible.confirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.confirmPassword ? <p className="password-change-form__error">{errors.confirmPassword}</p> : null}
      </div>
    </div>
  );
});

export default PasswordChangeForm;
