import { useEffect, useState } from "react";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

export function useStudentAssignments(studentId) {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssignments() {
      setAssignments([]);
      setIsLoading(true);
      setError("");

      try {
        if (studentId == null) {
          throw new Error("This student does not have a database ID.");
        }

        const response = await apiFetch(
          `${API_BASE_URL}/assignments-fetchForStudent/${encodeURIComponent(studentId)}`,
          { signal: controller.signal }
        );
        const result = await response.json();

        if (!response.ok) {
          const detail =
            typeof result.detail === "string" && result.detail
              ? `: ${result.detail}`
              : "";
          throw new Error(
            `Assignments request failed (${response.status})${detail}.`
          );
        }
        if (!Array.isArray(result.assignments)) {
          throw new Error("The assignments response has an unexpected format.");
        }

        setAssignments(result.assignments);
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          console.error("Error fetching student assignments:", requestError);
          setError(
            requestError instanceof TypeError
              ? "Could not reach the backend. Check that it is running and VITE_API_URL is correct."
              : requestError.message ||
                  "Could not load this student's assignment grades."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadAssignments();
    return () => controller.abort();
  }, [studentId]);

  return { assignments, setAssignments, isLoading, error };
}
