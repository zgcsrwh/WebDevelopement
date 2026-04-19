import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, Shield } from "lucide-react";
import { useAuth } from "../../provider/AuthContext";
import styles from "./LoginRegister.module.css";

const LoginForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Member");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login, loading } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      const context = await login(email, password, role);
      if (context.role === "Admin") {
        navigate("/admin/facilities");
      } else if (context.role === "Staff") {
        navigate("/staff/requests");
      } else {
        navigate("/home");
      }
    } catch (err) {
      const message = err?.message || "";
      if (message.includes("invalid-credential") || message.includes("user-not-found") || message.includes("wrong-password")) {
        setError("Invalid email or password.");
      } else if (message.includes("Please verify your email")) {
        setError("Please verify your email before signing in.");
      } else if (message.includes("complete your registration details")) {
        setError("Please finish the registration profile after email verification.");
      } else if (message.includes("suspended or deactivated")) {
        setError("This account has been suspended or deactivated by an administrator.");
      } else if (message.includes("Selected identity does not match")) {
        setError(message);
      } else {
        setError(message || "Unable to sign in right now.");
      }
    }
  };

  return (
    <div className={styles.formBlock}>
      <div className={styles.authHeader}>
        <h2>Sign in</h2>
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

      <form onSubmit={handleLogin} className={styles.verticalForm}>
        <div className={styles.inputGroup}>
          <label>Identity</label>
          <div className={styles.inputWrapper}>
            <Shield className={styles.icon} size={18} />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={styles.inputField}
            >
              <option value="Member">Member</option>
              <option value="Staff">Staff</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Email</label>
          <div className={styles.inputWrapper}>
            <Mail className={styles.icon} size={18} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your account email"
              className={styles.inputField}
              required
            />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Password</label>
          <div className={styles.inputWrapper}>
            <Lock className={styles.icon} size={18} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={styles.inputField}
              required
            />
          </div>
        </div>

        <button type="submit" className={styles.submitBtn} disabled={loading}>
          {loading ? "Authenticating..." : "Sign in"}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
