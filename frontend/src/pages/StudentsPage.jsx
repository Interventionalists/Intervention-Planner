import { useEffect, useState } from "react";
import StudentsList from "../components/StudentsList";
import { PageHeading } from "../components/PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

function formatStudent(record) {
  const name =
    record.name ||
    [record.first_name, record.last_name].filter(Boolean).join(" ") ||
    "Unnamed student";
  const groupNames = Array.isArray(record.group_names)
    ? record.group_names.filter(
        (groupName) => typeof groupName === "string" && groupName.trim()
      )
    : [];

  return {
    ...record,
    name,
    grade: record.grade ?? record.grade_level ?? "—",
    teacher: record.teacher_name ?? record.teacher ?? "—",
    group_names: groupNames,
    group: groupNames.join(", ") || "—",
    interventionTeacher:
      record.intervention_teacher_name ??
      record.interventionist_name ??
      record.interventionist ??
      "—",
    avatar:
      record.avatar ||
      `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
    scores: Object.fromEntries(
      Object.entries(
        record.scores && typeof record.scores === "object" ? record.scores : {}
      )
        .map(([subject, score]) => [subject, Number(score)])
        .filter(([, score]) => Number.isFinite(score))
    ),
    recentScores: Array.isArray(record.recentScores) ? record.recentScores : [],
  };
}

// Builds an error for a failed request. 4xx responses carry a readable reason
// from the backend (e.g. no school assigned), so that one is shown to the user;
// 5xx details are raw server errors and stay in the console only.
async function requestError(response, label) {
  let detail = "";
  try {
    detail = (await response.json()).detail;
  } catch {
    // body was not JSON
  }
  const error = new Error(`${label} request failed (${response.status}).`);
  if (response.status < 500 && typeof detail === "string" && detail) {
    error.userMessage = detail;
  }
  return error;
}

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The request was aborted.", "AbortError"));
      return;
    }

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("The request was aborted.", "AbortError"));
    };
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithRetry(url, options, onRetry) {
  const maxRetries = 3;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await apiFetch(url, options);
      if (response.status < 500 || attempt === maxRetries) {
        return response;
      }
    } catch (error) {
      if (error.name === "AbortError" || attempt === maxRetries) {
        throw error;
      }
    }

    onRetry();
    await waitForRetry(1000 * 2 ** attempt, options.signal);
  }
}

function StudentsPage({ query = "", selectedStudent, onSelect, userId, role }) {
  const isTeacher = role === "teacher";
  const isAdmin = role === "admin";
  const [students, setStudents] = useState([]);
  const [statusStudents, setStatusStudents] = useState([]);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [interventionists, setInterventionists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [assignmentIds, setAssignmentIds] = useState({});
  const [assignmentErrors, setAssignmentErrors] = useState({});
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assigningStudentId, setAssigningStudentId] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState({});
  const [statusErrors, setStatusErrors] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");

  useEffect(() => {
    const controller = new AbortController();

    async function loadStudents() {
      setIsLoading(true);
      setError("");
      setRetryCount(0);

      try {
        if (!userId) {
          throw new Error("The signed-in user's public ID is missing.");
        }

        const assignedStudentsUrl = isAdmin
          ? `${API_BASE_URL}/students-fetch`
          : `${API_BASE_URL}/students-fetch/${encodeURIComponent(userId)}`;
        const [assignedResponse, unassignedResponse, interventionistsResponse] =
          await Promise.all([
            fetchWithRetry(
              assignedStudentsUrl,
              { signal: controller.signal },
              () => setRetryCount((count) => count + 1)
            ),
            fetchWithRetry(
              `${API_BASE_URL}/students-unassigned-fetch/${encodeURIComponent(userId)}`,
              { signal: controller.signal },
              () => setRetryCount((count) => count + 1)
            ),
            fetchWithRetry(
              `${API_BASE_URL}/interventionists-fetch/${encodeURIComponent(userId)}`,
              { signal: controller.signal },
              () => setRetryCount((count) => count + 1)
            ),
            role === "admin"
              ? fetchWithRetry(
                  `${API_BASE_URL}/students-fetch`,
                  { signal: controller.signal },
                  () => setRetryCount((count) => count + 1)
                )
              : Promise.resolve(null),
          ]);
        if (!assignedResponse.ok) {
          throw await requestError(assignedResponse, "Assigned student");
        }
        if (!unassignedResponse.ok) {
          throw await requestError(unassignedResponse, "Unassigned student");
        }
        if (!interventionistsResponse.ok) {
          throw await requestError(interventionistsResponse, "Interventionist");
        }
        if (rosterResponse && !rosterResponse.ok) {
          throw await requestError(rosterResponse, "Student roster");
        }

        const [assignedData, unassignedData, interventionistsData, rosterData] =
          await Promise.all([
            assignedResponse.json(),
            unassignedResponse.json(),
            interventionistsResponse.json(),
            rosterResponse ? rosterResponse.json() : Promise.resolve(null),
          ]);
        if (
          !Array.isArray(assignedData.students) ||
          !Array.isArray(unassignedData.students) ||
          !Array.isArray(interventionistsData.interventionists) ||
          (role === "admin" && !Array.isArray(rosterData?.students))
        ) {
          throw new Error("A student or interventionist response has an unexpected format.");
        }
        setStudents(assignedData.students.map(formatStudent));
        setStatusStudents(
          (role === "admin" ? rosterData.students : assignedData.students).map(
            formatStudent
          )
        );
        setUnassignedStudents(unassignedData.students.map(formatStudent));
        setInterventionists(interventionistsData.interventionists);
        setAssignmentIds({});
        setAssignmentErrors({});
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Error fetching students:", loadError);
          setError(
            loadError.userMessage
              ? `Could not load students: ${loadError.userMessage}`
              : "Could not load students. Please try again."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadStudents();
    return () => controller.abort();
  }, [reloadKey, role, userId]);

  const assignStudent = async (student) => {
    const interventionistId = assignmentIds[student.id];
    if (!interventionistId) {
      setAssignmentErrors((current) => ({
        ...current,
        [student.id]: "Choose an interventionist first.",
      }));
      return;
    }

    setAssigningStudentId(student.id);
    setAssignmentErrors((current) => ({ ...current, [student.id]: "" }));
    setAssignmentMessage("");

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/students-assign/${encodeURIComponent(student.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interventionist_id: interventionistId,
            requester_id: userId,
          }),
        }
      );
      if (!response.ok) {
        throw new Error(`Student assignment failed (${response.status}).`);
      }

      const data = await response.json();
      if (!data.student) {
        throw new Error("The assignment response has an unexpected format.");
      }

      setAssignmentMessage(`${student.name} was assigned successfully.`);
      setReloadKey((key) => key + 1);
    } catch (assignmentError) {
      console.error("Error assigning student:", assignmentError);
      setAssignmentErrors((current) => ({
        ...current,
        [student.id]: "Could not assign this student. Please try again.",
      }));
    } finally {
      setAssigningStudentId(null);
    }
  };

  const updateInterventionStatus = async (student, needsInterventions) => {
    setUpdatingStatus((current) => ({ ...current, [student.id]: true }));
    setStatusErrors((current) => ({ ...current, [student.id]: "" }));

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/students-needs-interventions/${encodeURIComponent(student.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requester_id: userId,
            needs_interventions: needsInterventions,
          }),
        }
      );
      if (!response.ok) {
        throw await requestError(response, "Intervention status");
      }

      const data = await response.json();
      if (data.student?.needs_interventions !== needsInterventions) {
        throw new Error("The intervention status response has an unexpected format.");
      }
      const updatedStudent = formatStudent(data.student);
      setStatusStudents((current) =>
        current.map((item) => (item.id === student.id ? updatedStudent : item))
      );
      setStudents((current) =>
        current.map((item) => (item.id === student.id ? updatedStudent : item))
      );
      setUnassignedStudents((current) =>
        current.map((item) => (item.id === student.id ? updatedStudent : item))
      );
    } catch (statusError) {
      console.error("Error updating intervention status:", statusError);
      setStatusErrors((current) => ({
        ...current,
        [student.id]: statusError.userMessage || "Could not update intervention status.",
      }));
    } finally {
      setUpdatingStatus((current) => ({ ...current, [student.id]: false }));
    }
  };

  const allStudents = [...students, ...unassignedStudents];
  const filterStudents = role === "admin" ? statusStudents : allStudents;
  const grades = [...new Set(filterStudents.map((student) => student.grade))].sort(
    (left, right) =>
      String(left).localeCompare(String(right), undefined, { numeric: true })
  );
  const teachers = [...new Set(filterStudents.map((student) => student.teacher))].sort(
    (left, right) => left.localeCompare(right)
  );
  const normalizedQuery = query.trim().toLowerCase();
  const matchesFilters = (student) =>
    student.name.toLowerCase().includes(normalizedQuery) &&
    (gradeFilter === "all" || String(student.grade) === gradeFilter) &&
    (teacherFilter === "all" || student.teacher === teacherFilter);
  const filteredStudents = students.filter(matchesFilters);
  const filteredUnassignedStudents = unassignedStudents.filter(matchesFilters);
  const filteredStatusStudents = statusStudents.filter(matchesFilters);
  const canManageInterventionStatus = role === "teacher" || role === "admin";
  const interventionistName = (interventionist) =>
    interventionist.name ||
    [interventionist.first_name, interventionist.last_name].filter(Boolean).join(" ") ||
    interventionist.email ||
    "Interventionist";

  const clearFilters = () => {
    setGradeFilter("all");
    setTeacherFilter("all");
  };

  return (
    <>
      <PageHeading
        eyebrow="Students"
        title={role === "admin" ? "Student roster" : "Your students"}
        subtitle={
          role === "admin"
            ? "All students in your school, with intervention status controls."
            : "Students assigned to you and students available to assign."
        }
      />
      {isLoading ? (
        <div className="card" role="status">Loading...</div>
      ) : error ? (
        <div className="card" role="alert">
          <p>{error}</p>
          <button className="text-button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="student-filters">
            <label className="student-filter-field">
              <span>Grade</span>
              <select
                value={gradeFilter}
                onChange={(event) => setGradeFilter(event.target.value)}
              >
                <option value="all">All grades</option>
                {grades.map((grade) => (
                  <option key={grade} value={String(grade)}>{grade}</option>
                ))}
              </select>
            </label>
            <label className="student-filter-field">
              <span>Teacher</span>
              <select
                value={teacherFilter}
                onChange={(event) => setTeacherFilter(event.target.value)}
              >
                <option value="all">All teachers</option>
                {teachers.map((teacher) => (
                  <option key={teacher} value={teacher}>{teacher}</option>
                ))}
              </select>
            </label>
            <span className="student-filter-count" aria-live="polite">
              {role === "admin"
                ? `School roster: ${filteredStatusStudents.length} of ${statusStudents.length}; unassigned needing interventions: ${filteredUnassignedStudents.length} of ${unassignedStudents.length}`
                : `Assigned: ${filteredStudents.length} of ${students.length}; unassigned needing interventions: ${filteredUnassignedStudents.length} of ${unassignedStudents.length}`}
            </span>
            {(gradeFilter !== "all" || teacherFilter !== "all") && (
              <button className="student-filter-clear" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
          {canManageInterventionStatus && (
            <section className="student-list-section intervention-status-section">
              <h2>Students needing interventions</h2>
              <p>Choose which students should be included in interventionists' caseloads.</p>
              {filteredStatusStudents.length ? (
                <div className="intervention-status-list">
                  {filteredStatusStudents.map((student) => (
                    <div className="card intervention-status-row" key={student.id}>
                      <button
                        className="unassigned-student-info"
                        type="button"
                        onClick={() => onSelect(student)}
                        aria-label={`View profile for ${student.name}`}
                      >
                        <img src={student.avatar} alt="" />
                        <div>
                          <strong>{student.name}</strong>
                          <small>Grade {student.grade}</small>
                          <small>Teacher: {student.teacher}</small>
                        </div>
                      </button>
                      <label className="intervention-status-toggle">
                        <input
                          type="checkbox"
                          checked={student.needs_interventions === true}
                          disabled={updatingStatus[student.id]}
                          onChange={(event) =>
                            updateInterventionStatus(student, event.target.checked)
                          }
                        />
                        <span>
                          {updatingStatus[student.id]
                            ? "Saving..."
                            : "Needs interventions"}
                        </span>
                      </label>
                      {statusErrors[student.id] && (
                        <p className="assignment-error" role="alert">
                          {statusErrors[student.id]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card">
                  <p>
                    {statusStudents.length
                      ? "No students match your search and filters."
                      : role === "admin"
                        ? "No students are in your school's roster."
                        : "No students are assigned to you."}
                  </p>
                </div>
              )}
            </section>
          )}
          {assignmentMessage && <p className="assignment-success" role="status">{assignmentMessage}</p>}
          <section className="student-list-section">
            <h2>
              {isAdmin
                ? "Assigned to interventionists"
                : isTeacher
                  ? "Your class"
                  : "Assigned to you"}
            </h2>
            {filteredStudents.length ? (
              <StudentsList
                list={filteredStudents}
                selectedStudent={selectedStudent}
                onSelect={onSelect}
              />
            ) : (
              <div className="card">
                <p>
                  {students.length
                    ? "No students match your search and filters."
                    : isTeacher
                      ? "No students are in your class."
                      : isAdmin
                        ? "No students are assigned to an interventionist."
                        : "No students are assigned to you."}
                </p>
              </div>
            )}
          </section>

          <section className="student-list-section">
            <h2>Unassigned students</h2>
            {filteredUnassignedStudents.length ? (
              <div className="unassigned-student-list">
                {filteredUnassignedStudents.map((student) => (
                  <div className="card unassigned-student-row" key={student.id}>
                    <button
                      className="unassigned-student-info"
                      onClick={() => onSelect(student)}
                      aria-label={`View profile for ${student.name}`}
                    >
                      <img src={student.avatar} alt="" />
                      <div>
                        <strong>{student.name}</strong>
                        <small>Grade {student.grade}</small>
                        <small>Groups: {student.group}</small>
                      </div>
                    </button>
                    <div className="student-assignment-controls">
                      <label htmlFor={`assign-${student.id}`}>Assign to</label>
                      <select
                        id={`assign-${student.id}`}
                        value={assignmentIds[student.id] || ""}
                        disabled={!interventionists.length}
                        onChange={(event) =>
                          setAssignmentIds((current) => ({
                            ...current,
                            [student.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          {interventionists.length
                            ? "Choose an interventionist"
                            : "No interventionists available"}
                        </option>
                        {interventionists.map((interventionist) => (
                          <option
                            key={interventionist.public_id}
                            value={interventionist.public_id}
                          >
                            {interventionistName(interventionist)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-button"
                        disabled={
                          assigningStudentId === student.id ||
                          !interventionists.length
                        }
                        onClick={() => assignStudent(student)}
                      >
                        {assigningStudentId === student.id ? "Assigning..." : "Assign"}
                      </button>
                    </div>
                    {assignmentErrors[student.id] && (
                      <p className="assignment-error" role="alert">
                        {assignmentErrors[student.id]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="card">
                <p>{unassignedStudents.length ? "No unassigned students match your search and filters." : "There are no unassigned students needing interventions."}</p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default StudentsPage;
