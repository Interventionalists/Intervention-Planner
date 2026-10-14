import { ArrowLeft, BarChart3, ClipboardList } from "lucide-react";
import { events } from "../data";
import { canShowModule } from "../components/ModuleTile";
import { CardTitle, PageHeading } from "../components/PageElements";
import AddGradesTile from "../studtiles/AddGradesTile";
import ChangeParentNameTile from "../studtiles/ChangeParentNameTile";
import ChangeStudentGradeTile from "../studtiles/ChangeStudentGradeTile";
import ChangeStudentNameTile from "../studtiles/ChangeStudentNameTile";
import EditSessionTile from "../studtiles/EditSessionTile";
import InputGradesTile from "../studtiles/InputGradesTile";
import InputStateTestingTile from "../studtiles/InputStateTestingTile";
import NotesTile from "../studtiles/NotesTile";
import ViewGradesTile from "../studtiles/ViewGradesTile";
import ViewProgressTile from "../studtiles/ViewProgressTile";
import ViewSessionPlanTile from "../studtiles/ViewSessionPlanTile";
import ViewSessionTile from "../studtiles/ViewSessionTile";
import ViewStateTestingTile from "../studtiles/ViewStateTestingTile";

function StudentProfilePage({ student, onBack, userId, role }) {
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
        </div>

        {canShowModule("changeParentName", "studentProfile", role) && (
          <ChangeParentNameTile />
        )}
        {canShowModule("changeStudentName", "studentProfile", role) && (
          <ChangeStudentNameTile />
        )}
        {canShowModule("changeStudentGrade", "studentProfile", role) && (
          <ChangeStudentGradeTile />
        )}
        {canShowModule("notes", "studentProfile", role) && (
          <NotesTile studentId={student.id} userId={userId} />
        )}
        {canShowModule("viewGrades", "studentProfile", role) && (
          <ViewGradesTile scores={student.scores} />
        )}
        {canShowModule("addGrades", "studentProfile", role) && <AddGradesTile />}
        {canShowModule("editSession", "studentProfile", role) && (
          <EditSessionTile />
        )}
        {canShowModule("viewSession", "studentProfile", role) && (
          <ViewSessionTile />
        )}
        {canShowModule("viewStateTesting", "studentProfile", role) && (
          <ViewStateTestingTile />
        )}
        {canShowModule("inputStateTesting", "studentProfile", role) && (
          <InputStateTestingTile />
        )}
        {canShowModule("inputGrades", "studentProfile", role) && (
          <InputGradesTile />
        )}
        {canShowModule("viewProgress", "studentProfile", role) && (
          <ViewProgressTile values={student.recentScores} />
        )}
        {canShowModule("viewSessionPlan", "studentProfile", role) && (
          <ViewSessionPlanTile />
        )}

        {canShowModule("viewGrades", "studentProfile", role) && (
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
              {!scores.length && (
                <p className="muted">No score data is available yet.</p>
              )}
            </div>
          </div>
        )}

        <div className="card profile-upcoming-card">
          <CardTitle
            title="Upcoming"
            action={
              <div className="chart-actions">
                <button aria-label="Bar chart"><BarChart3 size={19} /></button>
                <button aria-label="Line chart"><ClipboardList size={18} /></button>
              </div>
            }
          />
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
