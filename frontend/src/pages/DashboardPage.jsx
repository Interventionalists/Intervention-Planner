import { useState } from "react";
import { events } from "../data";
import { PageHeading } from "../components/PageElements";
import { canShowModule } from "../components/ModuleTile";
import TileWorkspace from "../components/TileWorkspace";
import DailyCalendarTile from "../dashtiles/DailyCalendarTile";
import EditSessionPlansTile from "../dashtiles/EditSessionPlansTile";
import EditSessionTile from "../dashtiles/EditSessionTile";
import PersonalMeetingsTile from "../dashtiles/PersonalMeetingsTile";
import PersonalTodoTile from "../dashtiles/PersonalTodoTile";
import SelectedStudentTile from "../dashtiles/SelectedStudentTile";
import ClassStudentsTile from "../dashtiles/ClassStudentsTile";
import StudentsNeedingAttentionTile from "../dashtiles/StudentsNeedingAttentionTile";
import ViewSessionPlanTile from "../dashtiles/ViewSessionPlanTile";
import ViewSessionTile from "../dashtiles/ViewSessionTile";

function getDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function DashboardPage({
  student,
  students,
  onStudentChange,
  onStudentSelect,
  onStudents,
  userName = "User",
  userId,
  role,
}) {
  const [calendarDate, setCalendarDate] = useState(() => getDateKey(new Date()));
  const [calendarMeetings, setCalendarMeetings] = useState([]);

  const addMeetingToCalendar = (meeting) => {
    setCalendarMeetings((currentMeetings) =>
      currentMeetings.some(
        (item) => item.id === meeting.id && item.date === calendarDate
      )
        ? currentMeetings
        : [...currentMeetings, { ...meeting, date: calendarDate }]
    );
  };

  const removeMeetingFromCalendar = (meetingId, date) => {
    setCalendarMeetings((currentMeetings) =>
      currentMeetings.filter(
        (meeting) => meeting.id !== meetingId || meeting.date !== date
      )
    );
  };

  const dashboardTiles = [
    {
      id: "selectedStudent",
      title: "Selected student",
      content: (
        <SelectedStudentTile
          student={student}
          students={students}
          onStudentChange={onStudentChange}
          onStudents={onStudents}
        />
      ),
    },
    canShowModule("classStudents", "dashboard", role) && {
      id: "classStudents",
      title: "Students",
      content: (
        <ClassStudentsTile
          students={students}
          userId={userId}
          role={role}
          onStudentSelect={onStudentSelect}
        />
      ),
    },
    canShowModule("studentsNeedingAttention", "dashboard", role) && {
      id: "studentsNeedingAttention",
      title: "Students needing attention",
      content: (
        <StudentsNeedingAttentionTile
          students={students}
          onStudentSelect={onStudentSelect}
        />
      ),
    },
    canShowModule("editSession", "dashboard", role) && {
      id: "editSession",
      title: "Edit session",
      content: <EditSessionTile />,
    },
    canShowModule("viewSession", "dashboard", role) && {
      id: "viewSession",
      title: "View session",
      content: <ViewSessionTile />,
    },
    canShowModule("personalTodo", "dashboard", role) && {
      id: "personalTodo",
      title: "Personal todo",
      content: <PersonalTodoTile />,
    },
    canShowModule("personalMeetings", "dashboard", role) && {
      id: "personalMeetings",
      title: "Personal meetings",
      content: (
        <PersonalMeetingsTile
          onAddToCalendar={addMeetingToCalendar}
          calendarMeetingIds={calendarMeetings
            .filter((meeting) => meeting.date === calendarDate)
            .map((meeting) => meeting.id)}
        />
      ),
    },
    canShowModule("editSessionPlans", "dashboard", role) && {
      id: "editSessionPlans",
      title: "Edit session plans",
      content: <EditSessionPlansTile />,
    },
    canShowModule("viewSessionPlan", "dashboard", role) && {
      id: "viewSessionPlan",
      title: "View session plan",
      content: <ViewSessionPlanTile />,
    },
    canShowModule("dailyCalendar", "dashboard", role) && {
      id: "dailyCalendar",
      title: "Daily calendar",
      content: (
        <DailyCalendarTile
          date={calendarDate}
          onDateChange={setCalendarDate}
          meetings={calendarMeetings.filter(
            (meeting) => meeting.date === calendarDate
          )}
          onRemoveMeeting={removeMeetingFromCalendar}
        />
      ),
    },
  ].filter(Boolean);

  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title={`Good morning, ${userName}!`}
        subtitle="Here’s what’s happening with your intervention students."
      />

      <TileWorkspace
        className="dashboard-grid"
        key={`dashboard-${userId ?? role ?? "default"}`}
        storageKey={`tile-layout-dashboard-${userId ?? role ?? "default"}`}
        tiles={dashboardTiles}
      />
    </>
  );
}

export default DashboardPage;
