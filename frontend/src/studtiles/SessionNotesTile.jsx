import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

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

export default function SessionNotesTile({ studentId, userId, sessions = [] }) {
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!sessions.length) {
      setSelectedSessionId("");
      setNotes([]);
      return;
    }

    setSelectedSessionId((currentValue) => {
      if (currentValue && sessions.some((session) => String(session.id) === String(currentValue))) {
        return currentValue;
      }
      return String(sessions[0].id);
    });
  }, [sessions]);

  const selectedSession = useMemo(
    () => sessions.find((session) => String(session.id) === String(selectedSessionId)) || null,
    [selectedSessionId, sessions]
  );

  useEffect(() => {
    if (!selectedSessionId || !userId) {
      setNotes([]);
      return;
    }

    const loadNotes = async () => {
      setNotesLoading(true);
      setNoteError("");

      try {
        const params = new URLSearchParams({
          user_id: userId,
          session_id: String(selectedSessionId),
        });
        const response = await apiFetch(
          `${API_BASE_URL}/notes-fetchForSession?${params}`
        );

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.detail || "Unable to load session notes.");
        }

        const result = await response.json();
        setNotes(Array.isArray(result.notes) ? result.notes : []);
      } catch (error) {
        setNoteError(
          error instanceof TypeError
            ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
            : error.message || "Unable to load session notes."
        );
        setNotes([]);
      } finally {
        setNotesLoading(false);
      }
    };

    loadNotes();
  }, [selectedSessionId, userId]);

  const saveNote = async (event) => {
    event.preventDefault();
    const trimmedText = noteText.trim();

    if (!selectedSessionId || !trimmedText || !userId) {
      setNoteError("Choose a session and add note text before saving.");
      return;
    }

    setIsSaving(true);
    setNoteError("");

    try {
      const response = await apiFetch(`${API_BASE_URL}/notes-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          session_id: Number(selectedSessionId),
          created_by: userId,
          text: trimmedText,
          is_private: false,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Unable to save this session note.");
      }

      setNoteText("");
      setNotes((currentNotes) => [
        ...(result.note ? [result.note] : []),
        ...currentNotes,
      ]);
    } catch (error) {
      setNoteError(
        error instanceof TypeError
          ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
          : error.message || "Unable to save this session note."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card session-notes-card" aria-label="Session notes">
      <header className="session-planner-header">
        <div>
          <div className="session-planner-title-row">
            <h2>Session notes</h2>
          </div>
          <p>Track observations for a specific intervention session.</p>
        </div>
      </header>

      <form onSubmit={saveNote}>
        <label className="session-field">
          <span>Session</span>
          <select
            disabled={!sessions.length}
            onChange={(event) => setSelectedSessionId(event.target.value)}
            value={selectedSessionId}
          >
            {sessions.length ? (
              sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.planTitle} — {formatSessionDate(session.scheduledAt)}
                </option>
              ))
            ) : (
              <option value="">No sessions available</option>
            )}
          </select>
        </label>

        <label className="session-field">
          <span>Note</span>
          <textarea
            disabled={!selectedSessionId || !userId}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder={
              selectedSession
                ? `Add a note for ${selectedSession.planTitle}...`
                : "Select a session first..."
            }
            rows={4}
            value={noteText}
          />
        </label>

        {noteError && <p className="error-state" role="alert">{noteError}</p>}

        <button className="session-primary-button" disabled={isSaving || !selectedSessionId || !userId} type="submit">
          {isSaving ? "Saving..." : "Add note"}
        </button>
      </form>

      <div className="session-note-list">
        <h3>Saved notes</h3>
        {notesLoading ? (
          <p className="muted">Loading notes...</p>
        ) : notes.length ? (
          notes.map((note) => (
            <article className="note-entry" key={note.id}>
              <div className="note-entry-header">
                <time>
                  {note.date ? new Date(note.date).toLocaleDateString() : "Unknown date"}
                </time>
              </div>
              <p>{note.text || ""}</p>
            </article>
          ))
        ) : (
          <p className="muted">
            {selectedSessionId ? "No notes for this session yet." : "Choose a session to view notes."}
          </p>
        )}
      </div>
    </section>
  );
}
