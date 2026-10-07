import {
  BarChart3,
  CalendarDays,
  CircleUserRound,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { currentUser } from "../data";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: Users },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ page, onPageChange, mobileOpen, closeMobile }) {
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

export function Header({ query, setQuery, openMenu }) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={openMenu} aria-label="Open menu">
        <Menu size={25} />
      </button>

      <div className="search">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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
