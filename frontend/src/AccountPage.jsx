import React from "react";
import {
  Bell,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const preferences = [
  "Weekly email summaries",
  "Session reminders",
  "Student risk alerts",
];

const AccountPage = ({ user, name, initials }) => {
  const details = [
    { label: "Name", value: name },
    { label: "Email", value: user?.email || "Not provided" },
    { label: "Role", value: user?.role || "Not provided" },
    { label: "School", value: user?.school || "Not provided" },
  ];

  return (
    <div className="account-page">
      <div className="page-heading">
        <span className="eyebrow">Account</span>
        <h1>My profile</h1>
        <p>Manage your teacher account and intervention preferences.</p>
      </div>

      <section className="card account-header">
        <div className="account-avatar">{initials}</div>
        <div className="account-header-copy">
          <h2>{name}</h2>
          <p>{user?.role || "Account"}{user?.school ? ` · ${user.school}` : ""}</p>
        </div>
        <button className="primary-button">Edit profile</button>
      </section>

      <div className="account-grid">
        <section className="card account-card">
          <div className="card-title">
            <h2>Account details</h2>
            <span className="status-pill">
              <CheckCircle2 size={15} /> Active
            </span>
          </div>

          <div className="detail-list">
            {details.map(({ label, value }) => (
              <div className="detail-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card account-card">
          <div className="card-title">
            <h2>Preferences</h2>
            <Bell size={18} />
          </div>

          <ul className="check-list">
            {preferences.map((item) => (
              <li key={item}>
                <CheckCircle2 size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card account-card security-card">
          <div className="card-title">
            <h2>Security</h2>
            <ShieldCheck size={18} />
          </div>

          <div className="security-item">
            <div className="security-icon">
              <Lock size={17} />
            </div>
            <div>
              <strong>Password</strong>
              <small>Last updated 2 weeks ago</small>
            </div>
            <button className="text-button">Change</button>
          </div>

          <div className="security-item">
            <div className="security-icon muted-icon">
              <Mail size={17} />
            </div>
            <div>
              <strong>Email notifications</strong>
              <small>Verified and enabled</small>
            </div>
            <button className="text-button">Manage</button>
          </div>
        </section>

        <section className="card account-card">
          <div className="card-title">
            <h2>Profile</h2>
            <UserRound size={18} />
          </div>

          <p className="profile-note">
            Support for student progress tracking, intervention planning, and data review
            is enabled for this account.
          </p>
          <button className="secondary-button">View access overview</button>
        </section>
      </div>
    </div>
  );
};

export default AccountPage;