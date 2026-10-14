import { PageHeading } from "../components/PageElements";
import { canShowModule } from "../components/ModuleTile";
import DailyCalendarTile from "../dashtiles/DailyCalendarTile";
import EditSessionPlansTile from "../dashtiles/EditSessionPlansTile";
import EditSessionTile from "../dashtiles/EditSessionTile";
import PersonalMeetingsTile from "../dashtiles/PersonalMeetingsTile";
import PersonalTodoTile from "../dashtiles/PersonalTodoTile";
import SelectedStudentTile from "../dashtiles/SelectedStudentTile";
import StudentsNeedingAttentionTile from "../dashtiles/StudentsNeedingAttentionTile";
import ViewSessionPlanTile from "../dashtiles/ViewSessionPlanTile";
import ViewSessionTile from "../dashtiles/ViewSessionTile";

function DashboardPage({
  student,
  students,
  onStudentChange,
  onStudentSelect,
  onStudents,
  userName = "User",
  role,
}) {
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title={`Good morning, ${userName}!`}
        subtitle="Here’s what’s happening with your intervention students."
      />

      <section className="dashboard-grid">
        <SelectedStudentTile
          student={student}
          students={students}
          onStudentChange={onStudentChange}
          onStudents={onStudents}
        />
        {canShowModule("studentsNeedingAttention", "dashboard", role) && (
          <StudentsNeedingAttentionTile
            students={students}
            onStudentSelect={onStudentSelect}
          />
        )}
        {canShowModule("editSession", "dashboard", role) && <EditSessionTile />}
        {canShowModule("viewSession", "dashboard", role) && <ViewSessionTile />}
        {canShowModule("personalTodo", "dashboard", role) && <PersonalTodoTile />}
        {canShowModule("personalMeetings", "dashboard", role) && (
          <PersonalMeetingsTile />
        )}
        {canShowModule("editSessionPlans", "dashboard", role) && (
          <EditSessionPlansTile />
        )}
        {canShowModule("viewSessionPlan", "dashboard", role) && (
          <ViewSessionPlanTile />
        )}
        {canShowModule("dailyCalendar", "dashboard", role) && (
          <DailyCalendarTile />
        )}
      </section>
    </>
  );
}

export default DashboardPage;
