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
        const initials = studentName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase();
        const profileImage = student.profile_api_link || student.avatar;
        const subjectScores = Object.entries(student.scores ?? {}).filter(
          ([, score]) =>
            score !== null &&
            score !== undefined &&
            score !== "" &&
            Number.isFinite(Number(score))
        );

        return (
          <label className="groups-student-option" key={student.id}>
            <input
              className="groups-student-checkbox"
              type="checkbox"
              checked={selectedStudentIds.includes(student.id)}
              onChange={() => toggleStudent(student.id)}
              disabled={disabled}
            />
            <span className="groups-student-avatar" aria-hidden="true">
              <span>{initials}</span>
              {profileImage && (
                <img
                  src={profileImage}
                  alt=""
                  onError={(event) => event.currentTarget.remove()}
                />
              )}
            </span>
            <span className="groups-student-option-details">
              <span className="groups-student-option-heading">
                <strong>{studentName}</strong>
                <small>Grade {student.grade_level ?? student.grade ?? "—"}</small>
              </span>
              {subjectScores.length ? (
                <span
                  className="groups-student-scores"
                  aria-label={`${studentName} subject grade percentages`}
                >
                  {subjectScores.map(([subject, score]) => {
                    const percentage = Number(score);
                    return (
                      <span
                        className={`groups-student-score ${
                          percentage < 60 ? "groups-student-score-failing" : ""
                        }`}
                        key={subject}
                      >
                        <small>{subject}</small>
                        <strong>{percentage.toFixed(2)}%</strong>
                      </span>
                    );
                  })}
                </span>
              ) : (
                <small className="groups-student-no-scores">
                  No subject percentages available
                </small>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default GroupStudentPicker;
