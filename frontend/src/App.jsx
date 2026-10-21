import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { themePresets } from "./data";
import { Header, Sidebar } from "./components/AppNavigation";
import AccountPage from "./pages/AccountPage";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import StudentProfilePage from "./pages/StudentProfilePage";
import StudentsPage from "./pages/StudentsPage";
import UsersPage from "./pages/UsersPage";
import LoginPage from "./LoginPage";
import {
  AUTH_SESSION_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  apiFetch,
  clearAuthSession,
  getAuthToken,
} from "./api";

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
    () => sessionStorage.getItem(AUTH_SESSION_KEY) === "true" && Boolean(getAuthToken())
  );
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = sessionStorage.getItem(AUTH_USER_KEY);
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const logIn = ({ access_token, user }) => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, access_token);
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
    clearAuthSession();
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
  const [savedTheme, setSavedTheme] = useState(themePresets[0].colors);
  const [hasSavedTheme, setHasSavedTheme] = useState(false);
  const [themeLoadError, setThemeLoadError] = useState("");
  const [schoolLogo, setSchoolLogo] = useState(null);
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

    apiFetch(`${API_BASE_URL}/schools-logo`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`School logo request failed (${response.status}).`);
        }
        const result = await response.json();
        if (
          result.school_logo_api != null &&
          typeof result.school_logo_api !== "string"
        ) {
          throw new Error("The school logo response has an unexpected format.");
        }
        setSchoolLogo(result.school_logo_api || null);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.error("Unable to load the school logo:", error);
          setSchoolLogo(null);
        }
      });

    return () => controller.abort();
  }, [user?.school_id ?? user?.school]);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch(`${API_BASE_URL}/schools-theme`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load your school's color scheme.");
        }
        const result = await response.json();
        if (
          !Array.isArray(result.colors) ||
          result.colors.length !== 3 ||
          result.colors.some((color) => typeof color !== "string")
        ) {
          throw new Error("The saved color scheme has an unexpected format.");
        }
        setTheme(result.colors);
        setSavedTheme(result.colors);
        setHasSavedTheme(Boolean(result.has_theme));
        setThemeLoadError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setThemeLoadError(error.message || "Unable to load your color scheme.");
        }
      });

    return () => controller.abort();
  }, [user?.school]);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch(`${API_BASE_URL}/students-fetch`, { signal: controller.signal })
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

  const saveTheme = async (colors) => {
    const response = await apiFetch(`${API_BASE_URL}/schools-theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        color_primary: colors[0].replace(/^#/, ""),
        color_secondary: colors[1].replace(/^#/, ""),
        color_tertiary: colors[2].replace(/^#/, ""),
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(
        result?.detail || `Unable to save your school's color scheme (${response.status}).`
      );
    }
    const result = await response.json();
    if (!Array.isArray(result.colors) || result.colors.length !== 3) {
      throw new Error("The saved color scheme response has an unexpected format.");
    }
    setTheme(result.colors);
    setSavedTheme(result.colors);
    setHasSavedTheme(Boolean(result.has_theme));
    setThemeLoadError("");
  };

  const filteredStudents = useMemo(
    () =>
      studentsData.filter((student) =>
        student.name.toLowerCase().includes(query.toLowerCase())
      ),
    [query, studentsData]
  );

  const selectPage = (id) => {
    if (id === "users" && user?.role !== "admin") {
      return;
    }
    setPage(id);
    setMobileOpen(false);
  };

  const openStudentProfile = (student) => {
    setSelectedStudent(student);
    selectPage("student-profile");
  };

  const updateSelectedStudent = (record) => {
    const updatedStudent = mapStudent(record);
    setSelectedStudent(updatedStudent);
    setStudentsData((currentStudents) =>
      currentStudents.map((student) =>
        student.id === updatedStudent.id ? updatedStudent : student
      )
    );
  };

  const updateTheme = (colors) => {
    if (user?.role === "admin") {
      setTheme(colors);
    }
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
        role={user?.role}
        schoolLogo={schoolLogo}
        onSchoolLogoError={() => setSchoolLogo(null)}
      />

      <div className="main-shell">
        <Header
          query={query}
          setQuery={setQuery}
          openMenu={() => setMobileOpen(true)}
          userName={userName}
          userInitials={userInitials}
          onAccountClick={() => selectPage("account")}
          showSearch={page !== "users"}
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
                  onStudentSelect={openStudentProfile}
                  onStudents={() => selectPage("students")}
                  userName={userName}
                   userId={user?.public_id}
                  role={user?.role}
                />
              )}
              {page === "student-profile" && (
                <StudentProfilePage
                  student={selectedStudent}
                  onBack={() => selectPage("students")}
                  userId={user?.public_id}
                  role={user?.role}
                />
              )}
              {page === "students" && (
                <StudentsPage
                  students={filteredStudents}
                  selectedStudent={selectedStudent}
                  userId={user?.public_id}
                  role={user?.role}
                  onSelect={openStudentProfile}
                />
              )}
              {page === "users" && user?.role === "admin" && (
                <UsersPage
                  role={user.role}
                  signedInUser={user}
                  onUserUpdated={onUserUpdated}
                />
              )}
              {page === "calendar" && <CalendarPage />}
              {page === "reports" && <ReportsPage students={studentsData} />}
              {page === "settings" && (
                <SettingsPage
                  theme={theme}
                  savedTheme={savedTheme}
                  hasSavedTheme={hasSavedTheme}
                  setTheme={updateTheme}
                  onSaveTheme={saveTheme}
                  canManageTheme={user?.role === "admin"}
                  loadError={themeLoadError}
                />
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
