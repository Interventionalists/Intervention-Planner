import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Palette,
  Repeat2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { PageHeading } from "../components/PageElements";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const hours = ["8 am", "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm"];
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const initialDate = new Date();
initialDate.setHours(0, 0, 0, 0);

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function formatDate(date, options) {
  return date.toLocaleDateString("en-US", options);
}

function getEventsForDate(date, calendarEvents) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return calendarEvents.filter((event) => {
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);
    return startsAt < dayEnd && endsAt > dayStart;
  });
}

function getEventHour(event) {
  const startsAt = new Date(event.starts_at);
  if (Number.isNaN(startsAt.getTime())) return "";
  const hour = startsAt.getHours();
  return `${hour % 12 || 12} ${hour < 12 ? "am" : "pm"}`;
}

function getEventTitle(event) {
  return event.title || event.event_type || "Calendar event";
}

function getEventDescription(event) {
  const participants = (event.participants || []).map((participant) => participant.name);
  return [getEventTitle(event), ...participants].join(" · ");
}

function formatEventDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventDuration(startsAt, endsAt) {
  const durationMinutes = Math.round((new Date(endsAt) - new Date(startsAt)) / 60000);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) return null;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return [
    hours ? `${hours} hr${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} min` : "",
  ].filter(Boolean).join(" ") || "Less than a minute";
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function CalendarPage({ user }) {
  const [view, setView] = useState("week");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [colorDraft, setColorDraft] = useState("#172c50");
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [colorSaveError, setColorSaveError] = useState("");
  const [colorSaveMessage, setColorSaveMessage] = useState("");
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const closeModalButton = useRef(null);
  const eventTrigger = useRef(null);
  const weekStart = startOfWeek(selectedDate);
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const calendarStart = startOfWeek(monthStart);
  const monthDates = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const rangeStart = view === "month" ? calendarStart : weekStart;
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeStart.getDate() + (view === "month" ? 42 : 7));
  const selectedEvents = getEventsForDate(selectedDate, calendarEvents);
  const selectedSessionDetails = selectedEvent?.session_details || [];
  const eventStatus = selectedSessionDetails.find((detail) => detail.status)?.status;
  const eventDuration = selectedEvent
    ? formatEventDuration(selectedEvent.starts_at, selectedEvent.ends_at)
    : null;
  const canChangeEventColor = Boolean(
    selectedEvent &&
    (user?.role === "admin" || selectedEvent.organizer === user?.public_id)
  );
  const appElement = document.querySelector(".app");
  const computedStyles = appElement ? window.getComputedStyle(appElement) : null;
  const themeColorOptions = [
    { label: "Primary", color: computedStyles?.getPropertyValue("--primary").trim() || "#172c50" },
    { label: "Secondary", color: computedStyles?.getPropertyValue("--secondary").trim() || "#079bd8" },
    { label: "Accent", color: computedStyles?.getPropertyValue("--accent").trim() || "#48b7f2" },
  ];
  const basicColorOptions = [
    { label: "Red", color: "#d92d20" },
    { label: "Orange", color: "#e8791a" },
    { label: "Green", color: "#20804b" },
    { label: "Blue", color: "#2563eb" },
    { label: "Purple", color: "#7a3db8" },
    { label: "Gray", color: "#667085" },
  ];

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      starts_at: rangeStart.toISOString(),
      ends_at: rangeEnd.toISOString(),
    });

    async function loadCalendarEvents() {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/calendar-events?${params}`,
          { signal: controller.signal }
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            result?.detail || `Unable to load calendar events (${response.status}).`
          );
        }
        if (!Array.isArray(result?.events)) {
          throw new Error("The calendar events response has an unexpected format.");
        }
        setCalendarEvents(result.events);
      } catch (error) {
        if (error.name !== "AbortError") {
          setLoadError(error.message || "Unable to load calendar events.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadCalendarEvents();
    return () => controller.abort();
  }, [rangeStart.toISOString(), rangeEnd.toISOString()]);

  useEffect(() => {
    if (!selectedEvent) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedEvent(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    closeModalButton.current?.focus();
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      eventTrigger.current?.focus();
    };
  }, [selectedEvent]);

  function moveCalendar(direction) {
    const nextDate = new Date(selectedDate);
    if (view === "month") {
      nextDate.setDate(1);
      nextDate.setMonth(nextDate.getMonth() + direction);
    } else {
      nextDate.setDate(nextDate.getDate() + direction * 7);
    }
    setSelectedDate(nextDate);
  }

  async function saveEventColor() {
    if (!selectedEvent?.public_id) {
      setColorSaveError("This event is missing its public ID and cannot be updated.");
      return;
    }

    setIsSavingColor(true);
    setColorSaveError("");
    setColorSaveMessage("");
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/calendar-events/${encodeURIComponent(selectedEvent.public_id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: colorDraft }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.detail || `Unable to update the event color (${response.status}).`
        );
      }

      const updatedEvent = { ...selectedEvent, color: result?.event?.color ?? colorDraft };
      setSelectedEvent(updatedEvent);
      setCalendarEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.public_id === selectedEvent.public_id ? updatedEvent : event
        )
      );
      setColorDraft(updatedEvent.color);
      setColorSaveMessage("Event color saved.");
    } catch (error) {
      setColorSaveError(error.message || "Unable to update the event color.");
    } finally {
      setIsSavingColor(false);
    }
  }

  function renderEvent(event, compact = false) {
    const color = event.color || "var(--primary)";
    return (
      <button
        type="button"
        className={`calendar-event${compact ? " calendar-event-compact" : ""}`}
        key={event.public_id || event.id}
        style={{ borderColor: color }}
        title={getEventDescription(event)}
        aria-label={`View details for ${getEventTitle(event)}`}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          eventTrigger.current = clickEvent.currentTarget;
          setColorDraft(event.color || themeColorOptions[0].color);
          setColorSaveError("");
          setColorSaveMessage("");
          setSelectedEvent(event);
        }}
      >
        <strong>{getEventTitle(event)}</strong>
        {event.participants?.length > 0 && (
          <small className="calendar-event-participants">
            {event.participants.map((participant) => participant.name).join(", ")}
          </small>
        )}
      </button>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Calendar"
        title={formatDate(selectedDate, { month: "long", day: "numeric", year: "numeric" })}
        subtitle="Plan intervention sessions and progress checks."
      />
      <div className="calendar-grid">
        <section className="card week-card">
          <div className="calendar-toolbar">
            <button type="button" onClick={() => moveCalendar(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"}>
              <ChevronLeft size={18} />
            </button>
            <strong>
              {view === "month"
                ? formatDate(selectedDate, { month: "long", year: "numeric" })
                : `Week of ${formatDate(weekStart, { month: "long", day: "numeric" })}`}
            </strong>
            <button type="button" onClick={() => moveCalendar(1)} aria-label={view === "month" ? "Next month" : "Next week"}>
              <ChevronRight size={18} />
            </button>
            <button type="button" className="calendar-today-button" onClick={() => setSelectedDate(new Date())}>
              Today
            </button>
            <div className="calendar-view-switch" role="group" aria-label="Calendar view">
              <button type="button" className={view === "month" ? "active" : ""} aria-pressed={view === "month"} onClick={() => setView("month")}>
                Month
              </button>
              <button type="button" className={view === "week" ? "active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>
                Week
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="calendar-data-state" role="status">Loading calendar events…</p>
          ) : loadError ? (
            <p className="calendar-data-state error-state" role="alert">{loadError}</p>
          ) : view === "month" ? (
            <div className="month-calendar">
              <div className="month-grid month-weekdays">
                {weekDays.map((day) => <strong key={day}>{day}</strong>)}
              </div>
              <div className="month-grid month-days">
                {monthDates.map((date) => {
                  const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const dateEvents = getEventsForDate(date, calendarEvents);
                  return (
                    <div
                      key={date.toISOString()}
                      className={`month-day${isCurrentMonth ? "" : " outside-month"}${isSelected ? " selected" : ""}`}
                    >
                      <button
                        type="button"
                        className="month-date-select"
                        onClick={() => setSelectedDate(date)}
                        aria-label={formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        aria-pressed={isSelected}
                      >
                        {date.getDate()}
                      </button>
                      {dateEvents.map((event) => renderEvent(event, true))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="week-calendar">
              <div className="week-grid">
                <div className="week-time-gutter" aria-hidden="true" />
                {weekDates.map((date) => {
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      type="button"
                      className={`week-day-heading${isSelected ? " selected" : ""}`}
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(date)}
                      aria-pressed={isSelected}
                    >
                      <strong>{weekDays[(date.getDay() + 6) % 7]}</strong>
                      <span className="day-number">{date.getDate()}</span>
                    </button>
                  );
                })}
                {hours.map((hour) => (
                  <div className="week-hour-row" key={hour}>
                    <span className="week-time-label">{hour}</span>
                    {weekDates.map((date) => {
                      const hourEvents = getEventsForDate(date, calendarEvents)
                        .filter((event) => getEventHour(event) === hour);
                      return (
                        <div className="time-slot" key={date.toISOString()}>
                          {hourEvents.map((event) => renderEvent(event, true))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="card day-card">
          <h2>{formatDate(selectedDate, { month: "numeric", day: "numeric", year: "2-digit" })}</h2>
          {hours.map((hour) => {
            const hourEvents = selectedEvents.filter((event) => getEventHour(event) === hour);
            return (
              <div className="schedule-row" key={hour}>
                <span>{hour}</span>
                <div>{hourEvents.map((event) => renderEvent(event))}</div>
              </div>
            );
          })}
          {!isLoading && !loadError && selectedEvents.length === 0 && (
            <p className="calendar-empty-day">No events scheduled.</p>
          )}
          {loadError && <p className="calendar-empty-day error-state" role="alert">{loadError}</p>}
        </aside>
      </div>
      {selectedEvent && (
        <div
          className="calendar-event-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            className="calendar-event-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-modal-title"
          >
            <header className="calendar-event-modal-header">
              <div className="calendar-event-modal-title-wrap">
                <span className="calendar-event-modal-color" style={{ background: selectedEvent.color || "var(--primary)" }} />
                <div>
                  <div className="calendar-event-modal-badges">
                    <span className="calendar-event-modal-type">{selectedEvent.event_type || "Calendar event"}</span>
                    {eventStatus && <span className="calendar-event-status">{eventStatus}</span>}
                  </div>
                  <h2 id="calendar-event-modal-title">{getEventTitle(selectedEvent)}</h2>
                  {selectedEvent.session_group?.name && (
                    <p className="calendar-event-modal-subtitle">{selectedEvent.session_group.name}</p>
                  )}
                </div>
              </div>
              <button
                ref={closeModalButton}
                type="button"
                className="calendar-event-modal-close"
                onClick={() => setSelectedEvent(null)}
                aria-label="Close event details"
              >
                <X size={18} />
              </button>
            </header>
            <div className="calendar-event-when">
              <CalendarDays size={18} aria-hidden="true" />
              <div>
                <strong>{formatEventDate(selectedEvent.starts_at)}</strong>
                <span>
                  {formatTime(selectedEvent.starts_at)} – {new Date(selectedEvent.starts_at).toDateString() === new Date(selectedEvent.ends_at).toDateString()
                    ? formatTime(selectedEvent.ends_at)
                    : formatEventDateTime(selectedEvent.ends_at)}
                  {eventDuration && ` · ${eventDuration}`}
                </span>
              </div>
            </div>
            {canChangeEventColor && (
              <section className="calendar-event-color-editor" aria-labelledby="calendar-event-color-heading">
                <h3 id="calendar-event-color-heading"><Palette size={16} aria-hidden="true" /> Event color</h3>
                <p>Use a theme color, choose a basic color, or pick your own.</p>
                <div className="calendar-color-options">
                  {[...themeColorOptions, ...basicColorOptions].map((option) => (
                    <button
                      type="button"
                      key={option.label}
                      className={`calendar-color-option${colorDraft.toLowerCase() === option.color.toLowerCase() ? " selected" : ""}`}
                      onClick={() => {
                        setColorDraft(option.color);
                        setColorSaveError("");
                        setColorSaveMessage("");
                      }}
                      aria-label={`${option.label} event color`}
                      aria-pressed={colorDraft.toLowerCase() === option.color.toLowerCase()}
                      title={option.label}
                    >
                      <span style={{ backgroundColor: option.color }} />
                      <small>{option.label}</small>
                    </button>
                  ))}
                  <label className={`calendar-color-option calendar-custom-color-option${!([...themeColorOptions, ...basicColorOptions].some((option) => option.color.toLowerCase() === colorDraft.toLowerCase())) ? " selected" : ""}`}>
                    <span className="calendar-custom-color-swatch" style={{ backgroundColor: colorDraft }}>
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(colorDraft) ? colorDraft : "#172c50"}
                        onChange={(changeEvent) => {
                          setColorDraft(changeEvent.target.value);
                          setColorSaveError("");
                          setColorSaveMessage("");
                        }}
                        aria-label="Choose a custom event color"
                      />
                    </span>
                    <small>Custom</small>
                  </label>
                </div>
                <div className="calendar-color-actions">
                  {colorSaveError && <p className="calendar-color-message error-state" role="alert">{colorSaveError}</p>}
                  {colorSaveMessage && <p className="calendar-color-message success-state" role="status">{colorSaveMessage}</p>}
                  <button type="button" className="calendar-color-save" onClick={saveEventColor} disabled={isSavingColor || colorDraft.toLowerCase() === (selectedEvent.color || themeColorOptions[0].color).toLowerCase()}>
                    {isSavingColor ? "Saving…" : "Save color"}
                  </button>
                </div>
              </section>
            )}
            <div className="calendar-event-detail-grid">
              {selectedEvent.location && (
                <section className="calendar-event-detail-card">
                  <MapPin size={17} aria-hidden="true" />
                  <div>
                    <h3>Location</h3>
                    <p>{selectedEvent.location}</p>
                  </div>
                </section>
              )}
              {selectedEvent.organizer_name && (
                <section className="calendar-event-detail-card">
                  <UserRound size={17} aria-hidden="true" />
                  <div>
                    <h3>Organizer</h3>
                    <p>{selectedEvent.organizer_name}</p>
                  </div>
                </section>
              )}
              {selectedEvent.regarding_student_name && (
                <section className="calendar-event-detail-card">
                  <UsersRound size={17} aria-hidden="true" />
                  <div>
                    <h3>Regarding student</h3>
                    <p>{selectedEvent.regarding_student_name}</p>
                  </div>
                </section>
              )}
              {selectedEvent.session_group?.purpose && (
                <section className="calendar-event-detail-card">
                  <BookOpen size={17} aria-hidden="true" />
                  <div>
                    <h3>Group purpose</h3>
                    <p>{selectedEvent.session_group.purpose}</p>
                  </div>
                </section>
              )}
            </div>
            {selectedSessionDetails.length > 0 && (
              <section className="calendar-event-section">
                <h3><BookOpen size={16} aria-hidden="true" /> Session details</h3>
                <div className="calendar-session-list">
                  {selectedSessionDetails.map((detail, index) => (
                    <article className="calendar-session-item" key={`${detail.event_id}-${index}`}>
                      <div className="calendar-session-heading">
                        <strong>{detail.plan_type || "Intervention session"}</strong>
                        {detail.duration != null && (
                          <span><Clock3 size={13} aria-hidden="true" /> {detail.duration} min</span>
                        )}
                      </div>
                      {detail.focus && <p>{detail.focus}</p>}
                      {(detail.student_name || detail.created_by_name) && (
                        <small>
                          {[detail.student_name, detail.created_by_name && `Planned by ${detail.created_by_name}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
            {selectedEvent.participants?.length > 0 && (
              <section className="calendar-event-section">
                <h3><UsersRound size={16} aria-hidden="true" /> Participants <span>{selectedEvent.participants.length}</span></h3>
                <ul className="calendar-event-participant-list">
                  {selectedEvent.participants.map((participant) => (
                    <li key={`${participant.user_id || "student"}-${participant.student_id || "user"}`}>
                      <span className="calendar-participant-avatar" aria-hidden="true">
                        {participant.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <span className="calendar-participant-name">{participant.name}</span>
                      {participant.attendance && <small>{participant.attendance}</small>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(selectedEvent.recurrence || selectedEvent.recurrence_rule) && (
              <section className="calendar-event-section calendar-event-recurrence">
                <h3><Repeat2 size={16} aria-hidden="true" /> Repeats</h3>
                <p>
                  {selectedEvent.recurrence
                    ? `Every ${selectedEvent.recurrence.every_n_weeks || 1} week${selectedEvent.recurrence.every_n_weeks === 1 ? "" : "s"}`
                    : selectedEvent.recurrence_rule}
                  {selectedEvent.recurrence?.ends_on && ` · Through ${formatDate(new Date(`${selectedEvent.recurrence.ends_on}T00:00:00`), { month: "long", day: "numeric", year: "numeric" })}`}
                </p>
              </section>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default CalendarPage;
