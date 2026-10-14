import { events } from "../data";
import { CardTitle } from "../components/PageElements";

function DailyCalendarTile() {
  return (
    <div className="card">
      <CardTitle title="Daily calendar" />
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
  );
}

export default DailyCalendarTile;
