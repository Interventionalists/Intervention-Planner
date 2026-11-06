import { useEffect, useState } from "react";
import { PageHeading } from "../components/PageElements";
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
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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
      setGroups((currentGroups) => [result.group, ...currentGroups]);
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
                <div>
                  <h3>{group.name}</h3>
                  <p>{group.purpose}</p>
                </div>
                <span className="group-owner">
                  {group.interventionist_name || (group.interventionist ? "Assigned" : "Unassigned")}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="card">
            <p>No intervention groups have been created for this school yet.</p>
          </div>
        )}
      </section>
    </>
  );
}

export default GroupsPage;
