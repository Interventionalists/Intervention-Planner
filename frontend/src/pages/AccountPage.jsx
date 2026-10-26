import { useEffect, useState } from "react";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import AccountNotesCard from "../components/AccountNotesCard";
import { CardTitle, PageHeading } from "../components/PageElements";
import { ResetPasswordForm } from "../LoginPage";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

async function loadSchools(
  currentSchool,
  currentSchoolId,
  setSchools,
  setSchoolId,
  setSchoolLoadError
) {
  try {
    setSchoolLoadError("");
    const response = await apiFetch(`${API_BASE_URL}/schools-fetch`);
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
      schoolOptions.some((option) => option.id === currentId)
        ? currentId
        : schoolOptions.find((option) => option.id === currentSchoolId)?.id ||
          schoolOptions.find((option) => option.name === currentSchool)?.id ||
          ""
    );
  } catch {
    setSchoolLoadError("Could not load the school list. Please try again.");
  }
}

// onUserUpdated(updatedUser) lets the parent refresh its user state after a save.
const AccountPage = ({ user, name, initials, onUserUpdated }) => {
  const userRole = user?.role?.toLowerCase();
  const canEditProfile = userRole === "admin";
  const canEditSchool =
    userRole === "admin" || userRole === "interventionist";
  const [editing, setEditing] = useState(false);
  const [schoolId, setSchoolId] = useState(
    user?.school_id != null
      ? String(user.school_id)
      : /^\d+$/.test(String(user?.school ?? ""))
        ? String(user.school)
        : ""
  );
  const [profileDraft, setProfileDraft] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    email: user?.email || "",
  });
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolLoadError, setSchoolLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  useEffect(() => {
    setSchoolsLoading(true);
    loadSchools(
      user?.school_name ||
        (typeof user?.school === "string" && !/^\d+$/.test(user.school)
          ? user.school
          : ""),
      user?.school_id == null
        ? /^\d+$/.test(String(user?.school ?? ""))
          ? String(user.school)
          : ""
        : String(user.school_id),
      setSchools,
      setSchoolId,
      setSchoolLoadError
    ).finally(() => setSchoolsLoading(false));
  }, [user?.school, user?.school_id, user?.school_name]);

  const selectedSchool = schools.find((option) => option.id === schoolId);
  const schoolName =
    selectedSchool?.name ||
    user?.school_name ||
    // Never show a numeric foreign key as if it were a human-readable name.
    (typeof user?.school === "string" &&
    !/^\d+$/.test(user.school)
      ? user.school
      : user?.school == null
        ? "No school assigned"
        : "School unavailable");

  const details = [
    { label: "Name: ", value: name },
    { label: "Email: ", value: user?.email || "Not provided" },
    { label: "Role: ", value: user?.role || "Not provided" },
    { label: "School: ", value: schoolName },
  ];
  const startEditing = () => {
    setSchoolId(
      user?.school_id != null
        ? String(user.school_id)
        : /^\d+$/.test(String(user?.school ?? ""))
          ? String(user.school)
          : ""
    );
    setProfileDraft({
      first_name:
        user?.first_name || (name || "").trim().split(/\s+/)[0] || "",
      last_name:
        user?.last_name || (name || "").trim().split(/\s+/).slice(1).join(" "),
      email: user?.email || "",
    });
    setSaveError("");
    setEditing(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      if (!user?.id) {
        throw new Error("The logged-in user ID is missing.");
      }
      if (schoolsLoading || schoolLoadError) {
        throw new Error("Wait for the school list to load before saving.");
      }
      if (schoolId && !selectedSchool) {
        throw new Error("Select a school from the list.");
      }

      const profileUpdates = canEditProfile
        ? {
            ...profileDraft,
            school: selectedSchool ? Number(selectedSchool.id) : null,
          }
        : { school: selectedSchool ? Number(selectedSchool.id) : null };
      const response = await apiFetch(`${API_BASE_URL}/account/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileUpdates),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || `Profile update failed (${response.status}).`);
      }
      if (!result.user || result.user.id !== user.id) {
        throw new Error("The profile update response has an unexpected format.");
      }

      onUserUpdated?.({
        ...user,
        ...result.user,
        school_id: selectedSchool?.id ?? null,
        school_name: selectedSchool?.name ?? "",
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
      <PageHeading
        eyebrow="Account"
        title="My profile"
        subtitle="Manage your teacher account and intervention preferences."
      />

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
          <CardTitle
            title="Account details"
            action={
              !editing && canEditSchool && (
                <button
                  className="text-button"
                  type="button"
                  onClick={startEditing}
                >
                  Edit profile
                </button>
              )
            }
          />

          <div className="detail-list">
            {details.map(({ label, value }) => (
              <div className="detail-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          {editing && (
            <form
              className="user-edit-form account-school-form"
              onSubmit={handleSave}
            >
              <h3>Edit profile</h3>
              <label>
                First name
                <input
                  value={profileDraft.first_name}
                  readOnly={!canEditProfile}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      first_name: event.target.value,
                    }))
                  }
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={profileDraft.last_name}
                  readOnly={!canEditProfile}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      last_name: event.target.value,
                    }))
                  }
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={profileDraft.email}
                  readOnly={!canEditProfile}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  maxLength={254}
                  required
                />
              </label>
              <label>
                Role
                <input value={user?.role || ""} readOnly />
              </label>
              <label>
                School
                <select
                  value={schoolId}
                  onChange={(event) => setSchoolId(event.target.value)}
                  disabled={
                    !canEditSchool ||
                    schoolsLoading ||
                    Boolean(schoolLoadError)
                  }
                >
                  <option value="">No school assigned</option>
                  {schools.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              {schoolLoadError && (
                <p className="assignment-error error-state" role="alert">
                  {schoolLoadError}
                </p>
              )}
              {saveError && (
                <p className="assignment-error error-state" role="alert">
                  {saveError}
                </p>
              )}

              <div className="user-edit-actions">
                <button
                  className="ghost-button"
                  type="submit"
                  disabled={
                    (!canEditProfile && !canEditSchool) ||
                    schoolsLoading ||
                    Boolean(schoolLoadError) ||
                    Boolean(schoolId && !selectedSchool) ||
                    !user?.id ||
                    saving
                  }
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="card account-card security-card">
          <CardTitle
            title="Security"
            action={<ShieldCheck size={18} aria-hidden="true" />}
          />

          <div className="security-item">
            <div className="security-icon">
              <Lock size={17} aria-hidden="true" />
              <strong>Password</strong>
            </div>
            <button
              className="ghost-button"
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
              <Mail size={17} aria-hidden="true" />
              <strong>Email notifications (not implemented yet)</strong>
            </div>
            <button className="ghost-button" type="button">
              Manage
            </button>
          </div>
        </section>

        <AccountNotesCard userId={user?.public_id} />
      </div>
    </div>
  );
};

export default AccountPage;