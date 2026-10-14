import { ChevronLeft, ChevronRight } from "lucide-react";
import { events } from "../data";
import { PageHeading } from "../components/PageElements";

const hours = ["8 am", "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function CalendarPage() {
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
            {days.map((day, index) => (
              <div className="day-column" key={day}>
                <strong>{day}</strong>
                <span className="day-number">{21 + index}</span>
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
            const event = events.find((candidate) => candidate.time.startsWith(hour));
            return (
              <div className="schedule-row" key={hour}>
                <span>{hour}</span>
                <div>
                  {event && (
                    <span className="calendar-event" style={{ borderColor: event.color }}>
                      {event.title}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default CalendarPage;
