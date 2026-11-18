import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  UsersRound,
  UserRoundCog,
  X,
} from "lucide-react";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: Users },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "users", label: "Users", icon: UserRoundCog, adminOnly: true },
  { id: "status", label: "Status", icon: Activity, adminOnly: true },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  page,
  onPageChange,
  mobileOpen,
  closeMobile,
  onLogout,
  userName = "User",
  role,
  schoolLogo,
  onSchoolLogoError,
}) {
  return (
    <>
      {mobileOpen && <div className="mobile-overlay" onClick={closeMobile} />}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">
            {schoolLogo ? (
              <img
                src={schoolLogo}
                alt=""
                onError={onSchoolLogoError}
              />
            ) : (
              "I"
            )}
          </div>
          <span>Interventioner</span>
          <button className="close-mobile" onClick={closeMobile}>
            <X size={20} />
          </button>
        </div>

        <nav>
          {navItems
            .filter(({ adminOnly }) => !adminOnly || role === "admin")
            .map(({ id, label, icon: Icon }) => (
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
          {onLogout && (
            <button className="nav-item" onClick={onLogout}>
              <LogOut size={19} strokeWidth={1.8} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

const MAX_SEARCH_RESULTS = 8;

//header search: filters the students this user may search (decided by the
//caller) by name and opens the chosen student's profile.
function StudentSearch({
  query,
  setQuery,
  students = [],
  isLoading = false,
  onSelect,
  placeholder,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      normalizedQuery
        ? students
            .filter((student) =>
              student.name.toLowerCase().includes(normalizedQuery)
            )
            .slice(0, MAX_SEARCH_RESULTS)
        : [],
    [normalizedQuery, students]
  );
  const showResults = isOpen && Boolean(normalizedQuery);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!showResults) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [showResults]);

  const choose = (student) => {
    onSelect?.(student);
    setQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && showResults) {
      event.preventDefault();
      choose(results[activeIndex] ?? results[0]);
    }
  };

  return (
    <div className="search" ref={containerRef}>
      <Search size={17} />
      <input
        aria-activedescendant={
          showResults && results[activeIndex]
            ? `student-search-option-${activeIndex}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls="student-search-results"
        aria-expanded={showResults}
        aria-label={placeholder.replace("...", "")}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        type="search"
        value={query}
      />
      {showResults && (
        <div className="search-results" id="student-search-results" role="listbox">
          {isLoading ? (
            <p className="search-results-state">Loading students...</p>
          ) : results.length ? (
            results.map((student, index) => (
              <button
                aria-selected={index === activeIndex}
                className={`search-result ${index === activeIndex ? "active" : ""}`}
                id={`student-search-option-${index}`}
                key={student.id ?? student.name}
                onClick={() => choose(student)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                <span className="search-result-name">{student.name}</span>
                <span className="search-result-meta">
                  Grade {student.grade} · {student.teacher}
                </span>
              </button>
            ))
          ) : (
            <p className="search-results-state">No students match "{query.trim()}".</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Header({
  query,
  setQuery,
  openMenu,
  userName = "User",
  userInitials = "U",
  onAccountClick,
  searchPlaceholder = "Search students...",
  showSearch = true,
  searchStudents = [],
  searchLoading = false,
  onStudentSearchSelect,
}) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={openMenu} aria-label="Open menu">
        <Menu size={25} />
      </button>

      {showSearch && (
        <StudentSearch
          isLoading={searchLoading}
          onSelect={onStudentSearchSelect}
          placeholder={searchPlaceholder}
          query={query}
          setQuery={setQuery}
          students={searchStudents}
        />
      )}

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
