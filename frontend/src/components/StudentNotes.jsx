import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useStudentNotes } from "../hooks/useStudentNotes";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function StudentNotes({ studentId, userId, variant = "profile" }) {
  const { notes, notesLoading, notesError, refreshNotes } = useStudentNotes(
    userId,
    studentId
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [draftNote, setDraftNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [saveError, setSaveError] = useState("");

  const startAdding = () => {
    setDraftNote("");
    setEditingNoteId(null);
    setIsAdding(true);
    setIsEditing(true);
    setSaveError("");
  };

  const startEditing = (note) => {
    setDraftNote(note.text || "");
    setEditingNoteId(note.id);
    setIsAdding(false);
    setIsEditing(true);
    setSaveError("");
  };

  const cancelEditing = () => {
    setDraftNote("");
    setEditingNoteId(null);
    setIsAdding(false);
    setIsEditing(false);
    setSaveError("");
  };

  const saveNote = async () => {
    setIsSaving(true);
    setSaveError("");
    const addNewNote = isAdding || editingNoteId === null;
    const params = new URLSearchParams({
      ...(!addNewNote ? { note_id: String(editingNoteId) } : {}),
      ...(!addNewNote ? { new_text: draftNote.trim() } : {}),
    });

    try {
      const response = addNewNote
        ? await fetch(`${API_BASE_URL}/notes-create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              student_id: studentId,
              created_by: userId,
              text: draftNote.trim(),
            }),
          })
        : await fetch(`${API_BASE_URL}/notes-editText?${params}`, {
            method: "PUT",
          });

      if (!response.ok) {
        throw new Error("Unable to save this note.");
      }

      await refreshNotes();
      cancelEditing();
    } catch (error) {
      setSaveError(error.message || "Unable to save this note.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNote = async (note) => {
    const noteDate = note.date
      ? new Date(note.date).toLocaleDateString()
      : "this note";
    if (!window.confirm(`Delete the note from ${noteDate}? This cannot be undone.`)) {
      return;
    }

    setDeletingNoteId(note.id);
    setSaveError("");
    const params = new URLSearchParams({
      note_id: String(note.id),
      user_id: userId,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/notes-delete?${params}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Unable to delete this note.");
      }
      await refreshNotes();
    } catch (error) {
      setSaveError(error.message || "Unable to delete this note.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  return (
    <section
      className={variant === "dashboard" ? "student-notes" : "profile-notes"}
      aria-labelledby="profile-notes-title"
    >
      {variant === "dashboard" ? (
        <span id="profile-notes-title">Notes</span>
      ) : (
        <h3 id="profile-notes-title">Notes</h3>
      )}
      {notesLoading ? (
        <p className="muted">Loading notes...</p>
      ) : isEditing ? (
        <>
          <textarea
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            rows={4}
            placeholder={isAdding ? "Write another note..." : "Edit this note..."}
          />
          {saveError && <p className="error-state" role="alert">{saveError}</p>}
          <div className="notes-actions">
            <button
              type="button"
              className="text-button"
              onClick={saveNote}
              disabled={isSaving || !userId}
            >
              {isSaving ? "Saving..." : isAdding ? "Add note" : "Save changes"}
            </button>
            <button type="button" className="ghost-button" onClick={cancelEditing}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          {notesError ? (
            <p className="error-state" role="alert">{notesError}</p>
          ) : notes.length ? (
            <div className="note-history">
              {notes.map((note) => (
                <article className="note-entry" key={note.id}>
                  <div className="note-entry-header">
                    <time>
                      {note.date ? new Date(note.date).toLocaleDateString() : ""}
                    </time>
                    <div className="note-entry-actions">
                      <button
                        type="button"
                        className="note-edit-button"
                        title="Edit this note"
                        aria-label={`Edit note from ${note.date ? new Date(note.date).toLocaleDateString() : "this date"}`}
                        onClick={() => startEditing(note)}
                        disabled={deletingNoteId !== null}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="note-delete-button"
                        title="Delete this note"
                        aria-label={`Delete note from ${note.date ? new Date(note.date).toLocaleDateString() : "this date"}`}
                        onClick={() => deleteNote(note)}
                        disabled={!userId || deletingNoteId !== null}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p>{note.text || ""}</p>
                </article>
              ))}
            </div>
          ) : (
            <p>No notes yet.</p>
          )}
          {saveError && <p className="error-state" role="alert">{saveError}</p>}
          <div className="notes-actions">
            <button
              type="button"
              className="text-button"
              onClick={startAdding}
              disabled={!userId}
            >
              Add note
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default StudentNotes;
