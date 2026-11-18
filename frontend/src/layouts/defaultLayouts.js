//starting layouts for users who have never arranged a page. Once a user moves,
//resizes, adds or removes a tile, their own layout is saved and used instead.
//Tiles listed here that the user's role can't see are dropped automatically.
//sizes may include tiles not in order: they apply if the user adds that tile.

export const DEFAULT_DASHBOARD_LAYOUT = {
  order: [
    "calendarDayView",
    "quickNewEvent",
    "classStudents",
    "personalTodo",
    "upcomingEvents",
    "calendarWeekView",
  ],
  sizes: {
    personalTodo: { width: 970, height: 480 },
    classStudents: { width: 320, height: 380 },
    dailyCalendar: { width: 320, height: 380 },
    quickNewEvent: { width: 320, height: 380 },
    upcomingEvents: { width: 220, height: 330 },
    calendarDayView: { width: 370, height: 580 },
    selectedStudent: { width: 270, height: 380 },
    viewSessionPlan: { width: 270, height: 380 },
    calendarWeekView: { width: 370, height: 330 },
    personalMeetings: { width: 320, height: 280 },
  },
};

//used for every student profile page a user hasn't arranged yet.
export const DEFAULT_STUDENT_LAYOUT = {
  order: [
    "profileIdentity",
    "assignmentGrades",
    "changeStudentGrade",
    "sessionPlanning",
    "studentGoals",
    "notes",
    "upcomingEvents",
  ],
  sizes: {
    notes: { width: 220, height: 230 },
    inputGrades: { width: 220, height: 180 },
    studentGoals: { width: 420, height: 280 },
    profileIdentity: { width: 320, height: 330 },
    sessionPlanning: { width: 270, height: 280 },
    assignmentGrades: { width: 420, height: 380 },
    viewStateTesting: { width: 220, height: 180 },
    changeStudentGrade: { width: 220, height: 280 },
  },
};
