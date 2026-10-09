import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  LogOut,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Pencil,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
  X
} from "lucide-react";
import { events, themePresets } from "./data";
import LoginPage from "./LoginPage";
import AccountPage from "./AccountPage";

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

async function fetchStudentNotes(userId, studentId, signal) {
  const params = new URLSearchParams({
    user_id: userId,
    student_id: String(studentId),
  });
  const response = await fetch(
    `${API_BASE_URL}/notes-fetchForStudent?${params}`,
    { signal }
  );
  if (!response.ok) {
    throw new Error("Unable to load notes for this student.");
  }
  const result = await response.json();
  return result.notes || [];
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: Users },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings }
];

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
        page={page}
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
          ) : page === "dashboard" && (
            <Dashboard
              student={selectedStudent}
              studentOptions={studentsData}
              onStudentChange={setSelectedStudent}
              onStudents={() => selectPage("students")}
              userName={userName}
              userId={user?.public_id}
            />
          )}

          {!studentsLoading && !studentsError && studentsData.length > 0 && page === "students" && (
            <StudentsPage
              students={filteredStudents}
              selectedStudent={selectedStudent}
              onSelect={(student) => setSelectedStudent(student)}
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

function Sidebar({
  page,
  onPageChange,
  mobileOpen,
  closeMobile,
  onLogout,
  userName,
}) {
  return (
    <>
      {mobileOpen && <div className="mobile-overlay" onClick={closeMobile} />}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">I</div>
          <span>Interventioner</span>
          <button className="close-mobile" onClick={closeMobile}>
            <X size={20} />
          </button>
        </div>

        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => onPageChange(id)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => onPageChange("account")}>
            <CircleUserRound size={19} strokeWidth={1.8} />
            <span>{userName}</span>
          </button>
          <button className="nav-item" onClick={onLogout}>
            <LogOut size={19} strokeWidth={1.8} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function Header({
  query,
  setQuery,
  openMenu,
  userName,
  userInitials,
  onAccountClick,
}) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={openMenu} aria-label="Open menu">
        <Menu size={25} />
      </button>

      <div className="search">
        <Search size={17} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students..."
          aria-label="Search students"
        />
      </div>

      <div className="profile">
        <span>Hello, {userName}</span>
        <button
          className="avatar-small"
          type="button"
          onClick={onAccountClick}
          aria-label={`Open ${userName}'s account`}
        >
          {userInitials}
        </button>
      </div>
    </header>
  );
}

function Dashboard({
  student,
  studentOptions,
  onStudentChange,
  onStudents,
  userName,
  userId,
}) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [noteRows, setNoteRows] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setNoteRows([]);
    setDraftNotes("");
    setIsEditingNotes(false);
    setIsAddingNote(false);
    setEditingNoteId(null);
    setNotesError("");
    setNotesLoading(true);

    if (!userId) {
      setNotesError("Your account ID is missing; notes cannot be loaded.");
      setNotesLoading(false);
      return () => controller.abort();
    }

    fetchStudentNotes(userId, student.id, controller.signal)
      .then((notes) => {
        setNoteRows(notes);
        setDraftNotes(notes[0]?.text || "");
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setNotesError(error.message || "Unable to load notes.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setNotesLoading(false);
        }
      });

    return () => controller.abort();
  }, [student.id, userId]);

  const saveNotes = async () => {
    setNotesSaving(true);
    setNotesError("");
    const addNewNote = isAddingNote || editingNoteId === null;
    const params = new URLSearchParams({
      ...(!addNewNote ? { note_id: String(editingNoteId) } : {}),
      ...(!addNewNote ? { new_text: draftNotes.trim() } : {}),
    });

    try {
      const response = addNewNote
        ? await fetch(`${API_BASE_URL}/notes-create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              student_id: student.id,
              created_by: userId,
              text: draftNotes.trim(),
            }),
          })
        : await fetch(`${API_BASE_URL}/notes-editText?${params}`, {
            method: "PUT",
          });

      if (!response.ok) {
        throw new Error("Unable to save this note.");
      }

      const updatedNotes = await fetchStudentNotes(userId, student.id);
      setNoteRows(updatedNotes);
      setDraftNotes(updatedNotes[0]?.text || "");
      setIsEditingNotes(false);
      setIsAddingNote(false);
      setEditingNoteId(null);
    } catch (error) {
      setNotesError(error.message || "Unable to save this note.");
    } finally {
      setNotesSaving(false);
    }
  };

  const cancelNotes = () => {
    setDraftNotes(noteRows[0]?.text || "");
    setIsEditingNotes(false);
    setIsAddingNote(false);
    setEditingNoteId(null);
  };

  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title={`Good morning, ${userName}!`}
        subtitle="Here’s what’s happening with your intervention students."
      />

      <section className="dashboard-grid">
        <div className="card student-card">
          <div className="student-avatar-wrap">
            <img src={student.avatar} alt="" />
          </div>
          <h2>{student.name}</h2>
          <p>Grade: {student.grade}</p>
          <p>Teacher: {student.teacher}</p>
          {student.group !== "—" && <p>Group: {student.group}</p>}
          <p>Int. Teacher: {student.interventionTeacher}</p>
          <div className="student-notes">
            {notesLoading ? (
              <p className="muted">Loading notes...</p>
            ) : isEditingNotes ? (
              <>
                <span>Notes</span>
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={4}
                  placeholder={isAddingNote ? "Write another note..." : "Edit this note..."}
                />
                <div className="notes-actions">
                  <button type="button" className="text-button" onClick={saveNotes} disabled={notesSaving}>
                    {notesSaving ? "Saving..." : isAddingNote ? "Add note" : "Save changes"}
                  </button>
                  <button type="button" className="ghost-button" onClick={cancelNotes}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <span>Notes</span>
                {noteRows.length ? (
                  <div className="note-history">
                    {noteRows.map((note) => (
                      <article className="note-entry" key={note.id}>
                          <div className="note-entry-header">
                            <time>{note.date ? new Date(note.date).toLocaleDateString() : ""}</time>
                            <button
                              type="button"
                              className="note-edit-button"
                              title="Edit this note"
                              aria-label={`Edit note from ${note.date ? new Date(note.date).toLocaleDateString() : "this date"}`}
                              onClick={() => {
                                setDraftNotes(note.text || "");
                                setEditingNoteId(note.id);
                                setIsAddingNote(false);
                                setIsEditingNotes(true);
                              }}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                          </div>
                        <p>{note.text || ""}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No notes yet.</p>
                )}
                <div className="notes-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setDraftNotes("");
                      setIsAddingNote(true);
                      setEditingNoteId(null);
                      setIsEditingNotes(true);
                    }}
                  >
                    Add note
                  </button>
                </div>
              </>
            )}
            {notesError && <p className="error-state" role="alert">{notesError}</p>}
          </div>
          <select
            value={student.id}
            onChange={(e) =>
              onStudentChange(studentOptions.find((s) => String(s.id) === e.target.value))
            }
            aria-label="Select student"
          >
            {studentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="text-button" onClick={onStudents}>
            View all students →
          </button>
        </div>

        <div className="card">
          <CardTitle title="Scores" action={<SlidersHorizontal size={18} />} />
          <div className="score-list">
            {Object.entries(student.scores).slice(0, 6).map(([subject, score]) => (
              <div className="score-row" key={subject}>
                <span>{subject}</span>
                <div className="score-bar">
                  <span style={{ width: `${score}%` }} />
                </div>
                <strong>{score.toFixed(2)}%</strong>
              </div>
            ))}
            {!Object.keys(student.scores).length && (
              <p className="muted">No score data is available yet.</p>
            )}
          </div>
        </div>

        <div className="card">
          <CardTitle title="Grades" />
          <div className="grade-list">
            {Object.entries(student.scores).map(([subject, score]) => (
              <div
                key={subject}
                className={score < 60 ? "grade-alert" : ""}
              >
                <span>{subject}</span>
                <strong>{score.toFixed(2)}%</strong>
              </div>
            ))}
            {!Object.keys(student.scores).length && (
              <p className="muted">No grade data is available yet.</p>
            )}
          </div>
        </div>

        <div className="card chart-card">
          <CardTitle
            title="Progress"
            action={
              <div className="chart-actions">
                <button aria-label="Bar chart"><BarChart3 size={19} /></button>
                <button aria-label="Line chart"><ClipboardList size={18} /></button>
              </div>
            }
          />
          <ProgressChart values={student.recentScores} />
        </div>

        <div className="card">
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

function StudentsPage({ students: list, selectedStudent, onSelect }) {
  return (
    <>
      <PageHeading
        eyebrow="Students"
        title="Your students"
        subtitle="Select a student to review intervention data."
      />
      <div className="students-layout">
        <div className="card student-table-card">
          <div className="table-head">
            <span>Student</span>
            <span>Grade</span>
            <span>Teacher</span>
            <span>Math</span>
          </div>
          {list.map((student) => (
            <button
              className={`student-row ${selectedStudent.id === student.id ? "selected" : ""}`}
              key={student.id}
              onClick={() => onSelect(student)}
            >
              <span className="student-name-cell">
                <img src={student.avatar} alt="" />
                {student.name}
              </span>
              <span>{student.grade}</span>
              <span>{student.teacher}</span>
              <span className={student.scores?.Math != null && student.scores.Math < 60 ? "grade-alert" : ""}>
                {student.scores?.Math != null ? `${student.scores.Math}%` : "—"}
              </span>
            </button>
          ))}
        </div>

        <div className="card student-preview">
          <div className="preview-header">
            <img src={selectedStudent.avatar} alt="" />
            <div>
              <h2>{selectedStudent.name}</h2>
              <p>Grade {selectedStudent.grade} · Group {selectedStudent.group}</p>
            </div>
          </div>
          <CardTitle title="Current grades" />
          <div className="mini-grade-grid">
            {Object.entries(selectedStudent.scores).map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <strong className={value < 60 ? "grade-alert" : ""}>{value}%</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function CalendarPage() {
  const hours = ["8 am", "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm"];
  return (
    <>
      <PageHeading
        eyebrow="Calendar"
        title="September 21, 2026"
        subtitle="Plan intervention sessions and progress checks."
      />
      <div className="calendar-grid">
        <div className="card week-card">
          <div className="calendar-toolbar">
            <button><ChevronLeft size={18} /></button>
            <strong>Week of September 21</strong>
            <button><ChevronRight size={18} /></button>
          </div>
          <div className="week-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
              <div className="day-column" key={day}>
                <strong>{day}</strong>
                <span className="day-number">{21 + ["Mon","Tue","Wed","Thu","Fri"].indexOf(day)}</span>
                {hours.slice(0, 7).map((hour) => (
                  <div className="time-slot" key={hour}>{hour}</div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="card day-card">
          <h2>9/21/26</h2>
          {hours.map((hour) => {
            const event = events.find((e) => e.time.startsWith(hour));
            return (
              <div className="schedule-row" key={hour}>
                <span>{hour}</span>
                <div>{event && <span className="calendar-event" style={{ borderColor: event.color }}>{event.title}</span>}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ReportsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Reports"
        title="Intervention reports"
        subtitle="A placeholder report view ready for your API-backed analytics."
      />
      <div className="reports-grid">
        <div className="card report-hero">
          <span className="eyebrow">Students needing attention</span>
          <strong>2</strong>
          <p>students currently have a subject score below 60%.</p>
        </div>
        <div className="card">
          <CardTitle title="Average scores" />
          <ProgressChart values={[68, 71, 74, 72, 79, 81, 83]} />
        </div>
        <div className="card">
          <CardTitle title="Intervention sessions" />
          <div className="big-number">24</div>
          <p className="muted">This month</p>
        </div>
      </div>
    </>
  );
}

function SettingsPage({ theme, setTheme }) {
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Customize Interventioner"
        subtitle="Choose a three-color scheme to match your school."
      />
      <div className="settings-grid">
        <div className="card">
          <CardTitle title="Color scheme" />
          <div className="theme-grid">
            {themePresets.map((preset) => {
              const selected = JSON.stringify(theme) === JSON.stringify(preset.colors);
              return (
                <button
                  className={`theme-option ${selected ? "selected" : ""}`}
                  key={preset.name}
                  onClick={() => setTheme(preset.colors)}
                >
                  <div className="swatches">
                    {preset.colors.map((color) => (
                      <span key={color} style={{ background: color }} />
                    ))}
                  </div>
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card style-preview">
          <CardTitle title="Preview" />
          <div className="preview-shell">
            <div className="preview-nav" />
            <div className="preview-content">
              <div />
              <div />
              <div />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PageHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function CardTitle({ title, action }) {
  return (
    <div className="card-title">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function ProgressChart({ values }) {
  if (!values.length) {
    return <p className="muted">No progress data is available yet.</p>;
  }
  const max = Math.max(...values, 100);
  return (
    <div className="bar-chart" aria-label="Progress chart">
      {values.map((value, index) => (
        <div className="bar-column" key={index}>
          <span className="bar-value">{value}</span>
          <div className="bar-track">
            <div className="bar" style={{ height: `${(value / max) * 100}%` }} />
          </div>
          <small>W{index + 1}</small>
        </div>
      ))}
    </div>
  );
}

export default App;