import { useEffect, useState } from "react";
import { CardTitle } from "../components/PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const SUBJECTS = [
  ["math", "Math"],
  ["english", "English"],
  ["social_studies", "Social studies"],
  ["science", "Science"],
  ["art", "Art"],
  ["p_e", "P.E."],
];

function normalizeSubject(subject) {
  const normalized = subject.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "pe" ? "p_e" : normalized;
}

function StudentGoalsTile({
  studentId,
  currentGrades = {},
  gradesLoading = false,
}) {
  const [goals, setGoals] = useState({});
  const [savedGoals, setSavedGoals] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedGoals, setHasLoadedGoals] = useState(false);
  const [hasSavedGoals, setHasSavedGoals] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const gradesBySubject = Object.fromEntries(
    Object.entries(currentGrades).map(([subject, grade]) => [
      normalizeSubject(subject),
      grade,
    ])
  );

  const renderCurrentGrade = (subject, goal) => {
    if (gradesLoading) {
      return <span className="student-goal-current muted">Loading...</span>;
    }

    const grade = gradesBySubject[subject];
    if (!Number.isFinite(grade)) {
      return <span className="student-goal-current">N/A</span>;
    }

    const numericGoal = Number(goal);
    const comparisonClass = Number.isFinite(numericGoal)
      ? grade >= numericGoal
        ? "student-goal-met"
        : "student-goal-below"
      : "";
    return (
      <span className={`student-goal-current ${comparisonClass}`}>
        {grade.toFixed(1)}%
      </span>
    );
  };

  useEffect(() => {
    const controller = new AbortController();

    async function loadGoals() {
      setGoals({});
      setSavedGoals({});
      setError("");
      setMessage("");
      setHasLoadedGoals(false);
      setHasSavedGoals(false);
      setIsEditing(false);
      setIsLoading(true);

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/students-fetchGoals/${encodeURIComponent(studentId)}`,
          { signal: controller.signal }
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.detail || "Could not load student goals.");
        }
        if (result.student_goals != null) {
          setGoals(result.student_goals.goals);
          setSavedGoals(result.student_goals.goals);
          setHasSavedGoals(true);
        }
        setHasLoadedGoals(true);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Error fetching student goals:", loadError);
          setError(loadError.message || "Could not load student goals.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadGoals();
    return () => controller.abort();
  }, [studentId]);

  const saveGoals = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");

    const submittedGoals = {};
    for (const [subject] of SUBJECTS) {
      const value = goals[subject];
      if (value === "" || value == null) continue;
      const grade = Number(value);
      if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
        setError("Enter a grade from 0 to 100 for each subject.");
        setIsSaving(false);
        return;
      }
      submittedGoals[subject] = grade;
    }

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/students-setGoals/${encodeURIComponent(studentId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goals: submittedGoals }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Could not save student goals.");
      }
      if (
        !result.student_goals ||
        typeof result.student_goals.goals !== "object" ||
        result.student_goals.goals === null
      ) {
        throw new Error("The saved goals response has an unexpected format.");
      }
      setGoals(result.student_goals.goals);
      setSavedGoals(result.student_goals.goals);
      setHasSavedGoals(true);
      setIsEditing(false);
      setMessage("Subject goals saved.");
    } catch (saveError) {
      console.error("Error saving student goals:", saveError);
      setError(saveError.message || "Could not save student goals.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card profile-student-goals-card">
      <CardTitle
        title="Subject goals"
        action={
          hasSavedGoals && !isEditing ? (
            <button
              className="student-goals-edit"
              type="button"
              onClick={() => {
                setMessage("");
                setIsEditing(true);
              }}
            >
              Edit
            </button>
          ) : null
        }
      />
      {isLoading ? (
        <p className="muted" role="status">Loading subject goals...</p>
      ) : !hasLoadedGoals ? (
        <p className="grade-chart-error" role="alert">{error}</p>
      ) : hasSavedGoals && !isEditing ? (
        <div className="student-goals-list">
          <div className="student-goals-list-heading" aria-hidden="true">
            <span>Subject</span>
            <span>Goal</span>
            <span>Actual grade</span>
          </div>
          {SUBJECTS.map(([subject, label]) => (
            <div key={subject}>
              <span>{label}</span>
              <strong>
                {goals[subject] == null || goals[subject] === ""
                  ? "Not set"
                  : `${goals[subject]}%`}
              </strong>
              {renderCurrentGrade(subject, goals[subject])}
            </div>
          ))}
          {message && (
            <p className="profile-update-success" role="status">{message}</p>
          )}
        </div>
      ) : (
        <>
          <p className="student-goals-help">
            Set a target grade from 0 to 100 for each subject.
          </p>
          <form className="student-goals-form" onSubmit={saveGoals}>
            <div className="student-goals-fields">
              <div className="student-goals-list-heading" aria-hidden="true">
                <span>Subject</span>
                <span>Goal</span>
                <span>Actual grade</span>
              </div>
              {SUBJECTS.map(([subject, label]) => (
                <div className="student-goals-edit-row" key={subject}>
                  <label htmlFor={`goal-${subject}`}>{label}</label>
                  <div className="student-goals-input">
                    <input
                      id={`goal-${subject}`}
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={goals[subject] ?? ""}
                      onChange={(event) =>
                        setGoals((current) => ({
                          ...current,
                          [subject]: event.target.value,
                        }))
                      }
                      aria-label={`${label} target grade`}
                    />
                    <span aria-hidden="true">%</span>
                  </div>
                  {renderCurrentGrade(subject, goals[subject])}
                </div>
              ))}
            </div>
            {error && (
              <p className="grade-chart-error" role="alert">{error}</p>
            )}
            <div className="student-goals-actions">
              {hasSavedGoals && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setGoals(savedGoals);
                    setError("");
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                className="student-goals-save"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save goals"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

export default StudentGoalsTile;
