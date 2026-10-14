import { CardTitle } from "../components/PageElements";

function ViewGradesTile({ scores }) {
  const entries = Object.entries(scores);

  return (
    <div className="card profile-grades-card">
      <CardTitle title="Grades" />
      <div className="grade-list">
        {entries.map(([subject, score]) => (
          <div key={subject} className={score < 60 ? "grade-alert" : ""}>
            <span>{subject}</span>
            <strong>{score.toFixed(2)}%</strong>
          </div>
        ))}
        {!entries.length && <p className="muted">No grade data is available yet.</p>}
      </div>
    </div>
  );
}

export default ViewGradesTile;
