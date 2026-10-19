import { useEffect, useState } from "react";
import { PageHeading } from "../components/PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const PAGE_SIZE = 25;
const USER_ROLES = ["teacher", "interventionist", "admin"];

function displayName(user) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.name ||
    user.email ||
    "Unnamed user"
  );
}

//formats a Date as the local "YYYY-MM-DDTHH:mm" string a datetime-local input expects
function toDateTimeLocal(date) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
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
  const [debouncedUserFilter, setDebouncedUserFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
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
  const firstVisiblePage = Math.max(
    1,
    Math.min(currentPage - 3, totalPages - 6)
  );
  const visiblePageNumbers = Array.from(
    { length: Math.min(totalPages, 7) },
    (_, index) => firstVisiblePage + index
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedUserFilter(userFilter.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [userFilter]);
  const [lockingUserId, setLockingUserId] = useState(null);
  const [lockUntil, setLockUntil] = useState("");
  const [lockError, setLockError] = useState("");

  useEffect(() => {
    if (role !== "admin") {
      setUsers([]);
      setTotalUsers(0);
      setTotalPages(0);
      setError("Admin access is required to view users.");
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadUsers() {
      setIsLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          search: debouncedUserFilter,
        });
        if (roleFilter !== "all") {
          params.set("role", roleFilter);
        }
        const response = await apiFetch(
          `${API_BASE_URL}/admins-fetch-all-users?${params}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`User request failed (${response.status}).`);
        }

        const data = await response.json();
        if (
          !Array.isArray(data.users) ||
          !Number.isInteger(data.total) ||
          !Number.isInteger(data.total_pages)
        ) {
          throw new Error("The users response has an unexpected format.");
        }
        setUsers(data.users);
        setTotalUsers(data.total);
        setTotalPages(data.total_pages);
        if (data.total_pages > 0 && currentPage > data.total_pages) {
          setCurrentPage(data.total_pages);
        }
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
  }, [currentPage, debouncedUserFilter, reloadKey, role, roleFilter]);

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

  const startEditing = (user) => {
    setLockingUserId(null);
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
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      console.error("Error updating user:", saveError);
      setEditError(saveError.message || "Could not update this user.");
    } finally {
      setSavingUserId(null);
    }
  };

  const startLocking = (user) => {
    setEditingUserId(null);
    setLockingUserId(user.id);
    setLockUntil(toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
    setLockError("");
    setEditMessage("");
  };

  const cancelLocking = () => {
    setLockingUserId(null);
    setLockError("");
  };

  //sends a new locked_until timestamp; a time in the past (e.g. now) unlocks the account
  const updateUserLock = async (user, lockedUntil, successMessage) => {
    setSavingUserId(user.id);
    setLockError("");
    setEditMessage("");

    try {
      const params = new URLSearchParams({ locked_until: lockedUntil });
      const response = await apiFetch(
        `${API_BASE_URL}/admins-users-lock/${encodeURIComponent(user.id)}?${params}`,
        { method: "PATCH" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `User lock update failed (${response.status}).`
        );
      }
      if (!data.user || data.user.id !== user.id) {
        throw new Error("The user lock response has an unexpected format.");
      }

      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id ? data.user : currentUser
        )
      );
      setLockingUserId(null);
      setEditMessage(successMessage);
    } catch (lockUpdateError) {
      console.error("Error updating user lock:", lockUpdateError);
      setLockError(lockUpdateError.message || "Could not update this user's lock.");
    } finally {
      setSavingUserId(null);
    }
  };

  const lockUser = (event, user) => {
    event.preventDefault();
    const until = new Date(lockUntil);
    if (Number.isNaN(until.getTime()) || until <= new Date()) {
      setLockError("Choose a date and time in the future.");
      return;
    }
    updateUserLock(
      user,
      until.toISOString(),
      `${displayName(user)} is locked until ${until.toLocaleString()}.`
    );
  };

  const unlockUser = (user) =>
    updateUserLock(
      user,
      new Date().toISOString(),
      `${displayName(user)} was unlocked.`
    );

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
              onChange={(event) => {
                setUserFilter(event.target.value);
                setCurrentPage(1);
              }}
            />
            <label className="student-filter-field">
              <span>Role</span>
              <select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All roles</option>
                {USER_ROLES.map((userRole) => (
                  <option key={userRole} value={userRole}>
                    {userRole}
                  </option>
                ))}
              </select>
            </label>
            <span className="student-filter-count" aria-live="polite">
              Showing {users.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
              {"–"}
              {Math.min(currentPage * PAGE_SIZE, totalUsers)} of {totalUsers} users
            </span>
            {(userFilter || roleFilter !== "all") && (
              <button
                className="student-filter-clear"
                type="button"
                onClick={() => {
                  setUserFilter("");
                  setRoleFilter("all");
                  setCurrentPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <section className="student-list-section">
            <h2>Users</h2>
            {editMessage && <p className="assignment-success" role="status">{editMessage}</p>}
            {users.length ? (
              <div className="user-list">
                {users.map((user) => {
                  const isEditing = editingUserId === user.id;
                  const isLocking = lockingUserId === user.id;
                  const isSaving = savingUserId === user.id;
                  const isSelf = user.public_id === signedInUser?.public_id;
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
                      ) : isLocking ? (
                        <form
                          className="user-edit-form"
                          onSubmit={(event) => lockUser(event, user)}
                        >
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
                            <button
                              className="ghost-button"
                              type="submit"
                              disabled={isSaving}
                            >
                              {isSaving ? "Saving..." : "Lock account"}
                            </button>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => unlockUser(user)}
                              disabled={isSaving}
                            >
                              Unlock now
                            </button>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={cancelLocking}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
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
                            {user.school
                              ? `School ID ${user.school}`
                              : "No school assigned"}
                          </span>
                          <div className="user-row-actions">
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => startEditing(user)}
                            >
                              Edit
                            </button>
                            {!isSelf && (
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => startLocking(user)}
                              >
                                Lock / Unlock
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="card">
                <p>
                  {totalUsers
                    ? "No users are available on this page."
                    : "No users match your search and filters."}
                </p>
              </div>
            )}
          </section>
          {totalPages > 1 && (
            <nav className="users-pagination" aria-label="Users pages">
              <button
                className="ghost-button"
                type="button"
                disabled={currentPage === 1 || isLoading}
                onClick={() => setCurrentPage((page) => page - 1)}
              >
                Previous
              </button>
              {visiblePageNumbers.map((page) => (
                  <button
                    className={`ghost-button${page === currentPage ? " active" : ""}`}
                    type="button"
                    key={page}
                    aria-current={page === currentPage ? "page" : undefined}
                    disabled={isLoading}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
              ))}
              <button
                className="ghost-button"
                type="button"
                disabled={currentPage === totalPages || isLoading}
                onClick={() => setCurrentPage((page) => page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export default UsersPage;
