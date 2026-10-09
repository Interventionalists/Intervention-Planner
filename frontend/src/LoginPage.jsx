import React, { useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MIN_PASSWORD_LENGTH = 8;

function LoginPage({ onSubmit }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showLogin = () => {
    setMode("login");
    setError("");
  };

  const showReset = () => {
    setMode("reset");
    setError("");
    setNotice("");
  };

  const handlePasswordReset = () => {
    setMode("login");
    setPassword("");
    setError("");
    setNotice("Password updated. Sign in with your new password.");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (response.status === 423) {
          const body = await response.json().catch(() => ({}));
          setError(body.detail || "Account locked. Please try again later.");
        } else {
          setError("Invalid email or password.");
        }
        return;
      }

      const user = await response.json();
      onSubmit(user);
    } catch (err) {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-brand-panel">
        <div className="login-brand">
          <div className="login-brand-mark">I</div>
          <span>Interventioner</span>
        </div>
        <div className="login-brand-copy">
          <p className="login-eyebrow">Student support workspace</p>
          <h1>Student information, in one place.</h1>
          <p className="login-brand-description">
            Keep student goals, interventions, and progress in view.
          </p>
        </div>
        <p className="login-brand-footer">Fall 2026 · Intervention planning</p>
      </section>
      <section className="login-content">
        <div className="login-form-wrap">
          {mode === "reset" ? (
            <ResetPasswordForm
              email={email}
              onEmailChange={setEmail}
              onBack={showLogin}
              onSuccess={handlePasswordReset}
            />
          ) : (
            <>
              <div className="login-lock-icon">
                <LockKeyhole size={20} strokeWidth={1.8} />
              </div>
              <p className="login-eyebrow">Your workspace</p>
              <h2>Welcome back</h2>
              <p className="login-intro">Sign in to continue to Interventioner.</p>
              <form className="login-form" onSubmit={handleSubmit}>
                <label htmlFor="login-email">Email address</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                {notice && <p className="login-notice">{notice}</p>}
                {error && <p className="login-error">{error}</p>}
                <button className="login-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Signing in…" : "Sign in"}
                  <ArrowRight size={18} />
                </button>
              </form>
              <button className="login-link" type="button" onClick={showReset}>
                Reset password
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

//changes the password via /change-password. There is no email-based reset
//yet, so the user must know their current password.
export function ResetPasswordForm({
  email,
  onEmailChange,
  onBack,
  onSuccess,
  showEmailField = true,
  showHeading = true,
  backLabel = "Back to sign in",
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from your current password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Invalid email or current password.");
        } else {
          const body = await response.json().catch(() => ({}));
          setError(body.detail || "Unable to reset password. Please try again.");
        }
        return;
      }

      onSuccess();
    } catch (err) {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {showHeading && (
        <>
          <div className="login-lock-icon">
            <KeyRound size={20} strokeWidth={1.8} />
          </div>
          <p className="login-eyebrow">Account security</p>
          <h2>Reset password</h2>
          <p className="login-intro">Enter your current password and choose a new one.</p>
        </>
      )}
      <form className="login-form" onSubmit={handleSubmit}>
        {showEmailField && (
          <>
            <label htmlFor="reset-email">Email address</label>
            <input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@school.edu"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
            />
          </>
        )}
        <label htmlFor="reset-current-password">Current password</label>
        <input
          id="reset-current-password"
          name="current-password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your current password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
        <label htmlFor="reset-new-password">New password</label>
        <input
          id="reset-new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
        <label htmlFor="reset-confirm-password">Confirm new password</label>
        <input
          id="reset-confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        {error && <p className="login-error">{error}</p>}
        <button className="login-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Updating…" : "Update password"}
          <ArrowRight size={18} />
        </button>
      </form>
      <button className="login-link" type="button" onClick={onBack}>
        {backLabel === "Back to sign in" && <ArrowLeft size={14} />}
        {backLabel}
      </button>
    </>
  );
}

export default LoginPage;
