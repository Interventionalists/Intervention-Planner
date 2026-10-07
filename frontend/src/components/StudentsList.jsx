function StudentsList({ list, selectedStudent, onSelect }) {
  return (
    <div className="students-layout">
      <div className="card student-table-card">
        <div className="table-head">
          <span className="student-name-header">Student</span>
          <span>Grade</span>
          <span>Teacher</span>
          <span>Group</span>
          <span>Lowest Grade</span>
        </div>
        {list.map((student) => {
          const [lowestClass, lowestScore] = Object.entries(student.scores ?? {}).reduce(
            ([currentClass, currentScore], [subject, score]) =>
              score < currentScore ? [subject, score] : [currentClass, currentScore],
            ["", Infinity]
          );

          return (
            <button
              className={`student-row ${selectedStudent.id === student.id ? "selected" : ""}`}
              key={student.id}
              onClick={() => onSelect(student)}
            >
              <span className="student-name-cell">
                <img src={student.avatar} alt="" />
                {student.name}
              </span>
              <span>{student.grade}</span>
              <span>{student.teacher}</span>
              <span>{student.group}</span>
              <span className="lowest-grade-cell">
                {Number.isFinite(lowestScore) ? (
                  <>
                    <strong>{lowestScore.toFixed(2)}%</strong>
                    <small>{lowestClass}</small>
                  </>
                ) : (
                  <small>No grades</small>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default StudentsList;