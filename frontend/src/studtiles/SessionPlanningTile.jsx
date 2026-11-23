import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { toSessionView } from "../hooks/useStudentSessions";
import { sessionDurations, starterPlans } from "./sessionPlanningData";
import {
  CalendarClock,
  Check,
  ClipboardList,
  Plus,
  X,
} from "lucide-react";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

function formatSessionDate(value) {
  if (!value) return "Time not set";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLocalDateTimeForApi(value) {
  const date = new Date(value);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");
  return `${value}:00${sign}${hours}:${minutes}`;
}

async function getResponseResult(response, action) {
  const result = await response.json();
  if (!response.ok) {
    const detail = typeof result.detail === "string" && result.detail
      ? `: ${result.detail}`
      : "";
    throw new Error(`${action} failed (${response.status})${detail}.`);
  }
  return result;
}

export default function SessionPlanningTile({
  studentId,
  studentName,
  sessions,
  setSessions,
  sessionsError = "",
  canManage = true,
  userId,
}) {
  const [selectedPlanId, setSelectedPlanId] = useState(starterPlans[0].id);
  const [selectedDuration, setSelectedDuration] = useState(starterPlans[0].duration);
  const [sessionDescription, setSessionDescription] = useState(starterPlans[0].focus);
  const [scheduledAt, setScheduledAt] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [view, setView] = useState("upcoming");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (sessionsError) setMessage(sessionsError);
  }, [sessionsError]);

  const visibleSessions = useMemo(() => {
    const filtered = sessions.filter((session) =>
      view === "upcoming"
        ? session.status === "planned"
        : session.status !== "planned"
    );

    return filtered.sort((first, second) => {
      const firstDate = first.scheduledAt
        ? new Date(first.scheduledAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const secondDate = second.scheduledAt
        ? new Date(second.scheduledAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      return view === "upcoming" ? firstDate - secondDate : secondDate - firstDate;
    });
  }, [sessions, view]);

  const addSession = async (event) => {
    event.preventDefault();
    const plan = starterPlans.find((candidate) => candidate.id === selectedPlanId);
    if (!plan) return;

    setMessage("");
    try {
      const response = await apiFetch(`${API_BASE_URL}/sessions-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          plan_type: plan.title,
          focus: sessionDescription,
          duration_minutes: selectedDuration,
          scheduled_at: scheduledAt ? formatLocalDateTimeForApi(scheduledAt) : null,
          recurrence: repeatWeekly ? {
            weekdays: [(new Date(`${scheduledAt.slice(0, 10)}T12:00:00`).getDay() + 6) % 7],
            every_n_weeks: 1,
            ends_on: null,
          } : null,
        }),
      });
      const result = await getResponseResult(response, "Create session");
      if (!result.session) {
        throw new Error("The session response has an unexpected format.");
      }
      setSessions((currentSessions) => [
        toSessionView(result.session),
        ...currentSessions,
      ]);
      setScheduledAt("");
      setRepeatWeekly(false);
      setMessage(repeatWeekly
        ? `Weekly session planned for ${studentName}.`
        : `Session planned for ${studentName}.`);
      setView("upcoming");
    } catch (error) {
      setMessage(error instanceof TypeError
        ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
        : error.message || "Could not save this session.");
    }
  };

  const updateSessionStatus = async (sessionId, status) => {
    setMessage("");
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/sessions-updateStatus/${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const result = await getResponseResult(response, "Update session");
      if (!result.session) {
        throw new Error("The session response has an unexpected format.");
      }
      setSessions((currentSessions) =>
        currentSessions.map((session) =>
          session.id === sessionId
            ? toSessionView({ ...result.session, recurrence: session.recurrence })
            : session
        )
      );
      setMessage(status === "completed" ? "Session marked complete." : "Session cancelled.");
    } catch (error) {
      setMessage(error instanceof TypeError
        ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
        : error.message || "Could not update this session.");
    }
  };

  return (
    <section aria-label={`Session planning for ${studentName}`} className="card session-planner">
      <header className="session-planner-header">
        <div>
          <div className="session-planner-title-row">
            <ClipboardList aria-hidden="true" size={20} />
            <h2>Session planning</h2>
          </div>
          <p>Session for {studentName}.</p>
        </div>
      </header>

      {canManage && (
        <form className="session-create-form" onSubmit={addSession}>
          <label className="session-field session-plan-field">
            <span>Session plan type</span>
            <select
              onChange={(event) => {
                const plan = starterPlans.find((candidate) => candidate.id === event.target.value);
                setSelectedPlanId(event.target.value);
                if (plan) {
                  setSelectedDuration(plan.duration);
                  setSessionDescription(plan.focus);
                }
              }}
              value={selectedPlanId}
            >
              {starterPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>
          <label className="session-field">
            <span>Description (optional)</span>
            <textarea
              maxLength={300}
              onChange={(event) => setSessionDescription(event.target.value)}
              rows={3}
              value={sessionDescription}
            />
          </label>
          <label className="session-field session-duration-field">
            <span>Duration</span>
            <select
              onChange={(event) => setSelectedDuration(Number(event.target.value))}
              value={selectedDuration}
            >
              {sessionDurations.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="session-field session-date-field">
            <span>Start Date and Time</span>
            <input
              onChange={(event) => setScheduledAt(event.target.value)}
              required
              type="datetime-local"
              value={scheduledAt}
            />
          </label>
          <label className="session-recurrence-toggle">
            <input
              checked={repeatWeekly}
              onChange={(event) => setRepeatWeekly(event.target.checked)}
              type="checkbox"
            />
            <span>Repeat weekly until cancelled</span>
          </label>
          <button className="session-primary-button" type="submit">
            <Plus aria-hidden="true" size={17} />
            Plan session
          </button>
        </form>
      )}

      <div className="session-list-heading">
        <div aria-label="Session list" className="session-view-switch" role="group">
          <button
            aria-pressed={view === "upcoming"}
            className={view === "upcoming" ? "active" : ""}
            onClick={() => setView("upcoming")}
            type="button"
          >
            Upcoming <span>{sessions.filter((session) => session.status === "planned").length}</span>
          </button>
          <button
            aria-pressed={view === "history"}
            className={view === "history" ? "active" : ""}
            onClick={() => setView("history")}
            type="button"
          >
            History <span>{sessions.filter((session) => session.status !== "planned").length}</span>
          </button>
        </div>
        <span className="session-list-context">{visibleSessions.length} sessions</span>
      </div>

      {message && <p className="session-feedback" role="status">{message}</p>}

      {visibleSessions.length ? (
        <ul className="session-list">
          {visibleSessions.map((session) => (
            <li className="session-list-item" key={session.id}>
              <div className="session-date-mark" aria-hidden="true">
                <CalendarClock size={19} />
              </div>
              <div className="session-item-main">
                <div className="session-item-title-row">
                  <h3>{session.planTitle}</h3>
                  <span className={`session-status status-${session.status}`}>
                    {session.status}
                  </span>
                </div>
                {session.focus && <p>{session.focus}</p>}
                {session.recurrence && (
                  <p className="session-recurring-label">Repeats weekly until cancelled</p>
                )}
                <div className="session-item-meta">
                  <span>{formatSessionDate(session.scheduledAt)}</span>
                  <span>{session.duration} min</span>
                </div>
              </div>
              {canManage && session.status === "planned" && (
                <div className="session-item-actions">
                  {!session.recurrence && (
                    <button
                      aria-label={`Mark ${session.planTitle} complete`}
                      className="session-icon-button"
                      onClick={() => updateSessionStatus(session.id, "completed")}
                      title="Mark complete"
                      type="button"
                    >
                      <Check size={18} />
                    </button>
                  )}
                  <button
                    aria-label={session.recurrence
                      ? `End recurring ${session.planTitle}`
                      : `Cancel ${session.planTitle}`}
                    className="session-icon-button session-cancel-button"
                    onClick={() => updateSessionStatus(session.id, "cancelled")}
                    title={session.recurrence ? "End recurring series" : "Cancel session"}
                    type="button"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="session-empty-state">
          <CalendarClock aria-hidden="true" size={25} />
          <h3>{view === "upcoming" ? "No sessions planned" : "No session history yet"}</h3>
          <p>
            {view === "upcoming"
              ? canManage
                ? "Choose a plan above to add the first session."
                : "Planned sessions for this student will appear here."
              : "Completed and cancelled sessions will appear here."}
          </p>
        </div>
      )}
    </section>
  );
}