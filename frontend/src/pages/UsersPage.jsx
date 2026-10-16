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

function UsersPage({ role }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [userFilter, setUserFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

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
            {filteredUsers.length ? (
              <div className="user-list">
                {filteredUsers.map((user) => (
                  <article className="card user-row" key={user.public_id}>
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
                  </article>
                ))}
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
