import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { themePresets } from "./data";
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
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function relatedUserName(user) {
  return user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ")
    : "";
}

function mapStudent(row) {
  return {
    ...row,
    name:
      row.name ||
      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
      "Unnamed student",
    grade: row.grade_level ?? row.grade ?? "—",
    teacher: relatedUserName(row.teacher_user) || "Not assigned",
    interventionTeacher:
      relatedUserName(row.interventionist_user) || "Not assigned",
    group: row.group ?? "—",
    avatar: `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(
      [row.first_name, row.last_name].filter(Boolean).join(" ") || row.id
    )}`,
    scores: row.scores || {},
    recentScores: row.recent_scores || [],
  };
}

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
  const [studentsData, setStudentsData] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
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

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE_URL}/students-fetch`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load students from the database.");
        }
        return response.json();
      })
      .then((result) => {
        const records = (result.students || []).map(mapStudent);
        setStudentsData(records);
        setSelectedStudent(records[0] || null);
        setStudentsError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setStudentsError(error.message || "Unable to load students.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStudentsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const filteredStudents = useMemo(
    () =>
      studentsData.filter((student) =>
        student.name.toLowerCase().includes(query.toLowerCase())
      ),
    [query, studentsData]
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
          {studentsLoading ? (
            <div className="data-state" role="status">Loading students...</div>
          ) : studentsError ? (
            <div className="data-state error-state" role="alert">
              {studentsError} Check that the backend is running and VITE_API_URL is correct.
            </div>
          ) : studentsData.length === 0 ? (
            <div className="data-state">No students were returned by the database.</div>
          ) : (
            <>
              {page === "dashboard" && (
                <DashboardPage
                  student={selectedStudent}
                  students={studentsData}
                  onStudentChange={setSelectedStudent}
                  onStudents={() => selectPage("students")}
                  userName={userName}
                  userId={user?.public_id}
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
