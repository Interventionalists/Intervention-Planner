import React, { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ResetPasswordForm } from "./LoginPage";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

async function fetchUserNotes(userId) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes-userFetch/${userId}`);
        const data = await response.json();
        return data.notes;
    } catch (error) {
        console.error("Error fetching user notes:", error);
        throw error;
    }
}


async function loadSchools(currentSchool, setSchools, setSchoolId, setSchoolLoadError) {
  try {
    const response = await fetch(`${API_BASE_URL}/schools-fetch`);
    if (!response.ok) {
      throw new Error(`School request failed (${response.status}).`);
    }

    const data = await response.json();
    if (!Array.isArray(data.schools)) {
      throw new Error("The schools response has an unexpected format.");
    }

    const schoolOptions = data.schools
      .map((record) =>
        typeof record === "string"
          ? null
          : {
              id: record.school_id ?? record.id,
              name: record.school_name ?? record.name,
            }
      )
      .filter(
        (option) =>
          option &&
          option.id != null &&
          typeof option.name === "string" &&
          option.name.trim()
      )
      .map((option) => ({
        id: String(option.id),
        name: option.name.trim(),
      }));

    setSchools(schoolOptions);
    setSchoolId((currentId) =>
      currentId ||
      schoolOptions.find((option) => option.name === currentSchool)?.id ||
      ""
    );
    setSchoolLoadError("");
  } catch {
    setSchoolLoadError("Could not load the school list. Please try again.");
  }
}

// onUserUpdated(updatedUser) lets the parent refresh its user state after a save.
const AccountPage = ({ user, name, initials, onUserUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [schoolId, setSchoolId] = useState(
    user?.school == null ? "" : String(user.school)
  );
  const [schools, setSchools] = useState([]);
  const [schoolLoadError, setSchoolLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  useEffect(() => {
    loadSchools(
      user?.school_name || user?.school,
      setSchools,
      setSchoolId,
      setSchoolLoadError
    );

    fetchUserNotes(user?.id).then((notes) => {
      // Handle the fetched notes if needed
    });
    
  }, [user?.school, user?.school_name]);

  const selectedSchool = schools.find((option) => option.id === schoolId);
  const schoolName =
    selectedSchool?.name ||
    user?.school_name ||
    user?.school ||
    "No school assigned";

  const details = [
    { label: "Name: ", value: name },
    { label: "Email: ", value: user?.email || "Not provided" },
    { label: "Role: ", value: user?.role || "Not provided" },
    { label: "School: ", value: schoolName },
  ];

  const startEditing = () => {
    setSchoolId(user?.school_id == null ? "" : String(user.school_id));
    setSaveError("");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      if (!user?.id) {
        throw new Error("The logged-in user ID is missing.");
      }
      if (!selectedSchool) {
        throw new Error("Select a school from the list.");
      }

      const params = new URLSearchParams({
        user_id: String(user.id),
        new_school_id: selectedSchool.id,
      });
      const response = await fetch(`${API_BASE_URL}/schools-update?${params}`, {
        method: "PUT",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.detail || `School update failed (${response.status}).`
        );
      }

      onUserUpdated?.({
        ...user,
        school_id: selectedSchool.id,
        school_name: selectedSchool.name,
        school: selectedSchool.name,
      });
      setEditing(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Couldn't save your school. Please try again."
      );
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
            {` · ${schoolName}`}
          </p>
        </div>
        
      </section>

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

          {editing && (
            <div className="edit-school">
              <h3>Edit school</h3>
              <label htmlFor="school-select">School</label>
              <select
                id="school-select"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                disabled={schools.length === 0}
              >
                <option value="" disabled>
                  {schoolLoadError ? "School list unavailable" : "Select a school"}
                </option>
                {schools.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              {schoolLoadError && <small>{schoolLoadError}</small>}
              {saveError && <small>{saveError}</small>}

              <div className="edit-actions">
                <button
                  className="primary-button"
                  onClick={handleSave}
                  disabled={!selectedSchool || !user?.id || saving}
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
            </div>
          )}
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
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setChangingPassword((changing) => !changing);
                setPasswordNotice("");
              }}
            >
              {changingPassword ? "Cancel" : "Change"}
            </button>
          </div>

          {passwordNotice && <p className="login-notice">{passwordNotice}</p>}
          {changingPassword && (
            <ResetPasswordForm
              email={user?.email || ""}
              showEmailField={false}
              showHeading={false}
              backLabel="Cancel"
              onBack={() => setChangingPassword(false)}
              onSuccess={() => {
                setChangingPassword(false);
                setPasswordNotice("Password updated successfully.");
              }}
            />
          )}

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
            <h2>Notes</h2>
            <UserRound size={18} />
          </div>

          <p className="Note-description">
            Add any notes or comments about your students and job responsibilities.
          </p>

          <div className="card student-table-card">
          <div className="table-head">
            <span>Text</span>
            <span>Date</span>
            <span>Student</span>
          </div>

          <div className="table-body">
            <div className="table-row">
              
            </div>
          </div>
        </div>
        </section>
      </div>
    </div>
  );
};

export default AccountPage;