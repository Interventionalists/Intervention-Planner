// Shared user-directory constants and formatting helpers.
// Imported by the UsersPage hooks and row component.
export const USER_ROLES = ["teacher", "interventionist", "admin"];

export function displayName(user) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.name ||
    user.email ||
    "Unnamed user"
  );
}

export function toDateTimeLocal(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
