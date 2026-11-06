import { useEffect, useState } from "react";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

export function toSessionView(session) {
  return {
    id: session.id,
    planTitle: session.plan_type,
    focus: session.focus,
    duration: session.duration_minutes,
    scheduledAt: session.scheduled_at,
    status: session.status,
  };
}

export function useStudentSessions(studentId) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSessions() {
      setSessions([]);
      setError("");
      setIsLoading(true);

      try {
        if (studentId == null) {
          throw new Error("This student does not have a database ID.");
        }
        const response = await apiFetch(
          `${API_BASE_URL}/sessions-fetchForStudent/${encodeURIComponent(studentId)}`,
          { signal: controller.signal }
        );
        const result = await response.json();
        if (!response.ok) {
          const detail = typeof result.detail === "string" && result.detail
            ? `: ${result.detail}`
            : "";
          throw new Error(`Sessions request failed (${response.status})${detail}.`);
        }
        if (!Array.isArray(result.sessions)) {
          throw new Error("The sessions response has an unexpected format.");
        }
        setSessions(result.sessions.map(toSessionView));
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setError(requestError instanceof TypeError
            ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
            : requestError.message || "Could not load this student's sessions.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadSessions();
    return () => controller.abort();
  }, [studentId]);

  return { sessions, setSessions, isLoading, error };
}
