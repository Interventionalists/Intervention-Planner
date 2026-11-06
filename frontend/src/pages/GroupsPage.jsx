import { useEffect, useState } from "react";
import { PageHeading } from "../components/PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function toLocalDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toLocalTimeInput(date) {
  return date.toTimeString().slice(0, 5);
}

function getScheduleDefaults() {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setMinutes(endsAt.getMinutes() + 30);
  return {
    date: toLocalDateInput(startsAt),
    startsAt: toLocalTimeInput(startsAt),
    endsAt: toLocalTimeInput(endsAt),
  };
}

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
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
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

  const toggleStudent = (studentId) => {
    setSelectedStudentIds((currentIds) =>
      currentIds.includes(studentId)
        ? currentIds.filter((id) => id !== studentId)
        : [...currentIds, studentId]
    );
    setFormError("");
    setSuccessMessage("");
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

  const openScheduleForm = (group) => {
    const defaults = getScheduleDefaults();
    setSchedulingGroup(group);
    setScheduleTitle(group.name);
    setScheduleDate(defaults.date);
    setScheduleStart(defaults.startsAt);
    setScheduleEnd(defaults.endsAt);
    setScheduleLocation("");
    setScheduleError("");
    setScheduleMessage("");
  };

  const scheduleGroupEvent = async (event) => {
    event.preventDefault();
    if (!schedulingGroup) return;

    const startsAt = new Date(`${scheduleDate}T${scheduleStart}`);
    const endsAt = new Date(`${scheduleDate}T${scheduleEnd}`);
    if (endsAt <= startsAt) {
      setScheduleError("The end time must be after the start time.");
      return;
    }

    setScheduleError("");
    setIsScheduling(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/calendar-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: schedulingGroup.school,
          event_type: "Group session",
          title: scheduleTitle.trim(),
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          location: scheduleLocation.trim() || null,
          session_group_id: schedulingGroup.id,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || "Unable to schedule group event.");
      }
      if (!result?.event) {
        throw new Error("The schedule event response has an unexpected format.");
      }
      setScheduleMessage(
        `${scheduleTitle.trim()} scheduled for ${new Date(startsAt).toLocaleString()}.`
      );
      setSchedulingGroup(null);
    } catch (error) {
      setScheduleError(error.message || "Unable to schedule group event.");
    } finally {
      setIsScheduling(false);
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
            {areStudentsLoading ? (
              <p role="status">Loading students...</p>
            ) : studentsError ? (
              <p className="assignment-error" role="alert">{studentsError}</p>
            ) : students.length ? (
              <div className="groups-student-list">
                {students.map((student) => {
                  const studentName =
                    student.name ||
                    [student.first_name, student.last_name].filter(Boolean).join(" ") ||
                    "Unnamed student";
                  return (
                    <label className="groups-student-option" key={student.id}>
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        disabled={isSaving}
                      />
                      <span>
                        <strong>{studentName}</strong>
                        <small>Grade {student.grade_level ?? student.grade ?? "—"}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p>No students are available to add.</p>
            )}
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
                      {areStudentsLoading ? (
                        <p role="status">Loading students...</p>
                      ) : studentsError ? (
                        <p className="assignment-error" role="alert">{studentsError}</p>
                      ) : students.length ? (
                        <div className="groups-student-list">
                          {students.map((student) => {
                            const studentName =
                              student.name ||
                              [student.first_name, student.last_name]
                                .filter(Boolean)
                                .join(" ") ||
                              "Unnamed student";
                            return (
                              <label className="groups-student-option" key={student.id}>
                                <input
                                  type="checkbox"
                                  checked={editStudentIds.includes(student.id)}
                                  onChange={() =>
                                    setEditStudentIds((currentIds) =>
                                      currentIds.includes(student.id)
                                        ? currentIds.filter((id) => id !== student.id)
                                        : [...currentIds, student.id]
                                    )
                                  }
                                  disabled={isEditing}
                                />
                                <span>
                                  <strong>{studentName}</strong>
                                  <small>Grade {student.grade_level ?? student.grade ?? "—"}</small>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p>No students are available to add.</p>
                      )}
                    </fieldset>
                    {editError && <p className="assignment-error" role="alert">{editError}</p>}
                    <div className="group-edit-actions">
                      <button
                        className="primary-button"
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
                          onClick={() => openScheduleForm(group)}
                        >
                          Schedule
                        </button>
                      </div>
                    )}
                  </div>
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
        <div
          className="calendar-event-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isScheduling) {
              setSchedulingGroup(null);
            }
          }}
        >
          <section
            className="calendar-event-modal group-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-schedule-title"
          >
            <header className="calendar-event-modal-header">
              <div>
                <h2 id="group-schedule-title">Schedule {schedulingGroup.name}</h2>
                <p className="calendar-event-modal-subtitle">
                  Add a group session to the school calendar.
                </p>
              </div>
              <button
                type="button"
                className="calendar-event-modal-close"
                onClick={() => setSchedulingGroup(null)}
                disabled={isScheduling}
                aria-label="Close schedule form"
              >
                ×
              </button>
            </header>
            <form className="group-schedule-form" onSubmit={scheduleGroupEvent}>
              <label>
                Event title
                <input
                  required
                  value={scheduleTitle}
                  onChange={(event) => setScheduleTitle(event.target.value)}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  required
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                />
              </label>
              <div className="group-schedule-time-fields">
                <label>
                  Starts
                  <input
                    type="time"
                    required
                    value={scheduleStart}
                    onChange={(event) => setScheduleStart(event.target.value)}
                  />
                </label>
                <label>
                  Ends
                  <input
                    type="time"
                    required
                    value={scheduleEnd}
                    onChange={(event) => setScheduleEnd(event.target.value)}
                  />
                </label>
              </div>
              <label>
                Location (optional)
                <input
                  value={scheduleLocation}
                  onChange={(event) => setScheduleLocation(event.target.value)}
                  placeholder="e.g. Room 12"
                />
              </label>
              {scheduleError && <p className="assignment-error" role="alert">{scheduleError}</p>}
              <div className="group-edit-actions">
                <button className="primary-button" type="submit" disabled={isScheduling}>
                  {isScheduling ? "Scheduling..." : "Schedule event"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setSchedulingGroup(null)}
                  disabled={isScheduling}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export default GroupsPage;
