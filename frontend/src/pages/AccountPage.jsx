import React, { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Lock,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { ResetPasswordForm } from "../LoginPage";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

async function fetchUserNotes(publicId) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/notes-userFetch/${publicId}`);
        if (!response.ok) {
            throw new Error(`Notes request failed (${response.status}).`);
        }
        const data = await response.json();
        if (!Array.isArray(data.notes)) {
            throw new Error("The notes response has an unexpected format.");
        }
        return data.notes;
    } catch (error) {
        console.error("Error fetching user notes:", error);
        throw error;
    }
}

async function fetchStudentNames() {
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

async function loadSchools(currentSchool, setSchools, setSchoolId, setSchoolLoadError) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/schools-fetch`);
    if (!response.ok) {
      throw new Error(`School request failed (${response.status}).`);
    }

    const data = await response.json();
    if (!Array.isArray(data.schools)) {
      throw new Error("The schools response has an unexpected format.");
    }

    const schoolOptions = data.schools
      .map((record) =>
        typeof record === "string"
          ? null
          : {
              id: record.school_id ?? record.id,
              name: record.school_name ?? record.name,
            }
      )
      .filter(
        (option) =>
          option &&
          option.id != null &&
          typeof option.name === "string" &&
          option.name.trim()
      )
      .map((option) => ({
        id: String(option.id),
        name: option.name.trim(),
      }));

    setSchools(schoolOptions);
    setSchoolId((currentId) =>
      currentId ||
      schoolOptions.find((option) => option.name === currentSchool)?.id ||
      ""
    );
    setSchoolLoadError("");
  } catch {
    setSchoolLoadError("Could not load the school list. Please try again.");
  }
}

// onUserUpdated(updatedUser) lets the parent refresh its user state after a save.
const AccountPage = ({ user, name, initials, onUserUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState([]);
  const [studentNames, setStudentNames] = useState({});
  const [students, setStudents] = useState([]);
  const [notesError, setNotesError] = useState("");
  const [noteActionError, setNoteActionError] = useState("");
  const [noteFilter, setNoteFilter] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteStudentId, setNoteStudentId] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [schoolId, setSchoolId] = useState(
    user?.school == null ? "" : String(user.school)
  );
  const [schools, setSchools] = useState([]);
  const [schoolLoadError, setSchoolLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  useEffect(() => {
    loadSchools(
      user?.school_name || user?.school,
      setSchools,
      setSchoolId,
      setSchoolLoadError
    );

  }, [user?.school, user?.school_name]);

  useEffect(() => {
    if (user?.public_id) {
      fetchUserNotes(user.public_id)
        .then(setNotes)
        .catch((error) => setNotesError(error.message));
    } else {
      setNotesError("Your account ID is missing; notes cannot be loaded.");
    }
    fetchStudentNames()
      .then(({ names, students: studentOptions }) => {
        setStudentNames(names);
        setStudents(studentOptions);
      })
      .catch((error) => setNotesError(error.message));
  }, [user?.public_id]);

  const selectedSchool = schools.find((option) => option.id === schoolId);
  const schoolName =
    selectedSchool?.name ||
    user?.school_name ||
    user?.school ||
    "No school assigned";

  const details = [
    { label: "Name: ", value: name },
    { label: "Email: ", value: user?.email || "Not provided" },
    { label: "Role: ", value: user?.role || "Not provided" },
    { label: "School: ", value: schoolName },
  ];

  const startEditing = () => {
    setSchoolId(user?.school_id == null ? "" : String(user.school_id));
    setSaveError("");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      if (!user?.id) {
        throw new Error("The logged-in user ID is missing.");
      }
      if (!selectedSchool) {
        throw new Error("Select a school from the list.");
      }

      const params = new URLSearchParams({
        user_id: String(user.id),
        new_school_id: selectedSchool.id,
      });
      const response = await apiFetch(`${API_BASE_URL}/schools-update?${params}`, {
        method: "PUT",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.detail || `School update failed (${response.status}).`
        );
      }

      onUserUpdated?.({
        ...user,
        school_id: selectedSchool.id,
        school_name: selectedSchool.name,
        school: selectedSchool.name,
      });
      setEditing(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Couldn't save your school. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const closeNoteForm = () => {
    setIsAddingNote(false);
    setEditingNoteId(null);
    setNoteDraft("");
    setNoteStudentId("");
    setNoteActionError("");
  };

  const startAddingNote = () => {
    setNoteDraft("");
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
    if (!user?.public_id) {
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
              student_id:
                noteStudentId === "personal" ? null : Number(noteStudentId),
              created_by: user.public_id,
              text,
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
        throw new Error("Unable to save this note.");
      }

      setNotes(await fetchUserNotes(user.public_id));
      closeNoteForm();
    } catch (error) {
      setNoteActionError(error.message || "Unable to save this note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const deleteNote = async (note) => {
    if (
      !window.confirm(
        "Delete this note? This action cannot be undone."
      )
    ) {
      return;
    }
    if (!user?.public_id) {
      setNoteActionError("Your account ID is missing; this note cannot be deleted.");
      return;
    }

    setDeletingNoteId(note.id);
    setNoteActionError("");
    try {
      const params = new URLSearchParams({
        note_id: String(note.id),
        user_id: user.public_id,
      });
      const response = await apiFetch(`${API_BASE_URL}/notes-delete?${params}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Unable to delete this note.");
      }
      setNotes(await fetchUserNotes(user.public_id));
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
    <div className="account-page">
      <div className="page-heading">
        <span className="eyebrow">Account</span>
        <h1>My profile</h1>
        <p>Manage your teacher account and intervention preferences.</p>
      </div>

      <section className="card account-header">
        <div className="account-avatar">{initials}</div>
        <div className="account-header-copy">
          <h2>{name}</h2>
          <p>
            {user?.role || "Account"}
            {` · ${schoolName}`}
          </p>
        </div>
        
      </section>

      <div className="account-grid">
        <section className="card account-card">
          <div className="card-title">
            <h2>Account details</h2>

            <span className="status-pill">
              <CheckCircle2 size={15} /> {!editing && (<button className="text-button" onClick={startEditing}><h2>Edit profile</h2></button>)}
            </span>
          </div>

          <div className="detail-list">
            {details.map(({ label, value }) => (
              <div className="detail-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          {editing && (
            <div className="edit-school">
              <h3>Edit school</h3>
              <label htmlFor="school-select">School</label>
              <select
                id="school-select"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                disabled={schools.length === 0}
              >
                <option value="" disabled>
                  {schoolLoadError ? "School list unavailable" : "Select a school"}
                </option>
                {schools.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              {schoolLoadError && <small>{schoolLoadError}</small>}
              {saveError && <small>{saveError}</small>}

              <div className="edit-actions">
                <button
                  className="ghost-button"
                  onClick={handleSave}
                  disabled={!selectedSchool || !user?.id || saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card account-card security-card">
          <div className="card-title">
            <h2>Security</h2>
            <ShieldCheck size={18} />
          </div>

          <div className="security-item">
            <div className="security-icon">
              <Lock size={17} />
              {" "}
              <strong>Password</strong>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setChangingPassword((changing) => !changing);
                setPasswordNotice("");
              }}
            >
              {changingPassword ? "Cancel" : "Change"}
            </button>
          </div>

          {passwordNotice && <p className="login-notice">{passwordNotice}</p>}
          {changingPassword && (
            <ResetPasswordForm
              email={user?.email || ""}
              showEmailField={false}
              showHeading={false}
              backLabel="Cancel"
              onBack={() => setChangingPassword(false)}
              onSuccess={() => {
                setChangingPassword(false);
                setPasswordNotice("Password updated successfully.");
              }}
            />
          )}

          <div className="security-item">
            <div className="security-icon muted-icon">
              <Mail size={17} />
              {" "}
              <strong>Email notifications (not implemented yet)</strong>
            </div>
            <button className="ghost-button" type="button">Manage</button>
          </div>
        </section>

        <section className="card account-card">
          <div className="card-title">
            <h2>Notes</h2>
            <UserRound size={18} />
          </div>

          <p className="Note-description">
            Filter your notes, add new notes, edit or delete existing notes. You can also view which student each note is associated with.
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
              disabled={!user?.public_id}
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
            <p className="error-state" role="alert">{noteActionError}</p>
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
                      disabled={!user?.public_id || deletingNoteId !== null}
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
          {notesError && <p role="alert">{notesError}</p>}
        </section>
      </div>
    </div>
  );
};

export default AccountPage;