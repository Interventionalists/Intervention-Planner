import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
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
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);

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
  const orderedNotes = useMemo(
    () => [...notes].sort((first, second) => {
      const firstDate = first.date ? new Date(first.date).getTime() : 0;
      const secondDate = second.date ? new Date(second.date).getTime() : 0;
      return secondDate - firstDate;
    }),
    [notes]
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

  const saveEditedNote = async (event) => {
    event.preventDefault();
    const trimmedText = editingText.trim();
    if (!trimmedText || !editingNoteId) return;

    setIsUpdatingNote(true);
    setNoteError("");
    const params = new URLSearchParams({
      note_id: String(editingNoteId),
      new_text: trimmedText,
    });
    try {
      const response = await apiFetch(`${API_BASE_URL}/notes-editText?${params}`, {
        method: "PUT",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || "Unable to update this note.");
      }
      setNotes((currentNotes) => currentNotes.map((note) =>
        String(note.id) === String(editingNoteId)
          ? { ...note, text: trimmedText }
          : note
      ));
      setEditingNoteId(null);
      setEditingText("");
    } catch (error) {
      setNoteError(error instanceof TypeError
        ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
        : error.message || "Unable to update this note.");
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const deleteNote = async (note) => {
    const noteDate = note.date ? new Date(note.date).toLocaleDateString() : "this note";
    if (!window.confirm(`Delete the note from ${noteDate}? This cannot be undone.`)) return;

    setDeletingNoteId(note.id);
    setNoteError("");
    const params = new URLSearchParams({ note_id: String(note.id), user_id: userId });
    try {
      const response = await apiFetch(`${API_BASE_URL}/notes-delete?${params}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || "Unable to delete this note.");
      }
      setNotes((currentNotes) => currentNotes.filter(
        (currentNote) => String(currentNote.id) !== String(note.id)
      ));
      if (String(editingNoteId) === String(note.id)) {
        setEditingNoteId(null);
        setEditingText("");
      }
    } catch (error) {
      setNoteError(error instanceof TypeError
        ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
        : error.message || "Unable to delete this note.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  return (
    <section className="card session-notes-card" aria-label="Session notes">
      <header className="session-planner-header session-notes-header">
        <div>
          <div className="session-planner-title-row">
            <h2>Session notes</h2>
          </div>
          <p>Notes are shared with the student’s support team.</p>
        </div>
      </header>

      <label className="session-field session-notes-session-picker">
        <span>Session</span>
        <select
          disabled={!sessions.length}
          onChange={(event) => {
            setSelectedSessionId(event.target.value);
            setEditingNoteId(null);
            setEditingText("");
            setNoteError("");
          }}
          value={selectedSessionId}
        >
          {sessions.length ? sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.planTitle} — {formatSessionDate(session.scheduledAt)}
            </option>
          )) : <option value="">No sessions available</option>}
        </select>
      </label>

      {selectedSession && (
        <div className="session-notes-context">
          <div>
            <h3>{selectedSession.planTitle}</h3>
            <p>{formatSessionDate(selectedSession.scheduledAt)} · {selectedSession.duration} min</p>
          </div>
          <span className={`session-status status-${selectedSession.status}`}>
            {selectedSession.status}
          </span>
        </div>
      )}

      {noteError && <p className="session-notes-error" role="alert">{noteError}</p>}

      {selectedSession ? (
        <div className="session-notes-layout">
          <form className="session-notes-composer" onSubmit={saveNote}>
            <label className="session-field" htmlFor="session-note-draft">
              <span>New note</span>
              <textarea
                id="session-note-draft"
                disabled={!userId}
                maxLength={2000}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder={`Add an observation for ${selectedSession.planTitle}...`}
                rows={5}
                value={noteText}
              />
            </label>
            <div className="session-notes-compose-footer">
              <small>Shared with the student’s support team</small>
              <button
                className="session-primary-button"
                disabled={isSaving || !noteText.trim() || !userId}
                type="submit"
              >
                <Plus aria-hidden="true" size={16} />
                {isSaving ? "Saving…" : "Add note"}
              </button>
            </div>
          </form>

          <section aria-labelledby="session-notes-history-title" className="session-note-list">
            <div className="session-note-list-heading">
              <h3 id="session-notes-history-title">Notes</h3>
              <span>{orderedNotes.length}</span>
            </div>
            {notesLoading ? (
              <p className="muted" role="status">Loading notes…</p>
            ) : orderedNotes.length ? (
              <div className="session-note-history">
                {orderedNotes.map((note) => {
                  const canManageNote = String(note.created_by) === String(userId);
                  const isEditing = String(editingNoteId) === String(note.id);
                  return (
                    <article className="session-note-entry" key={note.id}>
                      <div className="session-note-entry-header">
                        <time dateTime={note.date || undefined}>
                          {note.date
                            ? new Date(note.date).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                            : "Unknown date"}
                        </time>
                        {canManageNote && !isEditing && (
                          <div className="note-entry-actions">
                            <button
                              aria-label="Edit note"
                              className="note-edit-button"
                              disabled={deletingNoteId === note.id}
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingText(note.text || "");
                                setNoteError("");
                              }}
                              title="Edit note"
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={15} />
                            </button>
                            <button
                              aria-label="Delete note"
                              className="note-delete-button"
                              disabled={deletingNoteId === note.id}
                              onClick={() => deleteNote(note)}
                              title="Delete note"
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                      {isEditing ? (
                        <form className="session-note-edit-form" onSubmit={saveEditedNote}>
                          <textarea
                            aria-label="Edit note text"
                            autoFocus
                            maxLength={2000}
                            onChange={(event) => setEditingText(event.target.value)}
                            rows={4}
                            value={editingText}
                          />
                          <div className="session-inline-actions">
                            <button
                              className="session-primary-button"
                              disabled={isUpdatingNote || !editingText.trim()}
                              type="submit"
                            >
                              <Save aria-hidden="true" size={15} />
                              {isUpdatingNote ? "Saving…" : "Save"}
                            </button>
                            <button
                              aria-label="Cancel editing note"
                              className="session-icon-button"
                              disabled={isUpdatingNote}
                              onClick={() => {
                                setEditingNoteId(null);
                                setEditingText("");
                              }}
                              title="Cancel"
                              type="button"
                            >
                              <X aria-hidden="true" size={16} />
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p>{note.text || ""}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="session-notes-empty">
                <h4>No notes yet</h4>
                <p>Add the first observation for this session.</p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="session-notes-empty">
          <h3>No sessions available</h3>
          <p>Plan a session before adding session notes.</p>
        </div>
      )}
    </section>
  );
}
