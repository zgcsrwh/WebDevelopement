import { useEffect, useState, useCallback } from "react";
import { Calendar, CheckCircle, Eye, EyeOff, Lock, Mail, MapPin, User } from "lucide-react";
import styles from "./LoginRegister.module.css";
import { useAuth } from "../../provider/AuthContext";
import { getErrorCode, getErrorMessage } from "../../utils/errors";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isStrongPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(value || ""));
}

function resolveVerificationError(err, fallbackMessage) {
  const message = String(err?.message || "");

  if (message.includes("quota-exceeded") || message.includes("too-many-requests")) {
    return "Too many verification attempts. Please wait about a minute and try again.";
  }
  if (message.includes("invalid-credential") || message.includes("wrong-password")) {
    return "The password does not match this email address.";
  }
  if (message.includes("invalid-email")) {
    return "Invalid email format.";
  }
  return fallbackMessage || message || "Unable to complete email verification right now.";
}

function mapSignupError(err) {
  const code = getErrorCode(err);
  const message = err?.message || "";
  const normalizedMessage = getErrorMessage(err, "Registration failed. Please try again.");

  if (message.includes("already exists for this email")) {
    return "An account already exists for this email. Please log in.";
  }
  if (message.includes("staff or admin account")) {
    return "This email belongs to a staff or admin account and cannot be used for member registration.";
  }
  if (code === "already-exists") {
    return "This email is already registered. Please log in.";
  }
  if (code === "internal" || code === "unavailable" || normalizedMessage.toLowerCase() === "internal") {
    return "Registration failed. Please try again.";
  }
  return normalizedMessage;
}

function mapVerificationError(err) {
  const code = getErrorCode(err);
  const message = err?.message || "";
  const normalizedMessage = getErrorMessage(err, "Unable to send verification email.");

  if (message.includes("already exists for this email")) {
    return "An account already exists for this email. Please log in.";
  }
  if (message.includes("staff or admin account")) {
    return "This email belongs to a staff or admin account and cannot be used for member registration.";
  }
  if (message.includes("weak-password")) {
    return "Password must be at least 8 characters with letters and numbers.";
  }
  if (code === "internal" || code === "unavailable" || normalizedMessage.toLowerCase() === "internal") {
    return "Unable to send verification email. Please try again.";
  }
  return resolveVerificationError(err, "Unable to send verification email.");
}

// Reusable input field component
function FormInput({ label, icon: Icon, type = "text", disabled, ...inputProps }) {
  return (
    <div className={styles.inputGroup}>
      <label>{label}</label>
      <div className={styles.inputWrapper}>
        <Icon className={styles.icon} size={14} />
        <input
          type={type}
          className={styles.inputField}
          disabled={disabled}
          {...inputProps}
        />
      </div>
    </div>
  );
}

// Password input with toggle visibility
function PasswordInput({ label, icon: Icon, showPassword, onToggle, disabled, ...inputProps }) {
  return (
    <div className={styles.inputGroup}>
      <label>{label}</label>
      <div className={styles.inputWrapper}>
        <Icon className={styles.icon} size={14} />
        <input
          type={showPassword ? "text" : "password"}
          className={`${styles.inputField} ${styles.inputFieldWithAction}`}
          disabled={disabled}
          {...inputProps}
        />
        <button
          type="button"
          className={styles.inputActionBtn}
          onClick={onToggle}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

const RegisterForm = ({ onSwitch }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    address: "",
    dateOfBirth: "",
  });
  const [verificationSent, setVerificationSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [hasInitialized, setHasInitialized] = useState(false);

  const {
    currentUser,
    registrationPending,
    beginEmailVerification,
    resendRegistrationVerification,
    checkRegistrationVerification,
    discardPendingRegistration,
    signup,
  } = useAuth();

  const resetLocalState = useCallback(() => {
    setFormData({ name: "", email: "", password: "", confirmPassword: "", address: "", dateOfBirth: "" });
    setVerificationSent(false);
    setEmailVerified(false);
    setShowPasswords(false);
    setError("");
    setSuccess("");
    setSubmitting(false);
    setCheckingVerification(false);
    setResendCountdown(0);
  }, []);

  const showError = useCallback((message) => {
    setError(message);
    setSuccess("");
  }, []);

  const showSuccess = useCallback((message) => {
    setSuccess(message);
    setError("");
  }, []);

  const updateField = useCallback((field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  }, []);

  const resetVerificationProgress = useCallback(async () => {
    setVerificationSent(false);
    setEmailVerified(false);
    setResendCountdown(0);
    setSuccess("");
    setError("");
    await discardPendingRegistration();
  }, [discardPendingRegistration]);

  // Reset verification when credentials change
  const handleCredentialChange = useCallback((field) => async (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (verificationSent || emailVerified) {
      await resetVerificationProgress();
    }
  }, [verificationSent, emailVerified, resetVerificationProgress]);

  function validateForm() {
    const { email, password, confirmPassword, name, dateOfBirth, address } = formData;
    
    if (!email.trim() || !emailPattern.test(email.trim())) {
      showError("Please enter a valid email address.");
      return false;
    }
    if (!password.trim() || !confirmPassword.trim()) {
      showError("Please enter and confirm your password.");
      return false;
    }
    if (password !== confirmPassword) {
      showError("Passwords do not match.");
      return false;
    }
    if (!isStrongPassword(password)) {
      showError("Password must be at least 8 characters with letters and numbers.");
      return false;
    }
    if (!name.trim()) {
      showError("Please enter your name.");
      return false;
    }
    if (!dateOfBirth) {
      showError("Please select your date of birth.");
      return false;
    }
    if (!address.trim()) {
      showError("Please enter your address.");
      return false;
    }
    return true;
  }

  // Initialize
  useEffect(() => {
    if (hasInitialized) return;
    setHasInitialized(true);
    resetLocalState();
    if (currentUser || registrationPending) {
      discardPendingRegistration().catch(() => null);
    }
  }, [currentUser, discardPendingRegistration, hasInitialized, registrationPending, resetLocalState]);

  // Complete registration helper
  const completeRegistration = useCallback(async () => {
    const { name, email, password, address, dateOfBirth } = formData;
    setSubmitting(true);
    try {
      await signup(name, email, password, address, dateOfBirth);
      showSuccess("Registration successful! Redirecting to login...");
      resetLocalState();
      setTimeout(() => onSwitch?.(), 1500);
    } catch (err) {
      showError(mapSignupError(err));
    } finally {
      setSubmitting(false);
    }
  }, [formData, signup, showSuccess, showError, resetLocalState, onSwitch]);

  // Monitor email verification status
  useEffect(() => {
    const { email, password } = formData;
    if (!verificationSent || emailVerified || !email.trim() || !password.trim()) return;

    let cancelled = false;

    const checkOnce = async () => {
      try {
        setCheckingVerification(true);
        const response = await checkRegistrationVerification(email, password);
        if (cancelled) return;
        if (response.verified) {
          setEmailVerified(true);
          setVerificationSent(false);
          setResendCountdown(0);
          showSuccess("Email verified! Completing registration...");
          await completeRegistration();
        }
      } catch {
        // Silent polling error
      } finally {
        if (!cancelled) setCheckingVerification(false);
      }
    };

    checkOnce();
    const timer = setInterval(checkOnce, 4000);
    const handleFocus = () => checkOnce();
    const handleVisibility = () => document.visibilityState === "visible" && checkOnce();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkRegistrationVerification, formData, emailVerified, verificationSent, showSuccess, completeRegistration]);

  // Monitor currentUser verification
  useEffect(() => {
    if (!currentUser?.emailVerified || emailVerified) return;
    setEmailVerified(true);
    setVerificationSent(false);
    setResendCountdown(0);
    showSuccess("Email verified! Completing registration...");
    completeRegistration();
  }, [currentUser?.emailVerified, emailVerified, showSuccess, completeRegistration]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((v) => (v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) return;

    if (emailVerified) {
      await completeRegistration();
      return;
    }

    const { email, password } = formData;
    setSubmitting(true);

    try {
      await beginEmailVerification(email, password);
      setVerificationSent(true);
      setResendCountdown(60);
      showSuccess("Verification email sent. Please check your inbox and click the link. Registration will complete automatically after verification.");
    } catch (err) {
      if (err?.message?.includes("email-already-in-use")) {
        try {
          const response = await resendRegistrationVerification(email, password);
          if (response.verified) {
            setEmailVerified(true);
            setVerificationSent(false);
            showSuccess("Email verified! Completing registration...");
            await completeRegistration();
          } else {
            setVerificationSent(true);
            setResendCountdown(60);
            showSuccess("Verification email sent. Please check your inbox.");
          }
        } catch (resendErr) {
          showError(resolveVerificationError(resendErr, "Unable to resend verification email."));
        }
      } else {
        showError(mapVerificationError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (submitting || resendCountdown > 0) return;

    const { email, password } = formData;
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await resendRegistrationVerification(email, password);
      if (response.verified) {
        setEmailVerified(true);
        setVerificationSent(false);
        showSuccess("Email verified! Completing registration...");
        await completeRegistration();
      } else {
        setResendCountdown(60);
        showSuccess("Verification email resent. Please check your inbox.");
      }
    } catch (err) {
      showError(resolveVerificationError(err, "Unable to resend verification email."));
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = verificationSent || submitting;
  const { name, email, password, confirmPassword, address, dateOfBirth } = formData;

  return (
    <div className={styles.formBlock}>
      <div className={styles.authHeader}>
        <h2>Create Member Account</h2>
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}
      {success && <p className={styles.successMessage}>{success}</p>}

      <form onSubmit={handleSubmit} className={styles.verticalForm}>
        <FormInput
          label="Email"
          icon={Mail}
          type="email"
          name="email"
          placeholder="example@mail.com"
          value={email}
          onChange={handleCredentialChange("email")}
          disabled={isDisabled}
          required
        />

        <PasswordInput
          label="Password"
          icon={Lock}
          name="password"
          placeholder="At least 8 characters with letters and numbers"
          value={password}
          onChange={handleCredentialChange("password")}
          showPassword={showPasswords}
          onToggle={() => setShowPasswords((v) => !v)}
          disabled={isDisabled}
          required
        />

        <PasswordInput
          label="Confirm Password"
          icon={CheckCircle}
          name="confirmPassword"
          placeholder="Re-enter password"
          value={confirmPassword}
          onChange={handleCredentialChange("confirmPassword")}
          showPassword={showPasswords}
          onToggle={() => setShowPasswords((v) => !v)}
          disabled={isDisabled}
          required
        />

        <FormInput
          label="Name"
          icon={User}
          name="name"
          placeholder="Your name"
          value={name}
          onChange={updateField("name")}
          disabled={isDisabled}
          required
        />

        <FormInput
          label="Date of Birth"
          icon={Calendar}
          type="date"
          name="date_of_birth"
          value={dateOfBirth}
          onChange={updateField("dateOfBirth")}
          disabled={isDisabled}
          required
        />

        <FormInput
          label="Address"
          icon={MapPin}
          name="address"
          placeholder="Street, City"
          value={address}
          onChange={updateField("address")}
          disabled={isDisabled}
          required
        />

        {!verificationSent ? (
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? "Processing..." : "Register"}
          </button>
        ) : (
          <div className={styles.verificationActions}>
            <p className={styles.verificationHint}>
              {checkingVerification
                ? "Checking verification status..."
                : "Waiting for email verification. Registration will complete automatically..."}
            </p>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleResendVerification}
              disabled={submitting || resendCountdown > 0}
            >
              {resendCountdown > 0 ? `Resend Email (${resendCountdown}s)` : "Resend Verification Email"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={resetVerificationProgress}
              disabled={submitting}
            >
              Edit Information
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default RegisterForm;
