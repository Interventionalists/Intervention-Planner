import { useMemo, useState } from "react";
import { CardTitle } from "../components/PageElements";

function getAssignedStudents(students, userId, isTeacher) {
  if (!userId) {
    return [];
  }
  const assignmentField = isTeacher ? "teacherId" : "interventionistId";
  return students.filter(
    (student) => String(student[assignmentField] ?? "") === String(userId ?? "")
  );
}

function getLowestGrade(scores) {
  return Object.entries(scores ?? {}).reduce(
    (lowest, [subject, score]) => {
      const numericScore = Number(score);
      return Number.isFinite(numericScore) && numericScore < lowest.score
        ? { subject, score: numericScore }
        : lowest;
    },
    { subject: "", score: Infinity }
  );
}

function ClassStudentsTile({ students, userId, role, onStudentSelect }) {
  const isTeacher = String(role ?? "").toLowerCase() === "teacher";
  const assignedStudents = useMemo(
    () => getAssignedStudents(students, userId, isTeacher),
    [students, userId, isTeacher]
  );
  const classes = useMemo(
    () =>
      [...new Set(assignedStudents.flatMap((student) => Object.keys(student.scores ?? {})))].sort(
        (first, second) => first.localeCompare(second)
      ),
    [assignedStudents]
  );
  const groups = useMemo(
    () =>
      [...new Set(
        assignedStudents.map((student) =>
          student.group === "—" ? "" : String(student.group)
        )
      )]
        .sort((first, second) => {
          if (!first) return 1;
          if (!second) return -1;
          return first.localeCompare(second, undefined, { numeric: true });
        }),
    [assignedStudents]
  );
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const activeClass = classes.includes(selectedClass) ? selectedClass : classes[0] ?? "";
  const activeGroup = groups.includes(selectedGroup) ? selectedGroup : groups[0] ?? "";
  const visibleStudents = isTeacher
    ? assignedStudents
    : assignedStudents.filter((student) =>
        activeGroup === ""
          ? student.group === "—"
          : String(student.group) === activeGroup
      );

  return (
    <section className="card dashboard-students-tile">
      <CardTitle
        title="Students"
        action={
          <label className="dashboard-students-filter">
            <span className="visually-hidden">
              {isTeacher ? "Select class" : "Select intervention group"}
            </span>
            <select
              aria-label={isTeacher ? "Select class" : "Select intervention group"}
              disabled={isTeacher ? classes.length === 0 : groups.length === 0}
              value={isTeacher ? activeClass : activeGroup}
              onChange={(event) =>
                isTeacher
                  ? setSelectedClass(event.target.value)
                  : setSelectedGroup(event.target.value)
              }
            >
              {isTeacher
                ? classes.length
                  ? classes.map((className) => (
                      <option key={className} value={className}>
                        {className}
                      </option>
                    ))
                  : <option value="">No classes</option>
                : groups.length
                  ? groups.map((group) => (
                      <option key={group} value={group}>
                        {group === "" ? "No group" : `Group ${group}`}
                      </option>
                    ))
                  : <option value="">No groups</option>}
            </select>
          </label>
        }
      />
      <p className="dashboard-student-grade-heading">
        {isTeacher
          ? activeClass
            ? `${activeClass} grade`
            : "No class grades available"
          : "Lowest grade"}
      </p>
      {visibleStudents.length ? (
        <div className="dashboard-student-list">
          {visibleStudents.map((student) => {
            const lowestGrade = getLowestGrade(student.scores);
            const grade = isTeacher ? student.scores?.[activeClass] : lowestGrade.score;
            const hasGrade =
              grade !== null &&
              grade !== undefined &&
              grade !== "" &&
              Number.isFinite(Number(grade));

            return (
              <button
                className="dashboard-student-row"
                key={student.id ?? student.name}
                onClick={() => onStudentSelect(student)}
              >
                <span className="dashboard-student-name">{student.name}</span>
                <span className="dashboard-student-grade">
                  {hasGrade ? `${Number(grade).toFixed(2)}%` : "No grades"}
                  {!isTeacher && Number.isFinite(lowestGrade.score) && (
                    <small>{lowestGrade.subject}</small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">
          {assignedStudents.length
            ? "No students are assigned to this group."
            : "No students are assigned to you."}
        </p>
      )}
    </section>
  );
}

export default ClassStudentsTile;
