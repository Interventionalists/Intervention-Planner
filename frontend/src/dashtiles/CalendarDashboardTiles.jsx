import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import { apiFetch } from "../api";
import { CardTitle } from "../components/PageElements";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const calendarHours = [
  "8 am",
  "9 am",
  "10 am",
  "11 am",
  "12 pm",
  "1 pm",
  "2 pm",
  "3 pm",
  "4 pm",
];
const minutesPerHour = 49;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function shiftDate(date, days) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function formatDate(date, options) {
  return date.toLocaleDateString("en-US", options);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time not specified"
    : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatLocalDateTimeForApi(value) {
  const date = new Date(value);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");
  const localValue = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-") + `T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${localValue}:00${sign}${hours}:${minutes}`;
}

function formatLocalInputValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function getInitialForm() {
  const startsAt = new Date();
  startsAt.setSeconds(0, 0);
  const minutesUntilNextHalfHour = (30 - (startsAt.getMinutes() % 30)) % 30;
  startsAt.setMinutes(startsAt.getMinutes() + minutesUntilNextHalfHour);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  return {
    title: "",
    startsAt: formatLocalInputValue(startsAt),
    endsAt: formatLocalInputValue(endsAt),
    location: "",
  };
}

function useCalendarEvents(start, end, refreshKey) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });

    async function loadEvents() {
      setIsLoading(true);
      setError("");
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/calendar-events?${params}`,
          { signal: controller.signal }
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            result?.detail || `Unable to load events (${response.status}).`
          );
        }
        if (!Array.isArray(result?.events)) {
          throw new Error("The calendar events response has an unexpected format.");
        }
        setEvents(result.events);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError.message || "Unable to load events.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadEvents();
    return () => controller.abort();
  }, [start.getTime(), end.getTime(), refreshKey]);

  return { events, isLoading, error };
}

function getEventsForDay(events, date) {
  const dayStart = startOfDay(date);
  const dayEnd = shiftDate(dayStart, 1);
  return events
    .filter((event) => {
      const startsAt = new Date(event.starts_at);
      const endsAt = new Date(event.ends_at);
      return startsAt < dayEnd && endsAt > dayStart;
    })
    .sort((first, second) => new Date(first.starts_at) - new Date(second.starts_at));
}

function getEventTitle(event) {
  return event.title || event.event_type || "Calendar event";
}

function getDayTimelineEvents(events, date) {
  const timelineStart = new Date(date);
  timelineStart.setHours(8, 0, 0, 0);
  const timelineEnd = new Date(timelineStart);
  timelineEnd.setHours(17, 0, 0, 0);
  const visibleEvents = events
    .map((event) => {
      const eventStart = new Date(event.starts_at);
      const eventEnd = new Date(event.ends_at);
      if (
        Number.isNaN(eventStart.getTime()) ||
        Number.isNaN(eventEnd.getTime()) ||
        eventEnd <= timelineStart ||
        eventStart >= timelineEnd ||
        eventEnd <= eventStart
      ) {
        return null;
      }

      const visibleStart = Math.max(eventStart.getTime(), timelineStart.getTime());
      const visibleEnd = Math.min(eventEnd.getTime(), timelineEnd.getTime());
      return {
        event,
        startOffset: (visibleStart - timelineStart.getTime()) / 60000,
        endOffset: (visibleEnd - timelineStart.getTime()) / 60000,
        lane: 0,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.startOffset - second.startOffset);

  const laneEnds = [];
  for (const item of visibleEvents) {
    let lane = laneEnds.findIndex((endOffset) => endOffset <= item.startOffset);
    if (lane < 0) lane = laneEnds.length;
    item.lane = lane;
    laneEnds[lane] = item.endOffset;
  }

  return visibleEvents.map((item) => ({
    ...item,
    laneCount: laneEnds.length,
    top: (item.startOffset / 60) * minutesPerHour,
    height: ((item.endOffset - item.startOffset) / 60) * minutesPerHour,
  }));
}

function EventLine({ event, showDate = false, showTime = true }) {
  return (
    <div className="dashboard-calendar-event">
      {showTime && (
        <time>
          {showDate && (
            <strong>
              {formatDate(new Date(event.starts_at), {
                month: "short",
                day: "numeric",
              })}
              {" · "}
            </strong>
          )}
          {formatTime(event.starts_at)}
        </time>
      )}
      <div className="dashboard-calendar-event-main">
        <strong>{getEventTitle(event)}</strong>
        {event.location && (
          <small>
            <MapPin size={12} aria-hidden="true" />
            {event.location}
          </small>
        )}
      </div>
    </div>
  );
}

function CalendarState({ isLoading, error, empty }) {
  if (isLoading) return <p className="dashboard-calendar-state">Loading events…</p>;
  if (error) return <p className="dashboard-calendar-state error-state" role="alert">{error}</p>;
  if (empty) return <p className="dashboard-calendar-state">No events scheduled.</p>;
  return null;
}

export function DashboardDayViewTile({ refreshKey }) {
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const start = startOfDay(date);
  const end = shiftDate(start, 1);
  const { events, isLoading, error } = useCalendarEvents(start, end, refreshKey);
  const dayEvents = getEventsForDay(events, date);
  const timelineEvents = getDayTimelineEvents(dayEvents, date);

  return (
    <section className="card dashboard-calendar-tile">
      <CardTitle
        title="Day view"
        action={
          <div className="dashboard-calendar-nav">
            <button type="button" onClick={() => setDate((current) => shiftDate(current, -1))} aria-label="Previous day">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setDate(startOfDay(new Date()))}>
              Today
            </button>
            <button type="button" onClick={() => setDate((current) => shiftDate(current, 1))} aria-label="Next day">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />
      <p className="dashboard-calendar-date">
        {formatDate(date, { weekday: "long", month: "long", day: "numeric" })}
      </p>
      {isLoading || error ? (
        <CalendarState isLoading={isLoading} error={error} empty={false} />
      ) : (
        <>
          {!dayEvents.length && (
            <p className="dashboard-calendar-state">No events scheduled.</p>
          )}
          <div className="dashboard-day-schedule">
            <div className="dashboard-day-schedule-hours" aria-hidden="true">
              {calendarHours.map((hour) => <span key={hour}>{hour}</span>)}
            </div>
            <div className="dashboard-day-schedule-timeline">
              {timelineEvents.map(({ event, top, height, lane, laneCount }) => (
                <article
                  aria-label={`${getEventTitle(event)}, ${formatTime(event.starts_at)} to ${formatTime(event.ends_at)}`}
                  className="dashboard-day-event-block"
                  key={event.public_id || event.id}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                    width: `calc(${100 / laneCount}% - 4px)`,
                    "--event-color": event.color || "var(--primary)",
                  }}
                  title={`${getEventTitle(event)} · ${formatTime(event.starts_at)}–${formatTime(event.ends_at)}`}
                >
                  <strong>{getEventTitle(event)}</strong>
                  {height >= 22 && (
                    <span>
                      {formatTime(event.starts_at)}–{formatTime(event.ends_at)}
                    </span>
                  )}
                  {height >= 42 && event.location && (
                    <small>{event.location}</small>
                  )}
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function DashboardWeekViewTile({ refreshKey }) {
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const start = useMemo(() => startOfWeek(date), [date]);
  const end = shiftDate(start, 7);
  const { events, isLoading, error } = useCalendarEvents(start, end, refreshKey);
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(start, index));

  return (
    <section className="card dashboard-calendar-tile">
      <CardTitle
        title="Week view"
        action={
          <div className="dashboard-calendar-nav">
            <button type="button" onClick={() => setDate((current) => shiftDate(current, -7))} aria-label="Previous week">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setDate(startOfDay(new Date()))}>
              This week
            </button>
            <button type="button" onClick={() => setDate((current) => shiftDate(current, 7))} aria-label="Next week">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />
      <p className="dashboard-calendar-date">
        {formatDate(start, { month: "short", day: "numeric" })}
        {" – "}
        {formatDate(shiftDate(end, -1), { month: "short", day: "numeric", year: "numeric" })}
      </p>
      <CalendarState isLoading={isLoading} error={error} empty={false} />
      {!isLoading && !error && (
        <div className="dashboard-week-list">
          {days.map((day) => {
            const dayEvents = getEventsForDay(events, day);
            return (
              <div className="dashboard-week-day" key={day.toISOString()}>
                <time dateTime={day.toISOString()}>
                  <strong>{formatDate(day, { weekday: "short" })}</strong>
                  <span>{formatDate(day, { month: "numeric", day: "numeric" })}</span>
                </time>
                <div>
                  {dayEvents.length ? (
                    dayEvents.map((event) => (
                      <EventLine event={event} key={event.public_id || event.id} />
                    ))
                  ) : (
                    <span className="dashboard-week-empty">No events</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function UpcomingEventsTile({ refreshKey }) {
  const start = startOfDay(new Date());
  const end = shiftDate(start, 30);
  const { events, isLoading, error } = useCalendarEvents(start, end, refreshKey);
  const upcoming = events
    .filter((event) => new Date(event.starts_at).getTime() >= Date.now())
    .sort((first, second) => new Date(first.starts_at) - new Date(second.starts_at))
    .slice(0, 8);

  return (
    <section className="card dashboard-calendar-tile">
      <CardTitle title="Upcoming events" />
      <p className="dashboard-calendar-date">Next 30 days</p>
      <CalendarState isLoading={isLoading} error={error} empty={!upcoming.length} />
      {!isLoading && !error && upcoming.length > 0 && (
        <div className="dashboard-calendar-event-list">
          {upcoming.map((event) => (
            <EventLine event={event} key={event.public_id || event.id} showDate />
          ))}
        </div>
      )}
    </section>
  );
}

export function QuickNewEventTile({ user, onEventCreated }) {
  const [form, setForm] = useState(getInitialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  }

  async function createEvent(submitEvent) {
    submitEvent.preventDefault();
    setError("");
    setSuccess("");

    if (!form.title.trim()) {
      setError("Enter an event name.");
      return;
    }

    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      setError("Choose an end time after the start time.");
      return;
    }

    const schoolId = user?.school_id ?? user?.school;
    if (!schoolId) {
      setError("The signed-in user does not have a school assigned.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/calendar-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: Number(schoolId),
          title: form.title.trim(),
          event_type: "meeting",
          starts_at: formatLocalDateTimeForApi(form.startsAt),
          ends_at: formatLocalDateTimeForApi(form.endsAt),
          location: form.location.trim() || null,
          color:
            getComputedStyle(document.querySelector(".app") || document.body)
              .getPropertyValue("--primary")
              .trim() || "#172c50",
          participants: [],
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.detail || `Unable to create the event (${response.status}).`
        );
      }
      setForm((current) => ({ ...current, title: "", location: "" }));
      setSuccess("Event added to your calendar.");
      onEventCreated();
    } catch (saveError) {
      setError(saveError.message || "Unable to create the event.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card dashboard-calendar-tile">
      <CardTitle
        title="Quick new event"
        action={<CalendarDays size={18} aria-hidden="true" />}
      />
      <form className="quick-event-form" onSubmit={createEvent}>
        <label>
          Event name
          <input
            required
            value={form.title}
            onChange={(event) => updateForm("title", event.target.value)}
            placeholder="e.g. Progress check-in"
          />
        </label>
        <div className="quick-event-times">
          <label>
            Starts
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => {
                const nextStart = event.target.value;
                const parsedStart = new Date(nextStart);
                const parsedEnd = new Date(form.endsAt);
                setForm((current) => ({
                  ...current,
                  startsAt: nextStart,
                  endsAt:
                    !Number.isNaN(parsedStart.getTime()) &&
                    parsedEnd <= parsedStart
                      ? formatLocalInputValue(
                          new Date(parsedStart.getTime() + 30 * 60 * 1000)
                        )
                      : current.endsAt,
                }));
                setError("");
                setSuccess("");
              }}
            />
          </label>
          <label>
            Ends
            <input
              required
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => updateForm("endsAt", event.target.value)}
            />
          </label>
        </div>
        <label>
          Location <span>(optional)</span>
          <input
            value={form.location}
            onChange={(event) => updateForm("location", event.target.value)}
            placeholder="Room or meeting link"
          />
        </label>
        {error && <p className="quick-event-feedback error-state" role="alert">{error}</p>}
        {success && <p className="quick-event-feedback" role="status">{success}</p>}
        <button className="quick-event-submit" disabled={isSaving} type="submit">
          <Plus size={15} aria-hidden="true" />
          {isSaving ? "Adding event…" : "Add event"}
        </button>
      </form>
    </section>
  );
}
