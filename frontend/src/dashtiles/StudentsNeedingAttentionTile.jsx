import { CardTitle } from "../components/PageElements";
import { getStudentsNeedingAttention } from "../components/studentsNeedingAttention";

function StudentsNeedingAttentionTile({ students, onStudentSelect }) {
  const studentsNeedingAttention = getStudentsNeedingAttention(students);

  return (
    <section className="card students-needing-attention">
      <CardTitle title="Students needing attention" />
      {studentsNeedingAttention.length ? (
        <div className="attention-student-list">
          {studentsNeedingAttention.map(({ student, lowScores }) => (
            <button
              className="attention-student"
              key={student.id}
              onClick={() => onStudentSelect(student)}
            >
              <span className="attention-student-name">{student.name}</span>
              <span className="attention-student-scores">
                {lowScores
                  .map(({ subject, score }) => `${subject}: ${score.toFixed(2)}%`)
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No students currently have a subject score below 60%.</p>
      )}
    </section>
  );
}

export default StudentsNeedingAttentionTile;
