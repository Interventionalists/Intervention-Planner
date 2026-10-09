import { useEffect, useState } from "react";
import { BarChart3, ClipboardList, Pencil, SlidersHorizontal } from "lucide-react";
import { events } from "../data";
import { CardTitle, PageHeading, ProgressChart } from "../components/PageElements";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function fetchStudentNotes(userId, studentId, signal) {
  const params = new URLSearchParams({
    user_id: userId,
    student_id: String(studentId),
  });
  const response = await fetch(
    `${API_BASE_URL}/notes-fetchForStudent?${params}`,
    { signal }
  );
  if (!response.ok) {
    throw new Error("Unable to load notes for this student.");
  }
  const result = await response.json();
  return result.notes || [];
}

function DashboardPage({
  student,
  students,
  onStudentChange,
  onStudents,
  userName = "User",
  userId,
}) {
  const [noteRows, setNoteRows] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [draftNote, setDraftNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setNoteRows([]);
    setDraftNote("");
    setIsEditingNote(false);
    setIsAddingNote(false);
    setEditingNoteId(null);
    setNotesError("");
    setNotesLoading(true);

    if (!userId) {
      setNotesError("Your account ID is missing; notes cannot be loaded.");
      setNotesLoading(false);
      return () => controller.abort();
    }

    fetchStudentNotes(userId, student.id, controller.signal)
      .then(setNoteRows)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setNotesError(error.message || "Unable to load notes.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setNotesLoading(false);
        }
      });

    return () => controller.abort();
  }, [student.id, userId]);

  const saveNote = async () => {
    setNotesSaving(true);
    setNotesError("");
    const addNewNote = isAddingNote || editingNoteId === null;
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
              student_id: student.id,
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

      setNoteRows(await fetchStudentNotes(userId, student.id));
      setIsEditingNote(false);
      setIsAddingNote(false);
      setEditingNoteId(null);
      setDraftNote("");
    } catch (error) {
      setNotesError(error.message || "Unable to save this note.");
    } finally {
      setNotesSaving(false);
    }
  };

  const cancelNoteEdit = () => {
    setDraftNote("");
    setIsEditingNote(false);
    setIsAddingNote(false);
    setEditingNoteId(null);
  };

  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title={`Good morning, ${userName}!`}
        subtitle="Here’s what’s happening with your intervention students."
      />

      <section className="dashboard-grid">
        <div className="card student-card">
          <div className="student-avatar-wrap">
            <img src={student.avatar} alt="" />
          </div>
          <h2>{student.name}</h2>
          <p>Grade: {student.grade}</p>
          <p>Teacher: {student.teacher}</p>
          {student.group !== "—" && <p>Group: {student.group}</p>}
          <p>Int. Teacher: {student.interventionTeacher}</p>
          <div className="student-notes">
            <span>Notes</span>
            {notesLoading ? (
              <p className="muted">Loading notes...</p>
            ) : isEditingNote ? (
              <>
                <textarea
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  rows={4}
                  placeholder={isAddingNote ? "Write another note..." : "Edit this note..."}
                />
                <div className="notes-actions">
                  <button type="button" className="text-button" onClick={saveNote} disabled={notesSaving}>
                    {notesSaving ? "Saving..." : isAddingNote ? "Add note" : "Save changes"}
                  </button>
                  <button type="button" className="ghost-button" onClick={cancelNoteEdit}>
                    Cancel
                  </button>
                </div>
              </>
            ) : noteRows.length ? (
              <>
                <div className="note-history">
                  {noteRows.map((note) => (
                    <article className="note-entry" key={note.id}>
                      <div className="note-entry-header">
                        <time>{note.date ? new Date(note.date).toLocaleDateString() : ""}</time>
                        <button
                          type="button"
                          className="note-edit-button"
                          title="Edit this note"
                          aria-label={`Edit note from ${note.date ? new Date(note.date).toLocaleDateString() : "this date"}`}
                          onClick={() => {
                            setDraftNote(note.text || "");
                            setEditingNoteId(note.id);
                            setIsAddingNote(false);
                            setIsEditingNote(true);
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <p>{note.text || ""}</p>
                    </article>
                  ))}
                </div>
                <div className="notes-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setDraftNote("");
                      setEditingNoteId(null);
                      setIsAddingNote(true);
                      setIsEditingNote(true);
                    }}
                  >
                    Add note
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>No notes yet.</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDraftNote("");
                    setEditingNoteId(null);
                    setIsAddingNote(true);
                    setIsEditingNote(true);
                  }}
                >
                  Add note
                </button>
              </>
            )}
            {notesError && <p className="error-state" role="alert">{notesError}</p>}
          </div>
          <select
            value={student.id ?? ""}
            onChange={(event) =>
              onStudentChange(
                students.find((candidate) => String(candidate.id) === event.target.value)
              )
            }
            aria-label="Select student"
          >
            {students.map((candidate) => (
              <option key={candidate.id ?? candidate.name} value={candidate.id ?? ""}>
                {candidate.name}
              </option>
            ))}
          </select>
          <button className="text-button" onClick={onStudents}>
            View all students →
          </button>
        </div>

        <div className="card">
          <CardTitle title="Scores" action={<SlidersHorizontal size={18} />} />
          <div className="score-list">
            {Object.entries(student.scores).slice(0, 6).map(([subject, score]) => (
              <div className="score-row" key={subject}>
                <span>{subject}</span>
                <div className="score-bar">
                  <span style={{ width: `${score}%` }} />
                </div>
                <strong>{score.toFixed(2)}%</strong>
              </div>
            ))}
            {!Object.keys(student.scores).length && (
              <p className="muted">No score data is available yet.</p>
            )}
          </div>
        </div>

        <div className="card">
          <CardTitle title="Grades" />
          <div className="grade-list">
            {Object.entries(student.scores).map(([subject, score]) => (
              <div key={subject} className={score < 60 ? "grade-alert" : ""}>
                <span>{subject}</span>
                <strong>{score.toFixed(2)}%</strong>
              </div>
            ))}
            {!Object.keys(student.scores).length && (
              <p className="muted">No grade data is available yet.</p>
            )}
          </div>
        </div>

        <div className="card chart-card">
          <CardTitle
            title="Progress"
            action={
              <div className="chart-actions">
                <button aria-label="Bar chart"><BarChart3 size={19} /></button>
                <button aria-label="Line chart"><ClipboardList size={18} /></button>
              </div>
            }
          />
          <ProgressChart values={student.recentScores} />
        </div>

        <div className="card">
          <CardTitle title="Upcoming" />
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
      </section>
    </>
  );
}

export default DashboardPage;
