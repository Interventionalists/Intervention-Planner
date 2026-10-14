function SelectedStudentTile({
  student,
  students,
  onStudentChange,
  onStudents,
}) {
  return (
    <div className="card student-card">
      <div className="student-avatar-wrap">
        <img src={student.avatar} alt="" />
      </div>
      <h2>{student.name}</h2>
      <p>Grade: {student.grade}</p>
      <p>Teacher: {student.teacher}</p>
      {student.group !== "—" && <p>Group: {student.group}</p>}
      <p>Int. Teacher: {student.interventionTeacher}</p>
      <select
        value={student.id ?? ""}
        onChange={(event) =>
          onStudentChange(
            students.find(
              (candidate) => String(candidate.id) === event.target.value
            )
          )
        }
        aria-label="Select student"
      >
        {students.map((candidate) => (
          <option key={candidate.id ?? candidate.name} value={candidate.id ?? ""}>
            {candidate.name}
          </option>
        ))}
      </select>
      <button className="text-button" onClick={onStudents}>
        View all students →
      </button>
    </div>
  );
}

export default SelectedStudentTile;
