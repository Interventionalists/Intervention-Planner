import React, { useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { students, themePresets } from "./data";
import { Header, Sidebar } from "./components/AppNavigation";
import AccountPage from "./AccountPage";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import StudentProfilePage from "./pages/StudentProfilePage";
import StudentsPage from "./pages/StudentsPage";
import LoginPage from "./LoginPage";

const AUTH_SESSION_KEY = "interventioner-demo-authenticated";
const AUTH_USER_KEY = "interventioner-auth-user";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_SESSION_KEY) === "true"
  );
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = sessionStorage.getItem(AUTH_USER_KEY);
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const logIn = (user) => {
    sessionStorage.setItem(AUTH_SESSION_KEY, "true");
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  const updateUser = (user) => {
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    setCurrentUser(user);
  };

  const logOut = () => {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <LoginPage onSubmit={logIn} />
            )
          }
        />
        <Route
          path="/app"
          element={
            isAuthenticated ? (
              <PlannerApp
                onLogout={logOut}
                onUserUpdated={updateUser}
                user={currentUser}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/app" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

function PlannerApp({ onLogout, onUserUpdated, user }) {
  const [page, setPage] = useState("dashboard");
  const [selectedStudent, setSelectedStudent] = useState(students[0]);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(themePresets[0].colors);
  const userName =
    user?.name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    "User";
  const userInitials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

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
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-shell">
        <Header
          query={query}
          setQuery={setQuery}
          openMenu={() => setMobileOpen(true)}
          userName={userName}
          userInitials={userInitials}
          onAccountClick={() => selectPage("account")}
        />

        <main className="content">
          {page === "dashboard" && (
            <DashboardPage
              student={selectedStudent}
              students={students}
              onStudentChange={setSelectedStudent}
              onStudents={() => selectPage("students")}
              userName={userName}
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
          {page === "account" && (
            <AccountPage
              user={user}
              name={userName}
              initials={userInitials}
              onUserUpdated={onUserUpdated}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
