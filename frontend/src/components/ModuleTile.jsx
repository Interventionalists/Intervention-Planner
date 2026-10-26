import { CardTitle } from "./PageElements";

const moduleDetails = {
  addGrades: {
    title: "Add grades",
    description: "Enter and manage student grades.",
  },
  changeParentName: {
    title: "Change parent name",
    description: "Update the parent or guardian name for this student.",
  },
  changeStudentGrade: {
    title: "Change student grade",
    description: "Update this student's grade level.",
  },
  changeStudentName: {
    title: "Change student name",
    description: "Update this student's name.",
  },
  dailyCalendar: {
    title: "Daily calendar",
    description: "Review today's intervention schedule and events.",
  },
  classStudents: {
    title: "Students",
    description: "Review students in your classes or intervention groups.",
  },
  editSession: {
    title: "Edit session",
    description: "Update an intervention session.",
  },
  editSessionPlans: {
    title: "Edit session plans",
    description: "Create and update intervention session plans.",
  },
  inputStateTesting: {
    title: "Input state testing",
    description: "Record state testing information.",
  },
  inputGrades: {
    title: "Input grades",
    description: "Record student grades.",
  },
  personalMeetings: {
    title: "Personal meetings",
    description: "Review and manage your meetings.",
  },
  personalTodo: {
    title: "Personal todo",
    description: "Review and manage your personal to-do list.",
  },
  studentsNeedingAttention: {
    title: "Students needing attention",
    description: "Review students with a subject score below 60%.",
  },
  viewSession: {
    title: "View session",
    description: "Review intervention session details.",
  },
  viewSessionPlan: {
    title: "View session plan",
    description: "Review the student's intervention session plan.",
  },
  viewStateTesting: {
    title: "View state testing",
    description: "Review the student's state testing information.",
  },
};

export function ModuleTile({ moduleId }) {
  const module = moduleDetails[moduleId];

  if (!module) {
    throw new Error(`Unknown module tile: ${moduleId}`);
  }

  return (
    <section className="card module-tile">
      <CardTitle title={module.title} />
      <p>{module.description}</p>
      <span className="muted">Coming soon</span>
    </section>
  );
}

export function canShowModule(moduleId, page, role) {
  const permissions = modulePermissions[moduleId];
  const normalizedRole = normalizeRole(role);
  return Boolean(
    permissions &&
      permissions.pages.includes(page) &&
      (normalizedRole === "admin" || permissions.roles.includes(normalizedRole))
  );
}

function normalizeRole(role) {
  const normalized = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (
    normalized === "interventionalist" ||
    normalized === "interventionist" ||
    normalized === "interventioner"
  ) {
    return "interventionist";
  }
  if (normalized === "teacher") {
    return normalized;
  }
  if (normalized === "administrator" || normalized === "admin") {
    return "admin";
  }
  return "";
}

const modulePermissions = {
  classStudents: {
    roles: ["teacher", "interventionist"],
    pages: ["dashboard"],
  },
  changeStudentGrade: { roles: ["teacher", "admin"], pages: ["studentProfile"] },
  changeParentName: { roles: ["admin"], pages: ["studentProfile"] },
  changeStudentName: { roles: ["admin"], pages: ["studentProfile"] },
  dailyCalendar: {
    roles: ["teacher", "interventionist"],
    pages: ["dashboard"],
  },
  editSession: {
    roles: ["interventionist"],
    pages: ["dashboard", "studentProfile"],
  },
  editSessionPlans: {
    roles: ["interventionist"],
    pages: ["dashboard"],
  },
  inputStateTesting: {
    roles: ["interventionist", "admin"],
    pages: ["studentProfile"],
  },
  inputGrades: { roles: ["teacher"], pages: ["studentProfile"] },
  notes: {
    roles: ["teacher", "interventionist", "admin"],
    pages: ["studentProfile"],
  },
  personalMeetings: {
    roles: ["teacher", "interventionist"],
    pages: ["dashboard"],
  },
  personalTodo: {
    roles: ["teacher", "interventionist"],
    pages: ["dashboard"],
  },
  studentsNeedingAttention: {
    roles: ["interventionist"],
    pages: ["dashboard"],
  },
  viewGrades: {
    roles: [ "interventionist"],
    pages: ["studentProfile"],
  },
  viewProgress: {
    roles: ["teacher", "interventionist"],
    pages: ["studentProfile"],
  },
  viewSession: {
    roles: ["teacher", "interventionist"],
    pages: ["studentProfile"],
  },
  viewSessionPlan: {
    roles: ["teacher", "admin"],
    pages: ["studentProfile"],
  },
    viewSessionPlan: {
    roles: [ "interventionist"],
    pages: ["dashboard", "studentProfile"],
  },
  viewStateTesting: {
    roles: ["teacher", "interventionist", "admin"],
    pages: ["studentProfile"],
  },
};
