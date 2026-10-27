
import { events } from "../data";
import { CardTitle } from "../components/PageElements";

function PersonalMeetingsTile({ onAddToCalendar, calendarMeetingIds = [] }) {
  return (
    <div className="card">
      <CardTitle title="Personal Meetings" />
      <div className="event-list">
        {events.map((event) => (
          <div
            className="event"
            key={event.id}
            style={{ justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="event-dot" style={{ background: event.color }} />
              <div>
                <strong>{event.title}</strong>
                <small>{event.time}</small>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onAddToCalendar(event)}
              disabled={calendarMeetingIds.includes(event.id)}
              style={{
                padding: "5px 8px",
                border: "1px solid #dfe3e8",
                borderRadius: 5,
                background: calendarMeetingIds.includes(event.id)
                  ? "#f2f4f7"
                  : "#fff",
                color: calendarMeetingIds.includes(event.id)
                  ? "#667085"
                  : "var(--primary)",
                fontSize: 10,
                cursor: calendarMeetingIds.includes(event.id)
                  ? "default"
                  : "pointer",
              }}
            >
              {calendarMeetingIds.includes(event.id) ? "Added" : "Add to calendar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PersonalMeetingsTile;
