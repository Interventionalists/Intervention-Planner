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

  return {
    ...record,
    name,
    grade: record.grade ?? record.grade_level ?? "—",
    teacher: record.teacher_name ?? record.teacher ?? "—",
    group:
      record.group_number ??
      record.group ??
      record.intervention_group ??
      "—",
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

function StudentsPage({ query = "", selectedStudent, onSelect, user }) {
  const [students, setStudents] = useState([]);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [interventionists, setInterventionists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignmentIds, setAssignmentIds] = useState({});
  const [assignmentErrors, setAssignmentErrors] = useState({});
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assigningStudentId, setAssigningStudentId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");

  useEffect(() => {
    const controller = new AbortController();

    async function loadStudents() {
      setIsLoading(true);
      setError("");

      try {
        if (!user?.public_id) {
          throw new Error("The signed-in user's public ID is missing.");
        }

        const [assignedResponse, unassignedResponse, interventionistsResponse] =
          await Promise.all([
            apiFetch(
              `${API_BASE_URL}/students-fetch/${encodeURIComponent(user.public_id)}`,
              { signal: controller.signal }
            ),
            apiFetch(
              `${API_BASE_URL}/students-unassigned-fetch/${encodeURIComponent(user.public_id)}`,
              { signal: controller.signal }
            ),
            apiFetch(
              `${API_BASE_URL}/interventionists-fetch/${encodeURIComponent(user.public_id)}`,
              { signal: controller.signal }
            ),
          ]);
        if (!assignedResponse.ok) {
          throw new Error(`Assigned student request failed (${assignedResponse.status}).`);
        }
        if (!unassignedResponse.ok) {
          throw new Error(`Unassigned student request failed (${unassignedResponse.status}).`);
        }
        if (!interventionistsResponse.ok) {
          throw new Error(`Interventionist request failed (${interventionistsResponse.status}).`);
        }

        const [assignedData, unassignedData, interventionistsData] =
          await Promise.all([
            assignedResponse.json(),
            unassignedResponse.json(),
            interventionistsResponse.json(),
          ]);
        if (
          !Array.isArray(assignedData.students) ||
          !Array.isArray(unassignedData.students) ||
          !Array.isArray(interventionistsData.interventionists)
        ) {
          throw new Error("A student or interventionist response has an unexpected format.");
        }
        setStudents(assignedData.students.map(formatStudent));
        setUnassignedStudents(unassignedData.students.map(formatStudent));
        setInterventionists(interventionistsData.interventionists);
        setAssignmentIds({});
        setAssignmentErrors({});
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Error fetching students:", loadError);
          setError("Could not load students. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadStudents();
    return () => controller.abort();
  }, [reloadKey, user?.public_id]);

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
            requester_id: user.public_id,
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

  const allStudents = [...students, ...unassignedStudents];
  const grades = [...new Set(allStudents.map((student) => student.grade))].sort(
    (left, right) =>
      String(left).localeCompare(String(right), undefined, { numeric: true })
  );
  const teachers = [...new Set(allStudents.map((student) => student.teacher))].sort(
    (left, right) => left.localeCompare(right)
  );
  const normalizedQuery = query.trim().toLowerCase();
  const matchesFilters = (student) =>
    student.name.toLowerCase().includes(normalizedQuery) &&
    (gradeFilter === "all" || String(student.grade) === gradeFilter) &&
    (teacherFilter === "all" || student.teacher === teacherFilter);
  const filteredStudents = students.filter(matchesFilters);
  const filteredUnassignedStudents = unassignedStudents.filter(matchesFilters);
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
        title="Your students"
        subtitle="Students assigned to you and students available to assign."
      />
      {isLoading ? (
        <div className="card" role="status">Loading students...</div>
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
              Assigned: {filteredStudents.length} of {students.length}; unassigned: {filteredUnassignedStudents.length} of {unassignedStudents.length}
            </span>
            {(gradeFilter !== "all" || teacherFilter !== "all") && (
              <button className="student-filter-clear" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
          {assignmentMessage && <p className="assignment-success" role="status">{assignmentMessage}</p>}
          <section className="student-list-section">
            <h2>Assigned to you</h2>
            {filteredStudents.length ? (
              <StudentsList
                list={filteredStudents}
                selectedStudent={selectedStudent}
                onSelect={onSelect}
              />
            ) : (
              <div className="card">
                <p>{students.length ? "No students match your search and filters." : "No students are assigned to you."}</p>
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
                        <small>Group {student.group}</small>
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
                <p>{unassignedStudents.length ? "No unassigned students match your search and filters." : "There are no unassigned students."}</p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default StudentsPage;
