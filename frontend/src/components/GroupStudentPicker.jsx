// Reuse the same student choices for group creation and editing.
function GroupStudentPicker({
  students,
  selectedStudentIds,
  onSelectionChange,
  isLoading,
  error,
  disabled = false,
}) {
  if (isLoading) {
    return <p role="status">Loading students...</p>;
  }

  if (error) {
    return <p className="assignment-error" role="alert">{error}</p>;
  }

  if (!students.length) {
    return <p>No students are available to add.</p>;
  }

  const toggleStudent = (studentId) => {
    const nextIds = selectedStudentIds.includes(studentId)
      ? selectedStudentIds.filter((id) => id !== studentId)
      : [...selectedStudentIds, studentId];
    onSelectionChange(nextIds);
  };

  return (
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
              disabled={disabled}
            />
            <span>
              <strong>{studentName}</strong>
              <small>Grade {student.grade_level ?? student.grade ?? "—"}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default GroupStudentPicker;
