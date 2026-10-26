import { CardTitle } from "../components/PageElements";

const hours = Array.from({ length: 10 }, (_, index) => index + 8);

function formatHour(hour) {
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${hour < 12 ? "am" : "pm"}`;
}

function getHour(time) {
  const match = time.match(/^(\d{1,2})(?::\d{2})?\s*(AM|PM)$/i);
  if (!match) return null;
  const hour = Number(match[1]) % 12;
  return hour + (match[2].toUpperCase() === "PM" ? 12 : 0);
}

function getDateLabel(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function shiftDate(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function DailyCalendarTile({
  meetings = [],
  date,
  onDateChange,
  onRemoveMeeting,
}) {
  return (
    <section className="card" style={{ alignSelf: "start" }}>
      <CardTitle
        title="Daily Calendar"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => onDateChange(shiftDate(date, -1))}
              aria-label="Previous day"
              style={dateButtonStyle}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onDateChange(shiftDate(date, 1))}
              aria-label="Next day"
              style={dateButtonStyle}
            >
              ›
            </button>
          </div>
        }
      />
      <h3
        style={{
          margin: "-8px 0 12px",
          color: "#333",
          fontSize: 15,
          fontWeight: 400,
          textTransform: "lowercase",
        }}
      >
        {getDateLabel(date)}
      </h3>
      <div>
        {hours.map((hour) => {
          const hourMeetings = meetings.filter(
            (meeting) => getHour(meeting.time) === hour
          );
          return (
            <div
              key={hour}
              style={{
                display: "grid",
                gridTemplateColumns: "36px minmax(0, 1fr)",
                minHeight: 42,
                borderTop: "1px solid #edf0f4",
              }}
            >
              <span
                style={{
                  paddingTop: 5,
                  color: "#9aa1aa",
                  fontSize: 10,
                }}
              >
                {formatHour(hour)}
              </span>
              <div style={{ display: "grid", alignContent: "start", gap: 3, padding: "3px 0" }}>
                {hourMeetings.map((meeting) => (
                  <div
                    key={`${meeting.id}-${meeting.date}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      minWidth: 0,
                      padding: "4px 7px",
                      borderLeft: `3px solid ${meeting.color}`,
                      borderRadius: 4,
                      background: "#f6f8fb",
                      color: "#344054",
                      fontSize: 11,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {meeting.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveMeeting(meeting.id, meeting.date)}
                      aria-label={`Remove ${meeting.title} from calendar`}
                      title="Remove from calendar"
                      style={{
                        flex: "0 0 auto",
                        padding: 0,
                        border: 0,
                        background: "transparent",
                        color: "#758095",
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const dateButtonStyle = {
  width: 24,
  height: 24,
  padding: 0,
  border: "1px solid #e2e5e9",
  borderRadius: 5,
  background: "#fff",
  color: "#667085",
  fontSize: 17,
  lineHeight: 1,
  cursor: "pointer",
};
