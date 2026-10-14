export function PageHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

export function CardTitle({ title, action }) {
  return (
    <div className="card-title">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function ProgressChart({ values }) {
  if (!values.length) {
    return <p className="muted">No progress data is available yet.</p>;
  }

  const max = Math.max(...values, 100);

  return (
    <div className="bar-chart" aria-label="Progress chart">
      {values.map((value, index) => (
        <div className="bar-column" key={index}>
          <span className="bar-value">{value}</span>
          <div className="bar-track">
            <div className="bar" style={{ height: `${(value / max) * 100}%` }} />
          </div>
          <small>W{index + 1}</small>
        </div>
      ))}
    </div>
  );
}
