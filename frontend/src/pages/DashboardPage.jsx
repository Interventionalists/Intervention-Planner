import { BarChart3, ClipboardList, SlidersHorizontal } from "lucide-react";
import { currentUser, events } from "../data";
import { CardTitle, PageHeading, ProgressChart } from "../components/PageElements";

function DashboardPage({ student, students, onStudentChange, onStudents }) {
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title={`Good morning, ${currentUser.name}!`}
        subtitle="Here’s what’s happening with your intervention students."
      />

      <section className="dashboard-grid">
        <div className="card student-card">
          <div className="student-avatar-wrap">
            <img src={student.avatar} alt="" />
          </div>
          <h2>{student.name}</h2>
          <p>Grade: {student.grade}</p>
          <p>Teacher: {student.teacher}</p>
          <p>Group: {student.group}</p>
          <p>Int. Teacher: {student.interventionTeacher}</p>
          <div className="student-notes">
            <span>Notes</span>
            <p>{student.notes || "No notes yet."}</p>
          </div>
          <select
            value={student.id ?? ""}
            onChange={(event) =>
              onStudentChange(
                students.find((candidate) => String(candidate.id) === event.target.value)
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

        <div className="card">
          <CardTitle title="Scores" action={<SlidersHorizontal size={18} />} />
          <div className="score-list">
            {Object.entries(student.scores).slice(0, 6).map(([subject, score]) => (
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

        <div className="card">
          <CardTitle title="Grades" />
          <div className="grade-list">
            {Object.entries(student.scores).map(([subject, score]) => (
              <div key={subject} className={score < 60 ? "grade-alert" : ""}>
                <span>{subject}</span>
                <strong>{score.toFixed(2)}%</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart-card">
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

        <div className="card">
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

export default DashboardPage;
