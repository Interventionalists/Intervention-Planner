import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function requestStudentNotes(userId, studentId, signal) {
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

export function useStudentNotes(userId, studentId) {
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");

  const refreshNotes = async () => {
    if (!userId) {
      const error = new Error("Your account ID is missing; notes cannot be loaded.");
      setNotesError(error.message);
      throw error;
    }

    setNotesLoading(true);
    setNotesError("");
    try {
      const result = await requestStudentNotes(userId, studentId);
      setNotes(result);
      return result;
    } catch (error) {
      setNotesError(error.message || "Unable to load notes.");
      throw error;
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setNotes([]);
    setNotesError("");
    setNotesLoading(true);

    if (!userId) {
      setNotesError("Your account ID is missing; notes cannot be loaded.");
      setNotesLoading(false);
      return () => controller.abort();
    }

    requestStudentNotes(userId, studentId, controller.signal)
      .then((result) => setNotes(result))
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
  }, [studentId, userId]);

  return { notes, notesLoading, notesError, refreshNotes };
}
