import { useState } from "react";
import { PageHeading } from "../components/PageElements";
import UserManagementRow from "../components/UserManagementRow";
import UsersFilters from "../components/UsersFilters";
import { USER_ROLES } from "../utils/users";
import { useUserAdminActions } from "../hooks/useUserAdminActions";
import { PAGE_SIZE, useUsersDirectory } from "../hooks/useUsersDirectory";

function UsersPage({ role, signedInUser, onUserUpdated }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [roleFilter, setRoleFilter] = useState("all");
  const directory = useUsersDirectory(role, roleFilter, reloadKey);
  const actions = useUserAdminActions({
    setUsers: directory.setUsers,
    schools: directory.schools,
    signedInUser,
    onUserUpdated,
    onUsersChanged: () => setReloadKey((key) => key + 1),
  });

  const clearFilters = () => {
    directory.setUserFilter("");
    setRoleFilter("all");
    directory.setCurrentPage(1);
  };

  return (
    <>
      <PageHeading
        eyebrow="Users"
        title="All users"
        subtitle="Review user accounts across your organization."
      />
      <UsersFilters
        userFilter={directory.userFilter}
        onUserFilterChange={(value) => {
          directory.setUserFilter(value);
          directory.setCurrentPage(1);
        }}
        roleFilter={roleFilter}
        onRoleFilterChange={(value) => {
          setRoleFilter(value);
          directory.setCurrentPage(1);
        }}
        userRoles={USER_ROLES}
        displayedUsers={directory.displayedUsers}
        currentPage={directory.currentPage}
        pageSize={PAGE_SIZE}
        displayedTotal={directory.displayedTotal}
        onClearFilters={clearFilters}
      />

      {directory.isLoading ? (
        <div className="card" role="status">
          Loading users...
        </div>
      ) : directory.error ? (
        <div className="card" role="alert">
          <p>{directory.error}</p>
          {role === "admin" && (
            <button
              className="text-button"
              type="button"
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
            {actions.editMessage && (
              <p className="assignment-success" role="status">
                {actions.editMessage}
              </p>
            )}
            {directory.displayedUsers.length ? (
              <div className="user-list">
                {directory.displayedUsers.map((user) => (
                  <UserManagementRow
                    key={user.public_id}
                    user={user}
                    signedInUser={signedInUser}
                    mode={
                      actions.activeForm?.userId === user.id
                        ? actions.activeForm.type
                        : "view"
                    }
                    isSaving={actions.savingUserId === user.id}
                    editDraft={actions.editDraft}
                    setEditDraft={actions.setEditDraft}
                    schools={directory.schools}
                    schoolsLoading={directory.schoolsLoading}
                    schoolsError={directory.schoolsError}
                    editError={actions.editError}
                    lockUntil={actions.lockUntil}
                    setLockUntil={actions.setLockUntil}
                    lockError={actions.lockError}
                    onSave={(event) => actions.saveUser(event, user)}
                    onCancelEdit={actions.cancelEditing}
                    onStartEdit={() => actions.startEditing(user)}
                    onStartLock={() => actions.startLocking(user)}
                    onLock={(event) => actions.lockUser(event, user)}
                    onUnlock={() => actions.unlockUser(user)}
                    onCancelLock={actions.cancelLocking}
                  />
                ))}
              </div>
            ) : (
              <div className="card">
                <p>
                  {directory.displayedTotal
                    ? "No users are available on this page."
                    : "No users match your search and filters."}
                </p>
              </div>
            )}
          </section>
          {directory.displayedTotalPages > 1 && (
            <nav className="users-pagination" aria-label="Users pages">
              <button
                className="ghost-button"
                type="button"
                disabled={directory.currentPage === 1 || directory.isLoading}
                onClick={() =>
                  directory.setCurrentPage((page) => page - 1)
                }
              >
                Previous
              </button>
              {directory.visiblePageNumbers.map((page) => (
                <button
                  className={`ghost-button${
                    page === directory.currentPage ? " active" : ""
                  }`}
                  type="button"
                  key={page}
                  aria-current={
                    page === directory.currentPage ? "page" : undefined
                  }
                  disabled={directory.isLoading}
                  onClick={() => directory.setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                className="ghost-button"
                type="button"
                disabled={
                  directory.currentPage === directory.displayedTotalPages ||
                  directory.isLoading
                }
                onClick={() =>
                  directory.setCurrentPage((page) => page + 1)
                }
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
