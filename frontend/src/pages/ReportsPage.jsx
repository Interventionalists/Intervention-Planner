import { CardTitle, PageHeading, ProgressChart } from "../components/PageElements";

function ReportsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Reports"
        title="Intervention reports"
        subtitle="A placeholder report view ready for your API-backed analytics."
      />
      <div className="reports-grid">
        <div className="card report-hero">
          <span className="eyebrow">Students needing attention</span>
          <strong>2</strong>
          <p>students currently have a subject score below 60%.</p>
        </div>
        <div className="card">
          <CardTitle title="Average scores" />
          <ProgressChart values={[68, 71, 74, 72, 79, 81, 83]} />
        </div>
        <div className="card">
          <CardTitle title="Intervention sessions" />
          <div className="big-number">24</div>
          <p className="muted">This month</p>
        </div>
      </div>
    </>
  );
}

export default ReportsPage;
