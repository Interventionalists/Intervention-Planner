import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { events } from "../data";
import { canShowModule } from "../components/ModuleTile";
import { CardTitle, PageHeading } from "../components/PageElements";
import TileWorkspace from "../components/TileWorkspace";
import AddGradesTile from "../studtiles/AddGradesTile";
import ChangeParentNameTile from "../studtiles/ChangeParentNameTile";
import ChangeStudentGradeTile from "../studtiles/ChangeStudentGradeTile";
import ChangeStudentNameTile from "../studtiles/ChangeStudentNameTile";
import EditSessionTile from "../studtiles/EditSessionTile";
import InputGradesTile from "../studtiles/InputGradesTile";
import InputStateTestingTile from "../studtiles/InputStateTestingTile";
import NotesTile from "../studtiles/NotesTile";
import StudentGoalsTile from "../studtiles/StudentGoalsTile";
import ViewGradesTile from "../studtiles/ViewGradesTile";
import ViewSessionPlanTile from "../studtiles/ViewSessionPlanTile";
import ViewSessionTile from "../studtiles/ViewSessionTile";
import ViewStateTestingTile from "../studtiles/ViewStateTestingTile";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
import StudentNotes from "../components/StudentNotes";
import { apiFetch } from "../api";
import { useStudentAssignments } from "../hooks/useStudentAssignments";
import { calculateAssignmentGrades } from "../utils/assignmentGrades";

const AssignmentGradesTile = lazy(
  () => import("../studtiles/AssignmentGradesTile")
);

function StudentProfilePage({ student, onBack, userId, onStudentUpdated, role }) {
  const {
    assignments,
    setAssignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useStudentAssignments(student.id);
  const [groupNumber, setGroupNumber] = useState(
    student.group_number == null ? "" : String(student.group_number)
  );
  const [profileUpdateError, setProfileUpdateError] = useState("");
  const [profileUpdateMessage, setProfileUpdateMessage] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [stateTestScoresVersion, setStateTestScoresVersion] = useState(0);
  const assignmentGrades = useMemo(
    () => calculateAssignmentGrades(assignments),
    [assignments]
  );
  const scores = Object.entries(assignmentGrades).filter(([, score]) =>
    Number.isFinite(score)
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
  const parentInfo =
    student.parent_name ??
    student.parent ??
    student.guardian_name ??
    student.guardian ??
    "Not provided";
  const parentPhone =
    student.parent_phone ??
    student.parent_phone_number ??
    student.guardian_phone ??
    student.guardian_phone_number ??
    student.parentPhone ??
    student.guardianPhone ??
    "Not provided";

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

  const studentTiles = [
    {
      id: "profileIdentity",
      title: "Student details",
      content: (
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
            <div>
              <dt>Intervention teacher</dt>
              <dd>{interventionTeacher || student.interventionTeacher || "Not assigned"}</dd>
            </div>
          </dl>
          <section className="profile-parent-info" aria-labelledby="profile-parent-info-title">
            <h3 id="profile-parent-info-title">Parent info</h3>
            <dl className="profile-details">
              <div><dt>Parent name</dt><dd>{parentInfo}</dd></div>
              <div><dt>Phone number</dt><dd>{parentPhone}</dd></div>
            </dl>
          </section>
        </div>
      ),
    },
    canShowModule("changeParentName", "studentProfile", role) && {
      id: "changeParentName",
      title: "Change parent name",
      content: <ChangeParentNameTile />,
    },
    canShowModule("changeStudentName", "studentProfile", role) && {
      id: "changeStudentName",
      title: "Change student name",
      content: <ChangeStudentNameTile />,
    },
    canShowModule("changeStudentGrade", "studentProfile", role) && {
      id: "changeStudentGrade",
      title: "Change student grade",
      content: <ChangeStudentGradeTile />,
    },
    canShowModule("notes", "studentProfile", role) && {
      id: "notes",
      title: "Notes",
      content: <NotesTile studentId={student.id} userId={userId} />,
    },
    {
      id: "studentGoals",
      title: "Goals",
      content: (
        <StudentGoalsTile
          studentId={student.id}
          currentGrades={assignmentGrades}
          gradesLoading={assignmentsLoading}
        />
      ),
    },
    canShowModule("viewGrades", "studentProfile", role) && {
      id: "viewGrades",
      title: "View grades",
      content: <ViewGradesTile scores={student.scores} />,
    },
    canShowModule("addGrades", "studentProfile", role) && {
      id: "addGrades",
      title: "Add grades",
      content: <AddGradesTile />,
    },
    canShowModule("editSession", "studentProfile", role) && {
      id: "editSession",
      title: "Edit session",
      content: <EditSessionTile />,
    },
    canShowModule("viewSession", "studentProfile", role) && {
      id: "viewSession",
      title: "View session",
      content: <ViewSessionTile />,
    },
    canShowModule("viewStateTesting", "studentProfile", role) && {
      id: "viewStateTesting",
      title: "View state testing",
      content: (
        <ViewStateTestingTile
          studentId={student.id}
          refreshToken={stateTestScoresVersion}
        />
      ),
    },
    canShowModule("inputStateTesting", "studentProfile", role) && {
      id: "inputStateTesting",
      title: "Input state testing",
      content: (
        <InputStateTestingTile
          studentId={student.id}
          onScoreSaved={() =>
            setStateTestScoresVersion((version) => version + 1)
          }
        />
      ),
    },
    canShowModule("inputGrades", "studentProfile", role) && {
      id: "inputGrades",
      title: "Input grades",
      content: <InputGradesTile />,
    },
    canShowModule("viewProgress", "studentProfile", role) && {
      id: "assignmentGrades",
      title: "Assignment grades",
      content: (
        <Suspense
          fallback={
            <div className="card chart-card profile-progress-card">
              <CardTitle title="Assignment grades" />
              <p className="muted" role="status">Loading grade graph...</p>
            </div>
          }
        >
          <AssignmentGradesTile
            assignments={assignments}
            isLoading={assignmentsLoading}
            error={assignmentsError}
          />
        </Suspense>
      ),
    },
    canShowModule("viewSessionPlan", "studentProfile", role) && {
      id: "viewSessionPlan",
      title: "View session plan",
      content: <ViewSessionPlanTile />,
    },
    canShowModule("viewGrades", "studentProfile", role) && {
      id: "scores",
      title: "Scores",
      content: (
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
      ),
    },
    {
      id: "upcomingEvents",
      title: "Upcoming events",
      content: (
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
      ),
    },
  ].filter(Boolean);

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

      <TileWorkspace
        className="student-profile-layout"
        key={`student-profile-${userId ?? "default"}-${student.id ?? "unknown"}`}
        storageKey={`tile-layout-student-${userId ?? "default"}-${student.id ?? "unknown"}`}
        tiles={studentTiles}
      />
    </>
  );
}

export default StudentProfilePage;
