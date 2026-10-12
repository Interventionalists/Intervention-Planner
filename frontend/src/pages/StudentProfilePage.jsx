import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, ClipboardList } from "lucide-react";
import { events } from "../data";
import { CardTitle, PageHeading, ProgressChart } from "../components/PageElements";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
import StudentNotes from "../components/StudentNotes";

function StudentProfilePage({ student, onBack, userId }) {
  const [notes, setNotes] = useState([]);
  const [notesError, setNotesError] = useState("");
  const [notesLoading, setNotesLoading] = useState(true);
  const scores = Object.entries(student.scores ?? {}).filter(([, score]) =>
    Number.isFinite(Number(score))
  );
  const studentName =
    student.name ||
    [student.first_name, student.last_name].filter(Boolean).join(" ") ||
    "Unnamed student";
  const grade = student.grade ?? student.grade_level;
  const teacher = student.teacher_name ?? student.teacher;
  const interventionTeacher =
    student.intervention_teacher_name ??
    student.interventionist_name ??
    student.interventionist;

  useEffect(() => {
    const controller = new AbortController();

    async function loadNotes() {
      setNotes([]);
      setNotesError("");
      setNotesLoading(true);

      try {
        if (student.id == null) {
          throw new Error("This student does not have a database ID.");
        }
        const response = await fetch(
          `${API_BASE_URL}/notes-fetchForStudent/${encodeURIComponent(student.id)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Notes request failed (${response.status}).`);
        }

        const data = await response.json();
        if (!Array.isArray(data.notes)) {
          throw new Error("The notes response has an unexpected format.");
        }
        setNotes(data.notes);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error fetching student notes:", error);
          setNotesError("Could not load this student's notes.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setNotesLoading(false);
        }
      }
    }

    loadNotes();
    return () => controller.abort();
  }, [student.id]);

  return (
    <>
      <div className="profile-page-heading">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} />
          Back to students
        </button>
        <PageHeading
          eyebrow="Student profile"
          title={studentName}
          subtitle="Student details, grades, and intervention progress."
        />
      </div>

      <section className="student-profile-layout">
        <div className="card profile-identity-card">
          <div className="profile-identity">
            <img
              src={
                student.avatar ||
                `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(studentName)}`
              }
              alt=""
            />
            <div>
              <h2>{studentName}</h2>
              <p>{grade == null ? "Grade not provided" : `Grade ${grade}`}</p>
            </div>
          </div>
          <dl className="profile-details">
            <div><dt>Teacher</dt><dd>{teacher ?? "—"}</dd></div>
            <div><dt>Group</dt><dd>{student.group ?? student.intervention_group ?? "—"}</dd></div>
            <div><dt>Intervention teacher</dt><dd>{interventionTeacher ?? "—"}</dd></div>
          </dl>
          <StudentNotes studentId={student.id} userId={userId} />
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
                <strong>{Number(score).toFixed(2)}%</strong>
              </div>
            ))}
            {scores.length === 0 && <p>No scores available.</p>}
          </div>
        </div>

        <div className="card profile-grades-card">
          <CardTitle title="Grades" />
          <div className="grade-list">
            {scores.map(([subject, score]) => (
              <div key={subject} className={score < 60 ? "grade-alert" : ""}>
                <span>{subject}</span>
                <strong>{Number(score).toFixed(2)}%</strong>
              </div>
            ))}
            {scores.length === 0 && <p>No grades available.</p>}
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
          {student.recentScores?.length ? (
            <ProgressChart values={student.recentScores} />
          ) : (
            <p>No progress data available.</p>
          )}
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
