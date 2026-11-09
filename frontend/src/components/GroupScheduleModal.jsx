import { useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "../api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function toLocalDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function getScheduleDefaults() {
  const startsAt = new Date();
  // A next-day default avoids creating an event that has already started.
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setMinutes(endsAt.getMinutes() + 30);

  return {
    date: toLocalDateInput(startsAt),
    startsAt: startsAt.toTimeString().slice(0, 5),
    endsAt: endsAt.toTimeString().slice(0, 5),
  };
}

function GroupScheduleModal({ group, onClose, onScheduled }) {
  const [defaults] = useState(getScheduleDefaults);
  const [title, setTitle] = useState(group.name);
  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startsAt);
  const [endTime, setEndTime] = useState(defaults.endsAt);
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  const scheduleEvent = async (event) => {
    event.preventDefault();
    const startsAt = new Date(`${date}T${startTime}`);
    const endsAt = new Date(`${date}T${endTime}`);
    if (endsAt <= startsAt) {
      setError("The end time must be after the start time.");
      return;
    }

    setError("");
    setIsScheduling(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/calendar-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: group.school,
          event_type: "Group session",
          title: title.trim(),
          // Convert the user's local date/time into an explicit UTC instant so
          // the server does not mistake local clock time for UTC.
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          location: location.trim() || null,
          // Reuse calendar events so group sessions appear in the existing calendar.
          session_group_id: group.id,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || "Unable to schedule group event.");
      }
      if (!result?.event) {
        throw new Error("The schedule event response has an unexpected format.");
      }
      onScheduled(
        `${title.trim()} scheduled for ${startsAt.toLocaleString()}.`
      );
    } catch (scheduleError) {
      setError(scheduleError.message || "Unable to schedule group event.");
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div
      className="calendar-event-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isScheduling) {
          onClose();
        }
      }}
    >
      <section
        className="calendar-event-modal group-schedule-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-schedule-title"
      >
        <header className="calendar-event-modal-header">
          <div>
            <h2 id="group-schedule-title">Schedule {group.name}</h2>
            <p className="calendar-event-modal-subtitle">
              Add a group session to the school calendar.
            </p>
          </div>
          <button
            type="button"
            className="calendar-event-modal-close"
            onClick={onClose}
            disabled={isScheduling}
            aria-label="Close schedule form"
          >
            <X size={18} />
          </button>
        </header>
        <form className="group-schedule-form" onSubmit={scheduleEvent}>
          <label>
            Event title
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Date
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <div className="group-schedule-time-fields">
            <label>
              Starts
              <input
                type="time"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label>
              Ends
              <input
                type="time"
                required
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </label>
          </div>
          <label>
            Location (optional)
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Room 12"
            />
          </label>
          {error && <p className="assignment-error" role="alert">{error}</p>}
          <div className="group-edit-actions">
            <button className="primary-button" type="submit" disabled={isScheduling}>
              {isScheduling ? "Scheduling..." : "Schedule event"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={onClose}
              disabled={isScheduling}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default GroupScheduleModal;
