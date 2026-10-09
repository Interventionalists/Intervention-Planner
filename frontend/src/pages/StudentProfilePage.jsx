import { ArrowLeft, BarChart3, ClipboardList } from "lucide-react";
import { events } from "../data";
import { CardTitle, PageHeading, ProgressChart } from "../components/PageElements";

function StudentProfilePage({ student, onBack }) {
  const scores = Object.entries(student.scores);

  return (
    <>
      <div className="profile-page-heading">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} />
          Back to students
        </button>
        <PageHeading
          eyebrow="Student profile"
          title={student.name}
          subtitle="Student details, grades, and intervention progress."
        />
      </div>

      <section className="student-profile-layout">
        <div className="card profile-identity-card">
          <div className="profile-identity">
            <img src={student.avatar} alt="" />
            <div>
              <h2>{student.name}</h2>
              <p>Grade {student.grade}</p>
            </div>
          </div>
          <dl className="profile-details">
            <div><dt>Teacher</dt><dd>{student.teacher}</dd></div>
            <div><dt>Group</dt><dd>{student.group}</dd></div>
            <div><dt>Intervention teacher</dt><dd>{student.interventionTeacher}</dd></div>
          </dl>
          <div className="profile-notes">
            <h3>Notes</h3>
            <p>{student.notes || "No notes yet."}</p>
          </div>
        </div>

        <div className="card profile-scores-card">
          <CardTitle title="Scores" />
          <div className="score-list">
            {scores.slice(0, 6).map(([subject, score]) => (
              <div className="score-row" key={subject}>
                <span>{subject}</span>
                <div className="score-bar">
                  <span style={{ width: `${score}%` }} />
                </div>
                <strong>{score.toFixed(2)}%</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card profile-grades-card">
          <CardTitle title="Grades" />
          <div className="grade-list">
            {scores.map(([subject, score]) => (
              <div key={subject} className={score < 60 ? "grade-alert" : ""}>
                <span>{subject}</span>
                <strong>{score.toFixed(2)}%</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart-card profile-progress-card">
          <CardTitle
            title="Progress"
            action={
              <div className="chart-actions">
                <button aria-label="Bar chart"><BarChart3 size={19} /></button>
                <button aria-label="Line chart"><ClipboardList size={18} /></button>
              </div>
            }
          />
          <ProgressChart values={student.recentScores} />
        </div>

        <div className="card profile-upcoming-card">
          <CardTitle title="Upcoming" />
          <div className="event-list">
            {events.map((event) => (
              <div className="event" key={event.id}>
                <span className="event-dot" style={{ background: event.color }} />
                <div>
                  <strong>{event.title}</strong>
                  <small>{event.time}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default StudentProfilePage;
