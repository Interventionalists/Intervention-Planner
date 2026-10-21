// Edit and lock/unlock workflows used by the admin UsersPage.
// Owns action form state, API requests, and success/error feedback.
import { useState } from "react";
import { displayName, toDateTimeLocal } from "../utils/users";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

export function useUserAdminActions({
  setUsers,
  schools,
  signedInUser,
  onUserUpdated,
  onUsersChanged,
}) {
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

  const startEditing = (user) => {
    setActiveForm({ type: "edit", userId: user.id });
    setEditDraft({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      role: user.role || "teacher",
      // Keep select values as strings; convert the school ID before saving.
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
      // The parent stores the signed-in user in session state, so refresh it
      // separately when this edit changed the current admin's own profile.
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
      onUsersChanged();
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
      setLockError(
        lockUpdateError.message || "Could not update this user's lock."
      );
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

  // The API interprets a timestamp in the past as an immediate unlock.
  const unlockUser = (user) =>
    updateUserLock(
      user,
      new Date().toISOString(),
      `${displayName(user)} was unlocked.`
    );

  return {
    activeForm,
    editDraft,
    setEditDraft,
    editError,
    editMessage,
    savingUserId,
    lockUntil,
    setLockUntil,
    lockError,
    startEditing,
    cancelEditing,
    saveUser,
    startLocking,
    cancelLocking,
    lockUser,
    unlockUser,
  };
}
