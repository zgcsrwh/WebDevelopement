import { useEffect, useState } from "react";
import { Calendar, CheckCircle, Lock, Mail, MapPin, User } from "lucide-react";
import styles from "./LoginRegister.module.css";
import { useAuth } from "../../provider/AuthContext";

const RegisterForm = ({ onSwitch }) => {
  const [name, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [dateOfBirth, setBirthday] = useState("");
  const [emailStepCompleted, setEmailStepCompleted] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sendingVerification, setSendingVerification] = useState(false);
  const [submittingRegistration, setSubmittingRegistration] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const {
    beginEmailVerification,
    resendRegistrationVerification,
    checkRegistrationVerification,
    signup,
  } = useAuth();

  function validateEmailStage() {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return false;
    }
    if (!password.trim() || !confirmPassword.trim()) {
      setError("Please enter and confirm your password before email verification.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    if (password.length < 6) {
      setError("Password should be at least 6 characters.");
      return false;
    }
    return true;
  }

  function resetVerificationProgress() {
    setVerificationSent(false);
    setEmailStepCompleted(false);
    setSuccess("");
    setError("");
  }

  function handleEmailChange(e) {
    setEmail(e.target.value);
    if (verificationSent || emailStepCompleted) {
      resetVerificationProgress();
    }
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (verificationSent || emailStepCompleted) {
      resetVerificationProgress();
    }
  }

  function handleConfirmPasswordChange(e) {
    setConfirmPassword(e.target.value);
    if (verificationSent || emailStepCompleted) {
      resetVerificationProgress();
    }
  }

  useEffect(() => {
    if (!verificationSent || emailStepCompleted || !email.trim() || !password.trim()) {
      return undefined;
    }

    let cancelled = false;

    const pollVerification = async () => {
      try {
        setCheckingVerification(true);
        const response = await checkRegistrationVerification(email, password);
        if (cancelled) {
          return;
        }
        if (response.verified) {
          setEmailStepCompleted(true);
          setVerificationSent(false);
          setSuccess("Email verified.");
          setError("");
        }
      } catch (err) {
        if (!cancelled && err?.message && !err.message.includes("verify your email")) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setCheckingVerification(false);
        }
      }
    };

    pollVerification();
    const timer = setInterval(pollVerification, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [checkRegistrationVerification, email, emailStepCompleted, password, verificationSent]);

  async function handleSendVerification() {
    setError("");
    setSuccess("");

    if (!validateEmailStage()) {
      return;
    }

    setSendingVerification(true);
    try {
      await beginEmailVerification(email, password);
      setVerificationSent(true);
      setSuccess("Verification email sent.");
    } catch (err) {
      if (err?.message?.includes("email-already-in-use")) {
        const response = await resendRegistrationVerification(email, password);
        if (response.verified) {
          setEmailStepCompleted(true);
          setVerificationSent(false);
          setSuccess("Email verified.");
        } else {
          setVerificationSent(true);
          setSuccess("Verification email sent.");
        }
      } else if (err?.message?.includes("invalid-email")) {
        setError("Invalid email format.");
      } else if (err?.message?.includes("weak-password")) {
        setError("Weak password.");
      } else {
        setError(err?.message || "Unable to send verification email.");
      }
    } finally {
      setSendingVerification(false);
    }
  }

  async function handleResendVerification() {
    setError("");
    setSuccess("");

    if (!validateEmailStage()) {
      return;
    }

    setSendingVerification(true);
    try {
      const response = await resendRegistrationVerification(email, password);
      if (response.verified) {
        setEmailStepCompleted(true);
        setVerificationSent(false);
        setSuccess("Email verified.");
      } else {
        setVerificationSent(true);
        setSuccess("Verification email sent.");
      }
    } catch (err) {
      setError(err?.message || "Unable to resend the verification email.");
    } finally {
      setSendingVerification(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!emailStepCompleted) {
      setError("Please complete email verification before filling the rest of the form.");
      return;
    }

    if (!name.trim() || !address.trim() || !dateOfBirth) {
      setError("Please complete all remaining profile fields.");
      return;
    }

    setSubmittingRegistration(true);
    try {
      await signup(name, email, password, address, dateOfBirth);
      setSuccess("Registration completed.");
      if (onSwitch) {
        onSwitch();
      }
    } catch (err) {
      setError(err?.message || "Registration failed. Please try again.");
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
                type="password"
                placeholder="At least 6 characters"
                className={styles.inputField}
                value={password}
                onChange={handlePasswordChange}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Confirm password</label>
            <div className={styles.inputWrapper}>
              <CheckCircle className={styles.icon} size={14} />
              <input
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                required
                placeholder="Re-enter password"
                className={styles.inputField}
              />
            </div>
          </div>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleSendVerification}
              disabled={sendingVerification || emailStepCompleted}
            >
              {emailStepCompleted
                ? "Email verified"
                : sendingVerification
                  ? "Sending..."
                  : checkingVerification && verificationSent
                    ? "Checking verification..."
                    : "Send verification email"}
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={handleResendVerification}
              disabled={sendingVerification || !verificationSent || emailStepCompleted}
            >
              Resend email
            </button>
          </div>
        </div>

        <div className={`${styles.sectionCard} ${!emailStepCompleted ? styles.sectionLocked : ""}`}>
          <div className={styles.sectionHeading}>
            <span className={styles.stepBadge}>2</span>
            <div>
              <h3>Member profile details</h3>
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
