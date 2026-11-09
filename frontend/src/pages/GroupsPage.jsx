import { useEffect, useState } from "react";
import { PageHeading } from "../components/PageElements";
import GroupScheduleModal from "../components/GroupScheduleModal";
import GroupStudentPicker from "../components/GroupStudentPicker";
import { apiFetch } from "../api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function GroupsPage({ user }) {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [areStudentsLoading, setAreStudentsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [studentsError, setStudentsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editStudentIds, setEditStudentIds] = useState([]);
  const [editError, setEditError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [schedulingGroup, setSchedulingGroup] = useState(null);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [deletingGroupId, setDeletingGroupId] = useState(null);
  const [groupDeleteError, setGroupDeleteError] = useState(null);
  const canCreateGroups = ["admin", "interventionist"].includes(user?.role);

  useEffect(() => {
    const controller = new AbortController();
    setAreStudentsLoading(true);
    setStudentsError("");

    const studentsUrl =
      user?.role === "admin"
        ? `${API_BASE_URL}/students-fetch`
        : `${API_BASE_URL}/students-fetch/${encodeURIComponent(user?.public_id || "")}`;

    apiFetch(studentsUrl, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.detail || "Unable to load assigned students.");
        }
        if (!Array.isArray(result?.students)) {
          throw new Error("The students response has an unexpected format.");
        }
        setStudents(result.students);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setStudentsError(error.message || "Unable to load assigned students.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setAreStudentsLoading(false);
        }
      });

    return () => controller.abort();
  }, [user?.public_id, user?.role]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError("");

    apiFetch(`${API_BASE_URL}/groups-fetch`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.detail || "Unable to load groups.");
        }
        if (!Array.isArray(result?.groups)) {
          throw new Error("The groups response has an unexpected format.");
        }
        setGroups(result.groups);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setLoadError(error.message || "Unable to load groups.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadKey]);

  const createGroup = async (event) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    setIsSaving(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/groups-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          purpose: purpose.trim(),
          student_ids: selectedStudentIds,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || "Unable to create group.");
      }
      if (!result?.group) {
        throw new Error("The create group response has an unexpected format.");
      }
      setGroups((currentGroups) => [
        { ...result.group, student_ids: selectedStudentIds },
        ...currentGroups,
      ]);
      setName("");
      setPurpose("");
      setSelectedStudentIds([]);
      setSuccessMessage(
        selectedStudentIds.length
          ? `Group created and ${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? "" : "s"} added.`
          : "Group created."
      );
    } catch (error) {
      setFormError(error.message || "Unable to create group.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingGroup = (group) => {
    setEditingGroupId(group.id);
    setEditName(group.name);
    setEditPurpose(group.purpose);
    setEditStudentIds(group.student_ids || []);
    setEditError("");
  };

  const cancelEditingGroup = () => {
    setEditingGroupId(null);
    setEditName("");
    setEditPurpose("");
    setEditStudentIds([]);
    setEditError("");
  };

  const saveGroup = async (event, groupId) => {
    event.preventDefault();
    setEditError("");
    setIsEditing(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/groups-edit/${encodeURIComponent(groupId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName.trim(),
            purpose: editPurpose.trim(),
            student_ids: editStudentIds,
          }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || "Unable to update group.");
      }
      if (!result?.group) {
        throw new Error("The edit group response has an unexpected format.");
      }
      setGroups((currentGroups) =>
        currentGroups.map((group) =>
          group.id === groupId ? { ...group, ...result.group } : group
        )
      );
      cancelEditingGroup();
    } catch (error) {
      setEditError(error.message || "Unable to update group.");
    } finally {
      setIsEditing(false);
    }
  };

  const deleteGroup = async (group) => {
    if (
      !window.confirm(
        `Delete "${group.name}"? This will remove the group and its student memberships. Existing scheduled events will remain without this group link. This action cannot be undone.`
      )
    ) {
      return;
    }

    setGroupDeleteError(null);
    setDeletingGroupId(group.id);
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/groups-delete/${encodeURIComponent(group.id)}`,
        { method: "DELETE" }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || "Unable to delete group.");
      }
      if (result?.deleted !== true) {
        throw new Error("The delete group response has an unexpected format.");
      }
      setGroups((currentGroups) =>
        currentGroups.filter((currentGroup) => currentGroup.id !== group.id)
      );
    } catch (error) {
      setGroupDeleteError({
        groupId: group.id,
        message: error.message || "Unable to delete group.",
      });
    } finally {
      setDeletingGroupId(null);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Groups"
        title="Intervention groups"
        subtitle="Create and review intervention groups at your school."
      />

      {canCreateGroups && (
        <section className="card groups-create-layout">
          <div className="groups-create-card">
            <h2>Create a group</h2>
            <form className="groups-create-form" onSubmit={createGroup}>
              <label>
                Group name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Reading support"
                />
              </label>
              <label>
                Purpose
                <textarea
                  required
                  rows={3}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="Describe the group's intervention focus"
                />
              </label>
              <p className="groups-selected-count" aria-live="polite">
                {selectedStudentIds.length
                  ? `${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? "" : "s"} selected`
                  : "Select students to add to this group."}
              </p>
              {formError && <p className="assignment-error" role="alert">{formError}</p>}
              {successMessage && <p className="assignment-success" role="status">{successMessage}</p>}
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Creating..." : "Create group"}
              </button>
            </form>
          </div>

          <div className="groups-assigned-students">
            <h2>{user?.role === "admin" ? "School students" : "Assigned to you"}</h2>
            <p className="groups-student-hint">
              Choose the students to include in this group.
            </p>
            <GroupStudentPicker
              students={students}
              selectedStudentIds={selectedStudentIds}
              onSelectionChange={(studentIds) => {
                setSelectedStudentIds(studentIds);
                setFormError("");
                setSuccessMessage("");
              }}
              isLoading={areStudentsLoading}
              error={studentsError}
              disabled={isSaving}
            />
          </div>
        </section>
      )}

      <section className="student-list-section groups-list-section">
        <h2>School groups</h2>
        {scheduleMessage && <p className="assignment-success" role="status">{scheduleMessage}</p>}
        {isLoading ? (
          <div className="card" role="status">Loading groups...</div>
        ) : loadError ? (
          <div className="card" role="alert">
            <p>{loadError}</p>
            <button
              className="text-button"
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </div>
        ) : groups.length ? (
          <div className="groups-list">
            {groups.map((group) => (
              <article className="card group-card" key={group.public_id || group.id}>
                {editingGroupId === group.id ? (
                  <form
                    className="group-edit-form"
                    onSubmit={(event) => saveGroup(event, group.id)}
                  >
                    <label>
                      Group name
                      <input
                        required
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                    </label>
                    <label>
                      Purpose
                      <textarea
                        required
                        rows={3}
                        value={editPurpose}
                        onChange={(event) => setEditPurpose(event.target.value)}
                      />
                    </label>
                    <fieldset className="group-edit-students">
                      <legend>Students</legend>
                      <GroupStudentPicker
                        students={students}
                        selectedStudentIds={editStudentIds}
                        onSelectionChange={setEditStudentIds}
                        isLoading={areStudentsLoading}
                        error={studentsError}
                        disabled={isEditing}
                      />
                    </fieldset>
                    {editError && <p className="assignment-error" role="alert">{editError}</p>}
                    <div className="group-edit-actions">
                      <button
                        className="primary-button group-edit-save-button"
                        type="submit"
                        disabled={isEditing || areStudentsLoading || Boolean(studentsError)}
                      >
                        {isEditing ? "Saving..." : "Save changes"}
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={cancelEditingGroup}
                        disabled={isEditing}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="group-card-details">
                    <div>
                      <h3>{group.name}</h3>
                      <p>{group.purpose}</p>
                    </div>
                    {canCreateGroups && (
                      <div className="group-card-actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => startEditingGroup(group)}
                        >
                          Edit
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => {
                            setScheduleMessage("");
                            setSchedulingGroup(group);
                          }}
                          disabled={deletingGroupId !== null}
                        >
                          Schedule
                        </button>
                        <button
                          className="ghost-button group-delete-button"
                          type="button"
                          onClick={() => deleteGroup(group)}
                          disabled={deletingGroupId !== null}
                        >
                          {deletingGroupId === group.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {groupDeleteError?.groupId === group.id && (
                  <p className="assignment-error group-delete-error" role="alert">
                    {groupDeleteError.message}
                  </p>
                )}
                {(group.interventionist_name || group.interventionist) && (
                  <span className="group-owner">
                    {group.interventionist_name || "Assigned"}
                  </span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="card">
            <p>No intervention groups have been created for this school yet.</p>
          </div>
        )}
      </section>
      {schedulingGroup && (
        <GroupScheduleModal
          group={schedulingGroup}
          onClose={() => setSchedulingGroup(null)}
          onScheduled={(message) => {
            setScheduleMessage(message);
            setSchedulingGroup(null);
          }}
        />
      )}
    </>
  );
}

export default GroupsPage;
