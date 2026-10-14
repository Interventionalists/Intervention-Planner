import { CardTitle, PageHeading, ProgressChart } from "../components/PageElements";
import { getStudentsNeedingAttention } from "../components/studentsNeedingAttention";

function ReportsPage({ students }) {
  const studentsNeedingAttention = getStudentsNeedingAttention(students);

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
          <strong>{studentsNeedingAttention.length}</strong>
          <p>
            {studentsNeedingAttention.length === 1 ? "student" : "students"} currently
            {` ${studentsNeedingAttention.length === 1 ? "has" : "have"} `}
            a subject score below 60%.
          </p>
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
