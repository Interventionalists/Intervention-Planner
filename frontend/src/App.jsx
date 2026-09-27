import React, { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
  X
} from "lucide-react";
import { currentUser, events, students, themePresets } from "./data";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: Users },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

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
      />

      <div className="main-shell">
        <Header
          query={query}
          setQuery={setQuery}
          openMenu={() => setMobileOpen(true)}
        />

        <main className="content">
          {page === "dashboard" && (
            <Dashboard
              student={selectedStudent}
              onStudentChange={setSelectedStudent}
              onStudents={() => selectPage("students")}
            />
          )}

          {page === "students" && (
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
        </main>
      </div>
    </div>
  );
}

function Sidebar({ page, onPageChange, mobileOpen, closeMobile }) {
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
          <button className="nav-item">
            <CircleUserRound size={19} strokeWidth={1.8} />
            <span>{currentUser.name}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function Header({ query, setQuery, openMenu }) {
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
        <span>Hello, {currentUser.name}</span>
        <div className="avatar-small">{currentUser.initials}</div>
      </div>
    </header>
  );
}

function Dashboard({ student, onStudentChange, onStudents }) {
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Good morning, Ms. Poop"
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
          <p>Group: {student.group}</p>
          <p>Int. Teacher: {student.interventionTeacher}</p>
          <div className="student-notes">
            <span>Notes</span>
            <p>{student.notes || "No notes yet."}</p>
          </div>
          <select
            value={student.id}
            onChange={(e) =>
              onStudentChange(students.find((s) => s.id === Number(e.target.value)))
            }
            aria-label="Select student"
          >
            {students.map((s) => (
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
              <span className={student.scores.Math < 60 ? "grade-alert" : ""}>
                {student.scores.Math}%
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