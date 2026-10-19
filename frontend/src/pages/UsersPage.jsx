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

function toDateTimeLocal(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function UserRow({
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
            {button("Edit", onStartEdit)}
            {!isSelf && button("Lock / Unlock", onStartLock)}
          </div>
        </>
      )}
    </article>
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
  const [debouncedUserFilter, setDebouncedUserFilter] = useState("");
  const [clientSidePagination, setClientSidePagination] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [activeForm, setActiveForm] = useState(null);
  const [editDraft, setEditDraft] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "",
  });
  const [editError, setEditError] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [lockUntil, setLockUntil] = useState("");
  const [lockError, setLockError] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedUserFilter(userFilter.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [userFilter]);

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
        const searching = Boolean(debouncedUserFilter);
        const params = new URLSearchParams({
          page: String(searching ? 1 : currentPage),
          search: "",
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

        if (searching) {
          const allUsers = [...data.users];
          if (Number.isInteger(data.total_pages)) {
            for (let page = 2; page <= data.total_pages; page += 1) {
              const pageParams = new URLSearchParams(params);
              pageParams.set("page", String(page));
              const pageResponse = await apiFetch(
                `${API_BASE_URL}/admins-fetch-all-users?${pageParams}`,
                { signal: controller.signal }
              );
              if (!pageResponse.ok) {
                throw new Error(`User request failed (${pageResponse.status}).`);
              }

              const pageData = await pageResponse.json();
              if (!Array.isArray(pageData.users)) {
                throw new Error("The users response has an unexpected format.");
              }
              allUsers.push(...pageData.users);
            }
          }

          setUsers(allUsers);
          setClientSidePagination(true);
          setTotalUsers(allUsers.length);
          setTotalPages(Math.ceil(allUsers.length / PAGE_SIZE));
          setCurrentPage(1);
        } else {
          setUsers(data.users);
          setClientSidePagination(false);
          setTotalUsers(data.total);
          setTotalPages(data.total_pages);
          if (data.total_pages > 0 && currentPage > data.total_pages) {
            setCurrentPage(data.total_pages);
          }
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

  const filteredUsers = clientSidePagination
    ? users.filter((user) => {
        const schoolName =
          schools.find((school) => String(school.id) === String(user.school))
            ?.name || "";
        const searchableText = [
          displayName(user),
          user.email,
          user.role,
          user.school,
          schoolName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          searchableText.includes(userFilter.trim().toLowerCase()) &&
          (roleFilter === "all" || user.role === roleFilter)
        );
      })
    : users;
  const displayedUsers = clientSidePagination
    ? filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : users;
  const displayedTotal = clientSidePagination
    ? filteredUsers.length
    : totalUsers;
  const displayedTotalPages = clientSidePagination
    ? Math.ceil(filteredUsers.length / PAGE_SIZE)
    : totalPages;
  const firstVisiblePage = Math.max(
    1,
    Math.min(currentPage - 3, displayedTotalPages - 6)
  );
  const visiblePageNumbers = Array.from(
    { length: Math.min(displayedTotalPages, 7) },
    (_, index) => firstVisiblePage + index
  );

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
    setActiveForm({ type: "edit", userId: user.id });
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
    setActiveForm(null);
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
            schools.find((school) => school.id === String(data.user.school ?? ""))
              ?.name || "",
        });
      }
      setActiveForm(null);
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
    setActiveForm({ type: "lock", userId: user.id });
    setLockUntil(toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
    setLockError("");
    setEditMessage("");
  };

  const cancelLocking = () => {
    setActiveForm(null);
    setLockError("");
  };

  // A timestamp in the past unlocks the account.
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
      setActiveForm(null);
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
          Showing{" "}
          {displayedUsers.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
          {"–"}
          {Math.min(currentPage * PAGE_SIZE, displayedTotal)} of{" "}
          {displayedTotal} users
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
      {isLoading ? (
        <div className="card" role="status">
          Loading users...
        </div>
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
          <section className="student-list-section">
            <h2>Users</h2>
            {editMessage && (
              <p className="assignment-success" role="status">
                {editMessage}
              </p>
            )}
            {displayedUsers.length ? (
              <div className="user-list">
                {displayedUsers.map((user) => (
                  <UserRow
                    key={user.public_id}
                    user={user}
                    signedInUser={signedInUser}
                    mode={
                      activeForm?.userId === user.id
                        ? activeForm.type
                        : "view"
                    }
                    isSaving={savingUserId === user.id}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    schools={schools}
                    schoolsLoading={schoolsLoading}
                    schoolsError={schoolsError}
                    editError={editError}
                    lockUntil={lockUntil}
                    setLockUntil={setLockUntil}
                    lockError={lockError}
                    onSave={(event) => saveUser(event, user)}
                    onCancelEdit={cancelEditing}
                    onStartEdit={() => startEditing(user)}
                    onStartLock={() => startLocking(user)}
                    onLock={(event) => lockUser(event, user)}
                    onUnlock={() => unlockUser(user)}
                    onCancelLock={cancelLocking}
                  />
                ))}
              </div>
            ) : (
              <div className="card">
                <p>
                  {displayedTotal
                    ? "No users are available on this page."
                    : "No users match your search and filters."}
                </p>
              </div>
            )}
          </section>
          {displayedTotalPages > 1 && (
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
                disabled={currentPage === displayedTotalPages || isLoading}
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
