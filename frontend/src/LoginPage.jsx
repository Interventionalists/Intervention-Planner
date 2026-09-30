import React, { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function LoginPage({ onSubmit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError("Invalid email or password.");
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
            {error && <p className="login-error">{error}</p>}
            <button className="login-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
