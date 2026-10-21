import { ArrowLeft, BarChart3, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { events } from "../data";
import { canShowModule } from "../components/ModuleTile";
import { CardTitle, PageHeading, ProgressChart } from "../components/PageElements";
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

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
import StudentNotes from "../components/StudentNotes";
import { apiFetch } from "../api";

function StudentProfilePage({ student, onBack, userId, onStudentUpdated, role }) {
  const [notes, setNotes] = useState([]);
  const [notesError, setNotesError] = useState("");
  const [notesLoading, setNotesLoading] = useState(true);
  const [groupNumber, setGroupNumber] = useState(
    student.group_number == null ? "" : String(student.group_number)
  );
  const [profileUpdateError, setProfileUpdateError] = useState("");
  const [profileUpdateMessage, setProfileUpdateMessage] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
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
    setGroupNumber(
      student.group_number == null ? "" : String(student.group_number)
    );
    setProfileUpdateError("");
    setProfileUpdateMessage("");
  }, [student.id, student.group_number]);

  const updateStudentProfile = async (updates, successMessage) => {
    setIsUpdatingProfile(true);
    setProfileUpdateError("");
    setProfileUpdateMessage("");

    try {
      if (!userId) {
        throw new Error("The signed-in user's ID is missing.");
      }

      const response = await apiFetch(
        `${API_BASE_URL}/students-profile/${encodeURIComponent(student.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...updates, requester_id: userId }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || `Profile update failed (${response.status}).`);
      }
      if (!result.student) {
        throw new Error("The profile update response has an unexpected format.");
      }

      onStudentUpdated(result.student);
      setProfileUpdateMessage(successMessage);
    } catch (error) {
      console.error("Error updating student profile:", error);
      setProfileUpdateError(error.message || "Could not update this student.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const saveGroupNumber = (event) => {
    event.preventDefault();
    const parsedGroupNumber = groupNumber.trim() ? Number(groupNumber) : null;
    if (
      parsedGroupNumber !== null &&
      (!Number.isInteger(parsedGroupNumber) || parsedGroupNumber < 1)
    ) {
      setProfileUpdateError("Enter a whole group number greater than zero.");
      return;
    }

    updateStudentProfile(
      { group_number: parsedGroupNumber },
      "Group number saved."
    );
  };

  const unassignInterventionist = () =>
    updateStudentProfile(
      { interventionist: null },
      "Interventionist unassigned."
    );

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
        const response = await apiFetch(
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
          <InputStateTestingTile studentId={student.id} />
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
