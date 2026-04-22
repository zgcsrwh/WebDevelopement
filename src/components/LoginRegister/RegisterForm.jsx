import { useEffect, useState } from "react";
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

const RegisterForm = ({ onSwitch }) => {
  const [name, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [dateOfBirth, setBirthday] = useState("");
  const [emailStepCompleted, setEmailStepCompleted] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sendingVerification, setSendingVerification] = useState(false);
  const [submittingRegistration, setSubmittingRegistration] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const {
    currentUser,
    registrationPending,
    beginEmailVerification,
    resendRegistrationVerification,
    checkRegistrationVerification,
    discardPendingRegistration,
    signup,
  } = useAuth();
  const [hasInitialized, setHasInitialized] = useState(false);

  function resetLocalState() {
    setUserName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setAddress("");
    setBirthday("");
    setEmailStepCompleted(false);
    setVerificationSent(false);
    setShowPasswords(false);
    setError("");
    setSuccess("");
    setSendingVerification(false);
    setSubmittingRegistration(false);
    setCheckingVerification(false);
    setResendCountdown(0);
  }

  function showError(message) {
    setError(message);
    setSuccess("");
  }

  function showSuccess(message) {
    setSuccess(message);
    setError("");
  }

  function validateEmailStage() {
    if (!email.trim()) {
      showError("Please enter your email address first.");
      return false;
    }
    if (!emailPattern.test(email.trim())) {
      showError("Please enter a valid email address.");
      return false;
    }
    if (!password.trim() || !confirmPassword.trim()) {
      showError("Please enter and confirm your password before email verification.");
      return false;
    }
    if (password !== confirmPassword) {
      showError("Passwords do not match.");
      return false;
    }
    if (!isStrongPassword(password)) {
      showError("Password must be at least 8 characters and include both letters and numbers.");
      return false;
    }
    return true;
  }

  async function resetVerificationProgress() {
    setVerificationSent(false);
    setEmailStepCompleted(false);
    setResendCountdown(0);
    setSuccess("");
    setError("");
    await discardPendingRegistration();
  }

  useEffect(() => {
    if (hasInitialized) {
      return;
    }

    setHasInitialized(true);
    resetLocalState();

    if (currentUser || registrationPending) {
      discardPendingRegistration().catch(() => null);
    }
  }, [currentUser, discardPendingRegistration, hasInitialized, registrationPending]);

  async function handleEmailChange(e) {
    setEmail(e.target.value);
    if (verificationSent || emailStepCompleted) {
      await resetVerificationProgress();
    }
  }

  async function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (verificationSent || emailStepCompleted) {
      await resetVerificationProgress();
    }
  }

  async function handleConfirmPasswordChange(e) {
    setConfirmPassword(e.target.value);
    if (verificationSent || emailStepCompleted) {
      await resetVerificationProgress();
    }
  }

  useEffect(() => {
    if (!verificationSent || emailStepCompleted || !email.trim() || !password.trim()) {
      return undefined;
    }

    let cancelled = false;

    const checkVerificationOnce = async () => {
      try {
        setCheckingVerification(true);
        const response = await checkRegistrationVerification(email, password);
        if (cancelled) {
          return;
        }
        if (response.verified) {
          setEmailStepCompleted(true);
          setVerificationSent(false);
          setResendCountdown(0);
          showSuccess("Email verified.");
        }
      } catch (err) {
        // This is only a passive status refresh after the cooldown ends.
        // If the user has not clicked the email verification link yet,
        // the page should stay quiet instead of showing an error banner.
      } finally {
        if (!cancelled) {
          setCheckingVerification(false);
        }
      }
    };

    checkVerificationOnce();

    const timer = window.setInterval(checkVerificationOnce, 4000);
    const handleFocus = () => {
      checkVerificationOnce();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVerificationOnce();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkRegistrationVerification, email, emailStepCompleted, password, verificationSent]);

  useEffect(() => {
    if (!currentUser?.emailVerified || emailStepCompleted) {
      return;
    }

    setEmailStepCompleted(true);
    setVerificationSent(false);
    setResendCountdown(0);
    showSuccess("Email verified.");
  }, [currentUser?.emailVerified, emailStepCompleted]);

  useEffect(() => {
    if (resendCountdown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setResendCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCountdown]);

  function startResendCountdown() {
    setResendCountdown(60);
  }

  function togglePasswords() {
    setShowPasswords((value) => !value);
  }

  async function handleSendVerification() {
    if (sendingVerification || emailStepCompleted || resendCountdown > 0) {
      return;
    }

    setError("");
    setSuccess("");

    if (!validateEmailStage()) {
      return;
    }

    setSendingVerification(true);
    try {
      await beginEmailVerification(email, password);
      setVerificationSent(true);
      startResendCountdown();
      showSuccess("Verification email sent. Please check your inbox.");
    } catch (err) {
      const code = getErrorCode(err);
      const normalizedMessage = getErrorMessage(err, "Unable to send verification email.");
      if (err?.message?.includes("email-already-in-use")) {
        try {
          const response = await resendRegistrationVerification(email, password);
          if (response.verified) {
            setEmailStepCompleted(true);
            setVerificationSent(false);
            showSuccess("Email verified.");
          } else {
            setVerificationSent(true);
            startResendCountdown();
            showSuccess("Verification email sent. Please check your inbox.");
          }
        } catch (resendError) {
          showError(resolveVerificationError(resendError, "Unable to resend the verification email."));
        }
      } else if (err?.message?.includes("already exists for this email")) {
        showError("This email already has a completed member account. Please sign in instead.");
        } else if (err?.message?.includes("staff or admin account")) {
          showError("This email belongs to a staff or admin account and cannot be used for member registration.");
        } else if (err?.message?.includes("weak-password")) {
          showError("Password must be at least 8 characters and include both letters and numbers.");
        } else if (code === "internal" || code === "unavailable" || normalizedMessage.toLowerCase() === "internal") {
          showError("Unable to complete email verification right now. Please try again.");
        } else {
          showError(resolveVerificationError(err, "Unable to send verification email."));
        }
    } finally {
      setSendingVerification(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!emailStepCompleted) {
      showError("Please complete email verification before filling the rest of the form.");
      return;
    }

    if (!name.trim()) {
      showError("Please enter your full name before completing registration.");
      return;
    }

    if (!dateOfBirth) {
      showError("Please choose your date of birth before completing registration.");
      return;
    }

    if (!address.trim()) {
      showError("Please enter your address before completing registration.");
      return;
    }

    setSubmittingRegistration(true);
    try {
      await signup(name, email, password, address, dateOfBirth);
      showSuccess("Registration completed.");
      resetLocalState();
      if (onSwitch) {
        onSwitch();
      }
    } catch (err) {
      const code = getErrorCode(err);
      const normalizedMessage = getErrorMessage(err, "Registration failed. Please try again.");

      if (err?.message?.includes("already exists for this email")) {
        showError("This email already has a completed member account. Please sign in instead.");
        } else if (err?.message?.includes("staff or admin account")) {
          showError("This email belongs to a staff or admin account and cannot be used for member registration.");
        } else if (code === "already-exists") {
          showError("This email address is already registered. Please sign in instead.");
        } else if (code === "internal" || code === "unavailable" || normalizedMessage.toLowerCase() === "internal") {
          showError("Registration failed. Please try again.");
        } else {
          showError(normalizedMessage);
        }
    } finally {
      setSubmittingRegistration(false);
    }
  }

  return (
    <div className={styles.formBlock}>
      <div className={styles.authHeader}>
        <h2>Create member account</h2>
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}
      {success && <p className={styles.successMessage}>{success}</p>}

      <form onSubmit={handleRegister} className={styles.verticalForm}>
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeading}>
            <span className={styles.stepBadge}>1</span>
            <div>
              <h3>Email verification</h3>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Email</label>
            <div className={styles.inputWrapper}>
              <Mail className={styles.icon} size={14} />
              <input
                name="email"
                type="email"
                placeholder="example@mail.com"
                className={styles.inputField}
                value={email}
                onChange={handleEmailChange}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Password</label>
            <div className={styles.inputWrapper}>
              <Lock className={styles.icon} size={14} />
              <input
                name="password"
                type={showPasswords ? "text" : "password"}
                placeholder="At least 8 characters, with letters and numbers"
                className={`${styles.inputField} ${styles.inputFieldWithAction}`}
                value={password}
                onChange={handlePasswordChange}
                required
              />
              <button
                type="button"
                className={styles.inputActionBtn}
                onClick={togglePasswords}
                aria-label={showPasswords ? "Hide password" : "Show password"}
              >
                {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Confirm password</label>
            <div className={styles.inputWrapper}>
              <CheckCircle className={styles.icon} size={14} />
              <input
                name="confirmPassword"
                type={showPasswords ? "text" : "password"}
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                required
                placeholder="Confirm password"
                className={styles.inputField}
              />
            </div>
          </div>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleSendVerification}
              disabled={sendingVerification || checkingVerification || emailStepCompleted || resendCountdown > 0}
            >
              {emailStepCompleted
                ? "Email verified"
                : sendingVerification
                  ? "Sending..."
                  : resendCountdown > 0
                    ? `Send verification email (${resendCountdown}s)`
                    : "Send verification email"}
            </button>
          </div>
        </div>

        <div className={`${styles.sectionCard} ${!emailStepCompleted ? styles.sectionLocked : ""}`}>
          <div className={styles.sectionHeading}>
            <span className={styles.stepBadge}>2</span>
            <div>
              <h3>Member details</h3>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Name</label>
            <div className={styles.inputWrapper}>
              <User className={styles.icon} size={14} />
              <input
                name="name"
                placeholder="Your full name"
                className={styles.inputField}
                value={name}
                onChange={(e) => setUserName(e.target.value)}
                disabled={!emailStepCompleted}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Date of birth</label>
            <div className={styles.inputWrapper}>
              <Calendar className={styles.icon} size={14} />
              <input
                name="date_of_birth"
                type="date"
                className={styles.inputField}
                value={dateOfBirth}
                onChange={(e) => setBirthday(e.target.value)}
                disabled={!emailStepCompleted}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Address</label>
            <div className={styles.inputWrapper}>
              <MapPin className={styles.icon} size={14} />
              <input
                name="address"
                placeholder="Street, City"
                className={styles.inputField}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!emailStepCompleted}
                required
              />
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={submittingRegistration || !emailStepCompleted}>
            {submittingRegistration ? "Completing registration..." : "Complete member registration"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterForm;
