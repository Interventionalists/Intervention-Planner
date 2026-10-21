// One account row in the admin UsersPage directory.
// Renders the user's details or the inline edit and lock/unlock forms.
import { displayName, toDateTimeLocal, USER_ROLES } from "../utils/users";

function UserManagementRow({
  user,
  signedInUser,
  mode,
  isSaving,
  editDraft,
  setEditDraft,
  schools,
  schoolsLoading,
  schoolsError,
  editError,
  lockUntil,
  setLockUntil,
  lockError,
  onSave,
  onCancelEdit,
  onStartEdit,
  onStartLock,
  onLock,
  onUnlock,
  onCancelLock,
}) {
  const isSelf = user.public_id === signedInUser?.public_id;
  // Admins can still edit themselves; other admins' Edit actions are hidden.
  const isOtherAdmin = user.role === "admin" && !isSelf;
  const schoolPlaceholder = schoolsLoading
    ? "Loading schools..."
    : schoolsError
      ? "School list unavailable"
      : "No school assigned";
  const fields = [
    { name: "first_name", label: "First name", maxLength: 100 },
    { name: "last_name", label: "Last name", maxLength: 100 },
    { name: "email", label: "Email", type: "email", maxLength: 254 },
    {
      name: "role",
      label: "Role",
      required: true,
      options: USER_ROLES.map((role) => ({
        value: role,
        label: role[0].toUpperCase() + role.slice(1),
      })),
    },
    {
      name: "school",
      label: "School",
      disabled: schoolsLoading || Boolean(schoolsError),
      options: [
        { value: "", label: schoolPlaceholder },
        ...schools.map((school) => ({ value: school.id, label: school.name })),
      ],
    },
  ];
  const updateField = (name) => (event) =>
    setEditDraft((current) => ({ ...current, [name]: event.target.value }));
  const button = (label, onClick, type = "button") => (
    <button
      className="ghost-button"
      type={type}
      disabled={isSaving}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <article className="card user-row">
      {mode === "edit" ? (
        <form className="user-edit-form" onSubmit={onSave}>
          {fields.map(({ name, label, options, ...props }) => (
            <label key={name} className={`user-edit-${name}`}>
              {label}
              {options ? (
                <select
                  value={editDraft[name]}
                  onChange={updateField(name)}
                  {...props}
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={editDraft[name]}
                  onChange={updateField(name)}
                  required
                  {...props}
                />
              )}
              {name === "school" && schoolsError && (
                <span className="user-school-error" role="alert">
                  {schoolsError}
                </span>
              )}
            </label>
          ))}
          <div className="user-edit-actions">
            {button(isSaving ? "Saving..." : "Save", undefined, "submit")}
            {button("Cancel", onCancelEdit)}
          </div>
          {editError && (
            <p className="assignment-error" role="alert">
              {editError}
            </p>
          )}
        </form>
      ) : mode === "lock" ? (
        <form className="user-edit-form" onSubmit={onLock}>
          <label>
            Lock {displayName(user)} until
            <input
              type="datetime-local"
              required
              min={toDateTimeLocal(new Date())}
              value={lockUntil}
              onChange={(event) => setLockUntil(event.target.value)}
            />
          </label>
          <div className="user-edit-actions">
            {button(isSaving ? "Saving..." : "Lock account", undefined, "submit")}
            {button("Unlock now", onUnlock)}
            {button("Cancel", onCancelLock)}
          </div>
          {lockError && (
            <p className="assignment-error" role="alert">
              {lockError}
            </p>
          )}
        </form>
      ) : (
        <>
          <div>
            <strong>{displayName(user)}</strong>
            <span>{user.email || "No email address"}</span>
          </div>
          <span className="user-role">{user.role || "No role"}</span>
          <span className="user-school">
            {user.school ? `School ID ${user.school}` : "No school assigned"}
          </span>
          <div className="user-row-actions">
            {!isOtherAdmin && button("Edit", onStartEdit)}
            {!isSelf && button("Lock / Unlock", onStartLock)}
          </div>
        </>
      )}
    </article>
  );
}

export default UserManagementRow;
