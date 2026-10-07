import React, { useMemo, useState } from "react";
import { students, themePresets } from "./data";
import { Header, Sidebar } from "./components/AppNavigation";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import StudentProfilePage from "./pages/StudentProfilePage";
import StudentsPage from "./pages/StudentsPage";

function App() {
  const [page, setPage] = useState("dashboard");
  const [selectedStudent, setSelectedStudent] = useState(students[0]);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(themePresets[0].colors);

  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        student.name.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  const selectPage = (id) => {
    setPage(id);
    setMobileOpen(false);
  };

  const openStudentProfile = (student) => {
    setSelectedStudent(student);
    selectPage("student-profile");
  };

  return (
    <div
      className="app"
      style={{
        "--primary": theme[0],
        "--secondary": theme[1],
        "--accent": theme[2],
      }}
    >
      <Sidebar
        page={page === "student-profile" ? "students" : page}
        onPageChange={selectPage}
        mobileOpen={mobileOpen}
        closeMobile={() => setMobileOpen(false)}
      />

      <div className="main-shell">
        <Header
          query={query}
          setQuery={setQuery}
          openMenu={() => setMobileOpen(true)}
        />

        <main className="content">
          {page === "dashboard" && (
            <DashboardPage
              student={selectedStudent}
              students={students}
              onStudentChange={setSelectedStudent}
              onStudents={() => selectPage("students")}
            />
          )}
          {page === "student-profile" && (
            <StudentProfilePage
              student={selectedStudent}
              onBack={() => selectPage("students")}
            />
          )}
          {page === "students" && (
            <StudentsPage
              students={filteredStudents}
              selectedStudent={selectedStudent}
              onSelect={openStudentProfile}
            />
          )}
          {page === "calendar" && <CalendarPage />}
          {page === "reports" && <ReportsPage />}
          {page === "settings" && (
            <SettingsPage theme={theme} setTheme={setTheme} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
