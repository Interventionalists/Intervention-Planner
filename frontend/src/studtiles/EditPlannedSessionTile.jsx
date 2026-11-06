import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { toSessionView } from "../hooks/useStudentSessions";
import { sessionDurations, starterPlans } from "./sessionPlanningData";
import { CalendarClock, Pencil, Save, X } from "lucide-react";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

async function getResponseResult(response) {
  const result = await response.json();
  if (!response.ok) {
    const detail = typeof result.detail === "string" && result.detail
      ? `: ${result.detail}`
      : "";
    throw new Error(`Session update failed (${response.status})${detail}.`);
  }
  return result;
}

export default function EditPlannedSessionTile({
  studentName,
  sessions,
  setSessions,
  isLoading,
  sessionsError = "",
}) {
  const plannedSessions = useMemo(
    () => sessions
      .filter((session) => session.status === "planned")
      .sort((first, second) => new Date(first.scheduledAt) - new Date(second.scheduledAt)),
    [sessions]
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [focus, setFocus] = useState("");
  const [duration, setDuration] = useState(25);
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedSession = plannedSessions.find(
    (session) => String(session.id) === selectedSessionId
  );

  useEffect(() => {
    if (
      selectedSessionId &&
      !plannedSessions.some((session) => String(session.id) === selectedSessionId)
    ) {
      setSelectedSessionId("");
    }
  }, [plannedSessions, selectedSessionId]);

  useEffect(() => {
    if (!selectedSession) return;
    setPlanTitle(selectedSession.planTitle);
    setFocus(selectedSession.focus || "");
    setDuration(selectedSession.duration);
    setScheduledAt(toLocalDateTimeInput(selectedSession.scheduledAt));
    setMessage("");
  }, [selectedSession]);

  const selectPlan = (nextTitle) => {
    const plan = starterPlans.find((candidate) => candidate.title === nextTitle);
    setPlanTitle(nextTitle);
    if (plan) setFocus(plan.focus);
  };

  const resetForm = () => {
    if (!selectedSession) return;
    setPlanTitle(selectedSession.planTitle);
    setFocus(selectedSession.focus || "");
    setDuration(selectedSession.duration);
    setScheduledAt(toLocalDateTimeInput(selectedSession.scheduledAt));
    setMessage("");
  };

  const saveChanges = async (event) => {
    event.preventDefault();
    if (!selectedSession) return;

    setIsSaving(true);
    setMessage("");
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/sessions-update/${encodeURIComponent(selectedSession.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_type: planTitle,
            focus,
            duration_minutes: duration,
            scheduled_at: new Date(scheduledAt).toISOString(),
          }),
        }
      );
      const result = await getResponseResult(response);
      if (!result.session) {
        throw new Error("The session response has an unexpected format.");
      }
      const updatedSession = toSessionView(result.session);
      setSessions((currentSessions) => currentSessions.map((session) =>
        session.id === updatedSession.id ? updatedSession : session
      ));
      setMessage(`Session updated for ${studentName}.`);
    } catch (error) {
      setMessage(error instanceof TypeError
        ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
        : error.message || "Could not update this session.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section aria-label={`Edit planned sessions for ${studentName}`} className="card session-planner">
      <header className="session-planner-header">
        <div>
          <div className="session-planner-title-row">
            <Pencil aria-hidden="true" size={19} />
            <h2>Edit planned session</h2>
          </div>
          <p>Update an upcoming session for {studentName}.</p>
        </div>
      </header>

      {isLoading ? (
        <p className="session-feedback" role="status">Loading sessions...</p>
      ) : sessionsError ? (
        <p className="session-feedback" role="alert">{sessionsError}</p>
      ) : plannedSessions.length ? (
        <>
          <form className="session-create-form" onSubmit={saveChanges}>
            <label className="session-field">
              <span>Planned session</span>
              <select
                onChange={(event) => setSelectedSessionId(event.target.value)}
                value={selectedSessionId}
              >
                <option value="">Select a planned session</option>
                {plannedSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.planTitle} · {new Date(session.scheduledAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {selectedSession && (
              <>
            <label className="session-field">
              <span>Session plan type</span>
              <select onChange={(event) => selectPlan(event.target.value)} value={planTitle}>
                {!starterPlans.some((plan) => plan.title === planTitle) && (
                  <option value={planTitle}>{planTitle}</option>
                )}
                {starterPlans.map((plan) => (
                  <option key={plan.id} value={plan.title}>{plan.title}</option>
                ))}
              </select>
            </label>
            <label className="session-field">
              <span>Description (optional)</span>
              <textarea
                maxLength={300}
                onChange={(event) => setFocus(event.target.value)}
                rows={3}
                value={focus}
              />
            </label>
            <label className="session-field">
              <span>Duration</span>
              <select
                onChange={(event) => setDuration(Number(event.target.value))}
                value={duration}
              >
                {sessionDurations.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} minutes</option>
                ))}
              </select>
            </label>
            <label className="session-field">
              <span>Start Date and Time</span>
              <input
                onChange={(event) => setScheduledAt(event.target.value)}
                required
                type="datetime-local"
                value={scheduledAt}
              />
            </label>
            <div className="session-inline-actions">
              <button className="session-primary-button" disabled={isSaving} type="submit">
                <Save aria-hidden="true" size={16} />
                {isSaving ? "Saving..." : "Save changes"}
              </button>
              <button
                aria-label="Discard session changes"
                className="session-icon-button"
                disabled={isSaving}
                onClick={resetForm}
                title="Discard changes"
                type="button"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>
              </>
            )}
          </form>
          {message && <p className="session-feedback" role="status">{message}</p>}
        </>
      ) : (
        <div className="session-empty-state">
          <CalendarClock aria-hidden="true" size={25} />
          <h3>No planned sessions to edit</h3>
          <p>Newly planned sessions for this student will appear here.</p>
        </div>
      )}
    </section>
  );
}
