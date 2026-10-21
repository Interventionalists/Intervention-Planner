// Account-wide notes panel used by the AccountPage.
// Loads, filters, creates, edits, and deletes personal or student-linked notes.
import { useEffect, useState } from "react";
import { Pencil, Trash2, UserRound } from "lucide-react";
import { CardTitle } from "./PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

async function fetchUserNotes(publicId) {
  const response = await apiFetch(`${API_BASE_URL}/notes-userFetch/${publicId}`);
  if (!response.ok) {
    throw new Error(`Notes request failed (${response.status}).`);
  }
  const data = await response.json();
  if (!Array.isArray(data.notes)) {
    throw new Error("The notes response has an unexpected format.");
  }
  return data.notes;
}

async function fetchStudents() {
  const response = await apiFetch(`${API_BASE_URL}/students-fetch`);
  if (!response.ok) {
    throw new Error(`Students request failed (${response.status}).`);
  }
  const data = await response.json();
  if (!Array.isArray(data.students)) {
    throw new Error("The students response has an unexpected format.");
  }
  return {
    names: Object.fromEntries(
      data.students.map(({ id, first_name, last_name }) => [
        id,
        `${first_name} ${last_name}`.trim(),
      ])
    ),
    students: data.students.map(({ id, first_name, last_name }) => ({
      id: String(id),
      name: `${first_name} ${last_name}`.trim(),
    })),
  };
}

function AccountNotesCard({ userId }) {
  const [notes, setNotes] = useState([]);
  const [studentNames, setStudentNames] = useState({});
  const [students, setStudents] = useState([]);
  const [notesError, setNotesError] = useState("");
  const [noteActionError, setNoteActionError] = useState("");
  const [noteFilter, setNoteFilter] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [isNotePrivate, setIsNotePrivate] = useState(false);
  const [noteStudentId, setNoteStudentId] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);

  useEffect(() => {
    if (userId) {
      fetchUserNotes(userId)
        .then(setNotes)
        .catch((error) => setNotesError(error.message));
    } else {
      setNotesError("Your account ID is missing; notes cannot be loaded.");
    }

    fetchStudents()
      .then(({ names, students: studentOptions }) => {
        setStudentNames(names);
        setStudents(studentOptions);
      })
      .catch((error) => setNotesError(error.message));
  }, [userId]);

  const closeNoteForm = () => {
    setIsAddingNote(false);
    setEditingNoteId(null);
    setNoteDraft("");
    setIsNotePrivate(false);
    setNoteStudentId("");
    setNoteActionError("");
  };

  const startAddingNote = () => {
    setNoteDraft("");
    setIsNotePrivate(false);
    setNoteStudentId("");
    setEditingNoteId(null);
    setIsAddingNote(true);
    setNoteActionError("");
  };

  const startEditingNote = (note) => {
    setNoteDraft(note.text || "");
    setNoteStudentId(String(note.student_id));
    setEditingNoteId(note.id);
    setIsAddingNote(false);
    setNoteActionError("");
  };

  const saveNote = async (event) => {
    event.preventDefault();
    const text = noteDraft.trim();
    if (!text || (!isAddingNote && editingNoteId === null)) {
      setNoteActionError("Enter note text before saving.");
      return;
    }
    if (isAddingNote && !noteStudentId) {
      setNoteActionError("Select a student or personal note.");
      return;
    }
    if (!userId) {
      setNoteActionError("Your account ID is missing; this note cannot be saved.");
      return;
    }

    setIsSavingNote(true);
    setNoteActionError("");
    try {
      const response = isAddingNote
        ? await apiFetch(`${API_BASE_URL}/notes-create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Personal notes use a null student_id; student notes use the selected ID.
              student_id:
                noteStudentId === "personal" ? null : Number(noteStudentId),
              created_by: userId,
              text,
              is_private: isNotePrivate,
            }),
          })
        : await apiFetch(
            `${API_BASE_URL}/notes-editText?${new URLSearchParams({
              note_id: String(editingNoteId),
              new_text: text,
            })}`,
            { method: "PUT" }
          );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "Unable to save this note.");
      }

      setNotes(await fetchUserNotes(userId));
      closeNoteForm();
    } catch (error) {
      setNoteActionError(error.message || "Unable to save this note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const deleteNote = async (note) => {
    if (!window.confirm("Delete this note? This action cannot be undone.")) {
      return;
    }
    if (!userId) {
      setNoteActionError("Your account ID is missing; this note cannot be deleted.");
      return;
    }

    setDeletingNoteId(note.id);
    setNoteActionError("");
    try {
      const params = new URLSearchParams({
        note_id: String(note.id),
        user_id: userId,
      });
      const response = await apiFetch(
        `${API_BASE_URL}/notes-delete?${params}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error("Unable to delete this note.");
      }
      setNotes(await fetchUserNotes(userId));
    } catch (error) {
      setNoteActionError(error.message || "Unable to delete this note.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  const filteredNotes = notes.filter((note) => {
    const studentName = studentNames[note.student_id] || "";
    const query = noteFilter.trim().toLowerCase();
    return (
      (!query ||
        note.text?.toLowerCase().includes(query) ||
        studentName.toLowerCase().includes(query)) &&
      (!studentFilter ||
        (studentFilter === "personal"
          ? note.student_id == null
          : String(note.student_id) === studentFilter))
    );
  });

  return (
    <section className="card account-card">
      <CardTitle
        title="Notes"
        action={<UserRound size={18} aria-hidden="true" />}
      />

      <p className="muted">
        Filter, add, edit, or delete notes and see which student each note is
        associated with.
      </p>

      <div className="account-notes-toolbar">
        <input
          type="search"
          aria-label="Filter notes"
          placeholder="Filter notes by text or student"
          value={noteFilter}
          onChange={(event) => setNoteFilter(event.target.value)}
        />
        <select
          aria-label="Filter notes by student"
          value={studentFilter}
          onChange={(event) => setStudentFilter(event.target.value)}
        >
          <option value="">All students</option>
          <option value="personal">Personal notes (N/A)</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name || "Unnamed student"}
            </option>
          ))}
        </select>
        <button
          className="ghost-button"
          type="button"
          onClick={startAddingNote}
          disabled={!userId}
        >
          Add note
        </button>
      </div>

      {(isAddingNote || editingNoteId !== null) && (
        <form className="account-note-form" onSubmit={saveNote}>
          {isAddingNote && (
            <label>
              Student
              <select
                value={noteStudentId}
                onChange={(event) => setNoteStudentId(event.target.value)}
                required
              >
                <option value="">Select a student</option>
                <option value="personal">Personal note (student: N/A)</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name || "Unnamed student"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Note
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={3}
              required
              autoFocus
            />
          </label>
          {isAddingNote && (
            <label className="note-privacy-option">
              <input
                type="checkbox"
                checked={isNotePrivate}
                onChange={(event) => setIsNotePrivate(event.target.checked)}
              />
              Private note
            </label>
          )}
          <div className="notes-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={isSavingNote}
            >
              {isSavingNote ? "Saving..." : "Save note"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={closeNoteForm}
              disabled={isSavingNote}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {noteActionError && (
        <p className="error-state" role="alert">
          {noteActionError}
        </p>
      )}

      <div className="card student-table-card notes-table">
        <div className="table-head">
          <span>Text</span>
          <span>Date</span>
          <span>Student</span>
          <span>Actions</span>
        </div>

        <div className="table-body">
          {filteredNotes.map((note) => (
            <div className="student-row note-row" key={note.id}>
              <span>{note.text}</span>
              <span>{note.date}</span>
              <span>{studentNames[note.student_id] || "N/A"}</span>
              <span className="account-note-actions">
                <button
                  className="note-edit-button"
                  type="button"
                  aria-label="Edit note"
                  title="Edit note"
                  onClick={() => startEditingNote(note)}
                  disabled={deletingNoteId !== null || isSavingNote}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  className="note-delete-button"
                  type="button"
                  aria-label="Delete note"
                  title="Delete note"
                  onClick={() => deleteNote(note)}
                  disabled={!userId || deletingNoteId !== null}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </span>
            </div>
          ))}
          {!notesError && filteredNotes.length === 0 && (
            <p className="account-notes-empty">
              {notes.length ? "No notes match these filters." : "No notes yet."}
            </p>
          )}
        </div>
      </div>
      {notesError && (
        <p className="error-state" role="alert">
          {notesError}
        </p>
      )}
    </section>
  );
}

export default AccountNotesCard;
