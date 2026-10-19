import { useEffect, useMemo, useState } from "react";
import { PageHeading } from "../components/PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

function displayName(user) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.name ||
    user.email ||
    "Unnamed user"
  );
}

function UsersPage({ role, signedInUser, onUserUpdated }) {
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [userFilter, setUserFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editingUserId, setEditingUserId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "",
  });
  const [editError, setEditError] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);

  useEffect(() => {
    if (role !== "admin") {
      setUsers([]);
      setError("Admin access is required to view users.");
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadUsers() {
      setIsLoading(true);
      setError("");

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/admins-fetch-all-users`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`User request failed (${response.status}).`);
        }

        const data = await response.json();
        if (!Array.isArray(data.users)) {
          throw new Error("The users response has an unexpected format.");
        }
        setUsers(data.users);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Error fetching users:", loadError);
          setError("Could not load users. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadUsers();
    return () => controller.abort();
  }, [reloadKey, role]);

  useEffect(() => {
    if (role !== "admin") {
      setSchools([]);
      setSchoolsError("Admin access is required to view schools.");
      setSchoolsLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadSchools() {
      setSchoolsLoading(true);
      setSchoolsError("");

      try {
        const response = await apiFetch(`${API_BASE_URL}/schools-fetch`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`School request failed (${response.status}).`);
        }

        const data = await response.json();
        if (!Array.isArray(data.schools)) {
          throw new Error("The schools response has an unexpected format.");
        }

        const schoolOptions = data.schools
          .map((school) =>
            school && typeof school === "object"
              ? {
                  id: school.school_id ?? school.id,
                  name: school.school_name ?? school.name,
                }
              : null
          )
          .filter(
            (school) =>
              school &&
              school.id != null &&
              typeof school.name === "string" &&
              school.name.trim()
          )
          .map((school) => ({
            id: String(school.id),
            name: school.name.trim(),
          }));

        setSchools(schoolOptions);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Error fetching schools:", loadError);
          setSchoolsError("Could not load schools. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setSchoolsLoading(false);
        }
      }
    }

    loadSchools();
    return () => controller.abort();
  }, [role]);

  const roles = useMemo(
    () => [...new Set(users.map((user) => user.role).filter(Boolean))].sort(),
    [users]
  );
  const normalizedQuery = userFilter.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const searchText = [
      displayName(user),
      user.email,
      user.role,
      user.school,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      searchText.includes(normalizedQuery) &&
      (roleFilter === "all" || user.role === roleFilter)
    );
  });

  const startEditing = (user) => {
    setEditingUserId(user.id);
    setEditDraft({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      role: user.role || "teacher",
      school: user.school == null ? "" : String(user.school),
    });
    setEditError("");
    setEditMessage("");
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditError("");
  };

  const saveUser = async (event, user) => {
    event.preventDefault();
    setSavingUserId(user.id);
    setEditError("");
    setEditMessage("");

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admins-users/${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...editDraft,
            school: editDraft.school ? Number(editDraft.school) : null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `User update failed (${response.status}).`
        );
      }
      if (!data.user || data.user.id !== user.id) {
        throw new Error("The user update response has an unexpected format.");
      }

      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id ? data.user : currentUser
        )
      );
      if (data.user.public_id === signedInUser?.public_id) {
        onUserUpdated({
          ...signedInUser,
          ...data.user,
          school_name:
            schools.find(
              (school) => school.id === String(data.user.school ?? "")
            )?.name || "",
        });
      }
      setEditingUserId(null);
      setEditMessage(`${displayName(data.user)} was updated.`);
    } catch (saveError) {
      console.error("Error updating user:", saveError);
      setEditError(saveError.message || "Could not update this user.");
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Users"
        title="All users"
        subtitle="Review user accounts across your organization."
      />
      {isLoading ? (
        <div className="card" role="status">Loading users...</div>
      ) : error ? (
        <div className="card" role="alert">
          <p>{error}</p>
          {role === "admin" && (
            <button
              className="text-button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="account-notes-toolbar users-filter-toolbar">
            <input
              type="search"
              aria-label="Filter users"
              placeholder="Filter users by name, email, role, or school"
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
            />
            <label className="student-filter-field">
              <span>Role</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="all">All roles</option>
                {roles.map((userRole) => (
                  <option key={userRole} value={userRole}>
                    {userRole}
                  </option>
                ))}
              </select>
            </label>
            <span className="student-filter-count" aria-live="polite">
              Showing {filteredUsers.length} of {users.length} users
            </span>
            {(userFilter || roleFilter !== "all") && (
              <button
                className="student-filter-clear"
                type="button"
                onClick={() => {
                  setUserFilter("");
                  setRoleFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <section className="student-list-section">
            <h2>Users</h2>
            {editMessage && <p className="assignment-success" role="status">{editMessage}</p>}
            {filteredUsers.length ? (
              <div className="user-list">
                {filteredUsers.map((user) => {
                  const isEditing = editingUserId === user.id;
                  const isSaving = savingUserId === user.id;
                  return (
                    <article className="card user-row" key={user.public_id}>
                      {isEditing ? (
                        <form
                          className="user-edit-form"
                          onSubmit={(event) => saveUser(event, user)}
                        >
                          <label>
                            First name
                            <input
                              required
                              maxLength={100}
                              value={editDraft.first_name}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  first_name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Last name
                            <input
                              required
                              maxLength={100}
                              value={editDraft.last_name}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  last_name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="user-edit-email">
                            Email
                            <input
                              type="email"
                              required
                              maxLength={254}
                              value={editDraft.email}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  email: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="user-edit-role">
                            Role
                            <select
                              required
                              value={editDraft.role}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  role: event.target.value,
                                }))
                              }
                            >
                              <option value="teacher">Teacher</option>
                              <option value="interventionist">Interventionist</option>
                              <option value="admin">Admin</option>
                            </select>
                          </label>
                          <label className="user-edit-school">
                            School
                            <select
                              disabled={schoolsLoading || Boolean(schoolsError)}
                              value={editDraft.school}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  school: event.target.value,
                                }))
                              }
                            >
                              <option value="">
                                {schoolsLoading
                                  ? "Loading schools..."
                                  : schoolsError
                                    ? "School list unavailable"
                                    : "No school assigned"}
                              </option>
                              {schools.map((school) => (
                                <option key={school.id} value={school.id}>
                                  {school.name}
                                </option>
                              ))}
                            </select>
                            {schoolsError && (
                              <span className="user-school-error" role="alert">
                                {schoolsError}
                              </span>
                            )}
                          </label>
                          <div className="user-edit-actions">
                            <button
                              className="ghost-button"
                              type="submit"
                              disabled={isSaving}
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={cancelEditing}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                          </div>
                          {editError && (
                            <p className="assignment-error" role="alert">
                              {editError}
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
                            {user.school
                              ? `School ID ${user.school}`
                              : "No school assigned"}
                          </span>
                          <button
                            className="ghost-button user-edit-button"
                            type="button"
                            onClick={() => startEditing(user)}
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="card">
                <p>
                  {users.length
                    ? "No users match your search and filters."
                    : "There are no users to display."}
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default UsersPage;
