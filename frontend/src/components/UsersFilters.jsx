// Search, role-filter, result-count, and clear controls for the UsersPage.
function UsersFilters({
  userFilter,
  onUserFilterChange,
  roleFilter,
  onRoleFilterChange,
  userRoles,
  displayedUsers,
  currentPage,
  pageSize,
  displayedTotal,
  onClearFilters,
}) {
  return (
    <div className="account-notes-toolbar users-filter-toolbar">
      <input
        type="search"
        aria-label="Filter users"
        placeholder="Filter users by name, email, role, or school"
        value={userFilter}
        onChange={(event) => onUserFilterChange(event.target.value)}
      />
      <label className="student-filter-field">
        <span>Role</span>
        <select
          value={roleFilter}
          onChange={(event) => onRoleFilterChange(event.target.value)}
        >
          <option value="all">All roles</option>
          {userRoles.map((userRole) => (
            <option key={userRole} value={userRole}>
              {userRole}
            </option>
          ))}
        </select>
      </label>
      <span className="student-filter-count" aria-live="polite">
        Showing{" "}
        {displayedUsers.length ? (currentPage - 1) * pageSize + 1 : 0}
        {"–"}
        {Math.min(currentPage * pageSize, displayedTotal)} of {displayedTotal}{" "}
        users
      </span>
      {(userFilter || roleFilter !== "all") && (
        <button
          className="student-filter-clear"
          type="button"
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export default UsersFilters;
