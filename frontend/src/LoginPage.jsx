import React from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

// login page handler
function LoginPage({ onSubmit }) {
  const handleSubmit = (event) => {
    event.preventDefault();

    const formData = new FormData(event.target);
    const email = formData.get("email");
    const password = formData.get("password");

    onSubmit({email, password});
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
              required
            />

            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />

            <button className="login-submit" type="submit">
              Sign in
              <ArrowRight size={18} />
            </button>
          </form>
          
          <p className="login-demo-note">
            Demo mode: any email and password will sign you in.
          </p>
        </div>
      </section>
    </main>
  );
}
export default LoginPage;
