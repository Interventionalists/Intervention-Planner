import { CardTitle } from "../components/PageElements";

function ViewGradesTile({ scores, isLoading, error }) {
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
        {isLoading && (
          <p className="muted" role="status">Calculating grades from assignments...</p>
        )}
        {!isLoading && error && (
          <p className="grade-chart-error" role="alert">{error}</p>
        )}
        {!isLoading && !error && !entries.length && (
          <p className="muted">No graded assignments are available yet.</p>
        )}
      </div>
    </div>
  );
}

export default ViewGradesTile;
