import React, { useEffect, useState } from "react";
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

// onUserUpdated(updatedUser) lets the parent refresh its user state after a save.
const AccountPage = ({ user, name, initials, onUserUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [school, setSchool] = useState(user?.school || "");
  const [schools, setSchools] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load all schools once
  useEffect(() => {
    fetch("/api/schools", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setSchools(data.map((s) => s.name ?? s)))
      .catch(() => setSchools([]));
  }, []);

  const details = [
    { label: "Name: ", value: name },
    { label: "Email: ", value: user?.email || "Not provided" },
    { label: "Role: ", value: user?.role || "Not provided" },
    { label: "School: ", value: user?.school || "No school assigned" },
  ];

  const startEditing = () => {
    setSchool(user?.school || "");
    setSaveError("");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Adjust the URL / method / body to match your backend route
      const res = await fetch("", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ school }),
      });
      if (!res.ok) throw new Error("Request failed");
      onUserUpdated?.({ ...user, school });
      setEditing(false);
    } catch {
      setSaveError("Couldn't save your school. Please try again.");
    } finally {
      setSaving(false);
    }
  };

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
          <p>
            {user?.role || "Account"}
            {` · ${user?.school || "No school assigned"}`}
          </p>
        </div>
        
      </section>

      {editing && (
        <section className="card account-card">
          <div className="card-title">
            <h2>Edit school</h2>
          </div>

          <input
            list="school-options"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="Start typing your school"
          />
          <datalist id="school-options">
            {schools.map((schoolName) => (
              <option key={schoolName} value={schoolName} />
            ))}
          </datalist>

          {saveError && <small>{saveError}</small>}

          <div className="edit-actions">
            <button
              className="primary-button"
              onClick={handleSave}
              disabled={!schools.includes(school) || saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              className="secondary-button"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="account-grid">
        <section className="card account-card">
          <div className="card-title">
            <h2>Account details</h2> 
            <span className="status-pill">
              <CheckCircle2 size={15} /> {!editing && (<button className="text-button" onClick={startEditing}><h2>Edit profile</h2></button>)}
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