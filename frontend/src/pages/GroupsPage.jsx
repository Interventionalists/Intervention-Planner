import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { PageHeading } from "../components/PageElements";
import GroupStudentPicker from "../components/GroupStudentPicker";
import { apiFetch } from "../api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function formatGroupSessionTime(startsAtValue, endsAtValue) {
  const startsAt = new Date(startsAtValue);
  if (Number.isNaN(startsAt.getTime())) {
    return "Time unavailable";
  }

  const date = startsAt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const startTime = startsAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const endsAt = new Date(endsAtValue);
  const endTime = Number.isNaN(endsAt.getTime())
    ? ""
    : endsAt.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });

  return `${date} · ${startTime}${endTime ? `–${endTime}` : ""}`;
}

function GroupsPage({ user, onStudentSelect, onScheduleGroup }) {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [areStudentsLoading, setAreStudentsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [studentsError, setStudentsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editStudentIds, setEditStudentIds] = useState([]);
  const [editError, setEditError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deletingGroupId, setDeletingGroupId] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [groupDeleteError, setGroupDeleteError] = useState(null);
  const canCreateGroups = ["admin", "interventionist"].includes(user?.role);
  const isInterventionist = user?.role === "interventionist";
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const ownGroups = isInterventionist
    ? user?.public_id
      ? groups.filter(
          (group) =>
            String(group.interventionist ?? "") === String(user.public_id)
        )
      : []
    : groups;
  const otherGroups = isInterventionist
    ? user?.public_id
      ? groups.filter(
          (group) =>
            String(group.interventionist ?? "") !== String(user.public_id)
        )
      : groups
    : [];
  const canManageSelectedGroup =
    user?.role === "admin" ||
    (isInterventionist &&
      Boolean(user?.public_id) &&
    String(selectedGroup?.interventionist ?? "") === String(user.public_id));

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
      setIsCreateOpen(false);
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

  const closeCreateModal = () => {
    if (isSaving) return;
    setIsCreateOpen(false);
    setName("");
    setPurpose("");
    setSelectedStudentIds([]);
    setFormError("");
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

  const deleteGroup = (group) => {
    setGroupDeleteError(null);
    setGroupToDelete(group);
  };

  const cancelGroupDeletion = () => {
    if (deletingGroupId !== null) return;
    setGroupToDelete(null);
    setGroupDeleteError(null);
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    const group = groupToDelete;
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
      setSelectedGroupId(null);
      setGroupToDelete(null);
    } catch (error) {
      setGroupDeleteError({
        groupId: group.id,
        message: error.message || "Unable to delete group.",
      });
    } finally {
      setDeletingGroupId(null);
    }
  };

  const renderGroupSection = (title, sectionGroups, emptyMessage) => (
    <section className="groups-subsection">
      <div className="groups-section-heading">
        <h2>{title}</h2>
        <span>{sectionGroups.length} {sectionGroups.length === 1 ? "group" : "groups"}</span>
      </div>
      {sectionGroups.length ? (
        <div className="groups-list">
          {sectionGroups.map((group) => (
            <article className="card group-card" key={group.public_id || group.id}>
              <button
                type="button"
                className="group-card-open"
                aria-label={`View ${group.name} group`}
                onClick={() => {
                  cancelEditingGroup();
                  setGroupDeleteError(null);
                  setSelectedGroupId(group.id);
                }}
              >
                <span className="group-card-topline">
                  <span className="group-card-member-count">
                    {(group.student_ids || []).length} {(group.student_ids || []).length === 1 ? "student" : "students"}
                  </span>
                  <span className="group-card-arrow" aria-hidden="true">View group ›</span>
                </span>
                <span className="group-card-name">{group.name}</span>
                <span className="group-card-purpose">{group.purpose}</span>
                {(group.interventionist_name || group.interventionist) && (
                  <span className="group-card-owner">
                    {group.interventionist_name || "Assigned interventionist"}
                  </span>
                )}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="card">
          <p>{emptyMessage}</p>
        </div>
      )}
    </section>
  );

  return (
    <>
      <div className="groups-page-header">
        <PageHeading
          eyebrow="Groups"
          title="Intervention groups"
          subtitle="Browse group members and schedule sessions from one place."
        />
        {canCreateGroups && (
          <button
            className="groups-add-button"
            type="button"
            onClick={() => {
              setFormError("");
              setSuccessMessage("");
              setIsCreateOpen(true);
            }}
          >
            Create group
          </button>
        )}
      </div>

      <section className="student-list-section groups-list-section">
        {successMessage && <p className="assignment-success" role="status">{successMessage}</p>}
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
        ) : isInterventionist ? (
          <div className="groups-section-stack">
            {renderGroupSection(
              "My intervention groups",
              ownGroups,
              "You don’t have any intervention groups assigned to you yet."
            )}
            {renderGroupSection(
              "Other intervention groups",
              otherGroups,
              "No other intervention groups are available."
            )}
          </div>
        ) : (
          renderGroupSection(
            "School groups",
            groups,
            "No intervention groups have been created for this school yet."
          )
        )}
      </section>
      {isCreateOpen && (
        <div
          className="calendar-event-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreateModal();
          }}
        >
          <section
            className="calendar-event-modal group-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-create-title"
          >
            <header className="calendar-event-modal-header">
              <div>
                <p className="calendar-event-modal-eyebrow">Groups</p>
                <h2 id="group-create-title">Create a group</h2>
                <p className="calendar-event-modal-subtitle">
                  Add a group name, intervention focus, and students.
                </p>
              </div>
              <button
                type="button"
                className="calendar-event-modal-close"
                onClick={closeCreateModal}
                disabled={isSaving}
                aria-label="Close create group form"
              >
                <X size={18} />
              </button>
            </header>
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
              <div className="groups-create-students">
                <div>
                  <h3>{user?.role === "admin" ? "School students" : "Assigned to you"}</h3>
                  <p className="groups-student-hint">Choose students to include in this group.</p>
                </div>
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
              <p className="groups-selected-count" aria-live="polite">
                {selectedStudentIds.length
                  ? `${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? "" : "s"} selected`
                  : "No students selected yet."}
              </p>
              {formError && <p className="assignment-error" role="alert">{formError}</p>}
              <div className="group-edit-actions">
                <button className="groups-modal-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Creating..." : "Create group"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeCreateModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {selectedGroup && !groupToDelete && (
        <div
          className="calendar-event-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isEditing) {
              setSelectedGroupId(null);
              cancelEditingGroup();
            }
          }}
        >
          <section
            className="calendar-event-modal group-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-detail-title"
          >
            <header className="calendar-event-modal-header">
              <div>
                <p className="calendar-event-modal-eyebrow">Intervention group</p>
                <h2 id="group-detail-title">{editingGroupId === selectedGroup.id ? "Edit group" : selectedGroup.name}</h2>
                {!editingGroupId && (
                  <p className="calendar-event-modal-subtitle">
                    {(selectedGroup.student_ids || []).length} {(selectedGroup.student_ids || []).length === 1 ? "student" : "students"}
                    {(selectedGroup.interventionist_name || selectedGroup.interventionist)
                      ? ` · ${selectedGroup.interventionist_name || "Assigned interventionist"}`
                      : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="calendar-event-modal-close"
                onClick={() => {
                  setSelectedGroupId(null);
                  cancelEditingGroup();
                }}
                disabled={isEditing}
                aria-label="Close group details"
              >
                <X size={18} />
              </button>
            </header>
            {editingGroupId === selectedGroup.id ? (
              <form
                className="group-edit-form"
                onSubmit={(event) => saveGroup(event, selectedGroup.id)}
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
                    className="groups-modal-primary"
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
              <>
                <p className="group-detail-purpose">{selectedGroup.purpose}</p>
                {isInterventionist && !canManageSelectedGroup && (
                  <p className="group-read-only-notice">
                    You can view this group, but only its assigned interventionist or an admin can edit or delete it.
                  </p>
                )}
                <section className="group-members-section">
                  <div className="groups-section-heading">
                    <h3>Students in this group</h3>
                    <span>{(selectedGroup.student_ids || []).length}</span>
                  </div>
                  {(selectedGroup.student_ids || []).length ? (
                    <ul className="group-members-list">
                      {selectedGroup.student_ids.map((studentId) => {
                        const profile = selectedGroup.students?.find(
                          (candidate) => String(candidate.id) === String(studentId)
                        );
                        const rosterStudent = students.find(
                          (candidate) => String(candidate.id) === String(studentId)
                        );
                        const student = rosterStudent || profile;
                        const studentName =
                          [student?.first_name, student?.last_name].filter(Boolean).join(" ") ||
                          student?.name ||
                          "Student profile unavailable";
                        const grade = student?.grade_level ?? student?.grade ?? "—";
                        const memberContent = (
                          <>
                            <span className="group-member-avatar" aria-hidden="true">
                              {studentName === "Student profile unavailable"
                                ? "?"
                                : studentName.charAt(0).toUpperCase()}
                              {student?.profile_api_link && (
                                <img
                                  src={student.profile_api_link}
                                  alt=""
                                  onError={(event) => event.currentTarget.remove()}
                                />
                              )}
                            </span>
                            <span className="group-member-info">
                              <strong>{studentName}</strong>
                              {student && <small>Grade {grade}</small>}
                            </span>
                          </>
                        );

                        return (
                          <li key={studentId}>
                            {rosterStudent && onStudentSelect ? (
                              <button
                                type="button"
                                className="group-member-open"
                                onClick={() =>
                                  onStudentSelect({
                                    ...rosterStudent,
                                    name: studentName,
                                    grade,
                                    teacher:
                                      rosterStudent.teacher_name || rosterStudent.teacher || "—",
                                    interventionTeacher:
                                      rosterStudent.interventionist_name ||
                                      rosterStudent.interventionist ||
                                      "—",
                                    group_names: rosterStudent.group_names || [],
                                    group: rosterStudent.group_names?.join(", ") || "—",
                                    avatar:
                                      rosterStudent.profile_api_link ||
                                      rosterStudent.avatar ||
                                      null,
                                  })
                                }
                                aria-label={`Open ${studentName}'s profile`}
                              >
                                {memberContent}
                                <span className="group-member-profile-link">View profile</span>
                              </button>
                            ) : (
                              <div className="group-member-static">{memberContent}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="group-members-empty">No students have been added to this group.</p>
                  )}
                </section>
                <section className="group-schedule-section">
                  <div className="groups-section-heading">
                    <h3>Upcoming sessions</h3>
                    <span>Next 90 days</span>
                  </div>
                  {selectedGroup.sessions?.length ? (
                    <ul className="group-sessions-list">
                      {selectedGroup.sessions.map((session) => (
                        <li
                          key={`${session.public_id}-${session.starts_at}`}
                        >
                          <strong>{session.title || "Group session"}</strong>
                          <time dateTime={session.starts_at}>
                            {formatGroupSessionTime(
                              session.starts_at,
                              session.ends_at
                            )}
                          </time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="group-sessions-empty">
                      No sessions scheduled in the next 90 days.
                    </p>
                  )}
                </section>
                {groupDeleteError?.groupId === selectedGroup.id && (
                  <p className="assignment-error" role="alert">{groupDeleteError.message}</p>
                )}
                <div className="group-detail-actions">
                  {canCreateGroups && (
                    <>
                      {canManageSelectedGroup && (
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => startEditingGroup(selectedGroup)}
                          disabled={deletingGroupId !== null}
                        >
                          Edit group
                        </button>
                      )}
                      {canManageSelectedGroup && (
                        <button
                          className="groups-modal-primary"
                          type="button"
                          onClick={() => onScheduleGroup(selectedGroup)}
                          disabled={deletingGroupId !== null}
                        >
                          Schedule session
                        </button>
                      )}
                      {canManageSelectedGroup && (
                        <button
                          className="ghost-button groups-danger-button"
                          type="button"
                          onClick={() => deleteGroup(selectedGroup)}
                          disabled={deletingGroupId !== null}
                        >
                          {deletingGroupId === selectedGroup.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => setSelectedGroupId(null)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {groupToDelete && (
        <div
          className="calendar-event-modal-backdrop group-delete-confirm-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelGroupDeletion();
          }}
        >
          <section
            className="calendar-event-modal group-delete-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="group-delete-confirm-title"
            aria-describedby="group-delete-confirm-description"
          >
            <header className="group-delete-confirm-header">
              <span className="group-delete-confirm-icon" aria-hidden="true">
                <AlertTriangle size={21} />
              </span>
              <div>
                <p className="calendar-event-modal-eyebrow">Delete group</p>
                <h2 id="group-delete-confirm-title">
                  Delete “{groupToDelete.name}”?
                </h2>
              </div>
              <button
                type="button"
                className="calendar-event-modal-close"
                onClick={cancelGroupDeletion}
                disabled={deletingGroupId !== null}
                aria-label="Close delete confirmation"
              >
                <X size={18} />
              </button>
            </header>
            <p id="group-delete-confirm-description" className="group-delete-confirm-description">
              This action is permanent. The group’s calendar sessions will be deleted along with the group.
            </p>
            <div className="group-delete-confirm-summary">
              <strong>This will remove</strong>
              <ul>
                <li>The group and its student memberships</li>
                <li>All linked calendar sessions, including past, future, and recurring sessions</li>
                <li>Session invitations and participants</li>
              </ul>
            </div>
            {groupDeleteError?.groupId === groupToDelete.id && (
              <p className="assignment-error" role="alert">{groupDeleteError.message}</p>
            )}
            <footer className="group-delete-confirm-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={cancelGroupDeletion}
                disabled={deletingGroupId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="groups-delete-confirm-button"
                onClick={confirmDeleteGroup}
                disabled={deletingGroupId !== null}
              >
                {deletingGroupId === groupToDelete.id ? "Deleting…" : "Delete group"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

export default GroupsPage;
