import { Fragment, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { apiFetch } from "../api";
import { CardTitle } from "../components/PageElements";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000")
  .replace(/\/+$/, "");

export default function ViewStateTestingTile({ studentId, refreshToken = 0 }) {
  const [scores, setScores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingScoreId, setEditingScoreId] = useState(null);
  const [draftScore, setDraftScore] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadScores() {
      setScores([]);
      setError("");
      setIsLoading(true);

      try {
        if (studentId == null) {
          throw new Error("This student does not have a database ID.");
        }
        const response = await apiFetch(
          `${API_BASE_URL}/students-state-test-scoring/${encodeURIComponent(studentId)}`,
          { signal: controller.signal }
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.detail || "Could not load state test scores.");
        }
        if (!Array.isArray(result.scores)) {
          throw new Error("The state test scores response has an unexpected format.");
        }
        setScores(result.scores);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError.message || "Could not load state test scores.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadScores();
    return () => controller.abort();
  }, [studentId, refreshToken]);

  const startEditing = (score) => {
    setEditingScoreId(score.id);
    setDraftScore({
      test_name: score.test_name,
      grade: String(score.grade),
      year_taken: String(score.year_taken),
    });
    setSaveError("");
  };

  const cancelEditing = () => {
    setEditingScoreId(null);
    setDraftScore(null);
    setSaveError("");
  };

  const saveScore = async (scoreId) => {
    const testName = draftScore?.test_name.trim() || "";
    const grade = Number(draftScore?.grade);
    const yearTaken = Number(draftScore?.year_taken);
    const normalizedTestName = testName.toUpperCase();

    if (!testName || !Number.isInteger(grade) || grade < 0) {
      setSaveError("Enter a test name and a whole-number score of zero or higher.");
      return;
    }
    if (normalizedTestName === "SAT" && (grade < 400 || grade > 1600 || grade % 10 !== 0)) {
      setSaveError("SAT scores must be from 400 to 1600 in increments of 10.");
      return;
    }
    if (normalizedTestName === "ACT" && (grade < 1 || grade > 36)) {
      setSaveError("ACT scores must be from 1 to 36.");
      return;
    }
    if (["MCA-READING", "MCA-MATH", "MCA-SCIENCE"].includes(normalizedTestName) && (grade < 200 || grade > 1300)) {
      setSaveError("MCA scores must be from 200 to 1300.");
      return;
    }
    if (!Number.isInteger(yearTaken) || yearTaken < 1900 || yearTaken > 9999) {
      setSaveError("Enter a valid year.");
      return;
    }

    setIsSaving(true);
    setSaveError("");
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/students-state-test-scoring/${encodeURIComponent(scoreId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test_name: testName, grade, year_taken: yearTaken }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || "Unable to update this state test score.");
      }
      setScores((currentScores) =>
        currentScores.map((score) => score.id === scoreId ? result.score : score)
      );
      cancelEditing();
    } catch (updateError) {
      setSaveError(updateError.message || "Unable to update this state test score.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card state-test-results-card">
      <CardTitle title="State testing" />
      {isLoading ? (
        <p className="muted" role="status">Loading state test scores...</p>
      ) : error ? (
        <p className="error-state" role="alert">{error}</p>
      ) : scores.length ? (
        <div className="state-test-results-table-wrap">
          <table className="state-test-results-table">
            <thead>
              <tr><th>Test</th><th>Score</th><th>Year</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {scores.map((score) => (
                <Fragment key={score.id}>
                  <tr>
                    {editingScoreId === score.id ? (
                      <>
                        <td className="state-test-score-input-cell"><input aria-label="Test name" maxLength={100} value={draftScore.test_name} onChange={(event) => setDraftScore({ ...draftScore, test_name: event.target.value })} /></td>
                        <td className="state-test-score-input-cell"><input aria-label="Score" type="number" min="0" step="1" value={draftScore.grade} onChange={(event) => setDraftScore({ ...draftScore, grade: event.target.value })} /></td>
                        <td className="state-test-score-input-cell"><input aria-label="Year" type="number" min="1900" max="9999" step="1" value={draftScore.year_taken} onChange={(event) => setDraftScore({ ...draftScore, year_taken: event.target.value })} /></td>
                        <td className="state-test-edit-actions">
                          <button type="button" className="text-button" onClick={() => saveScore(score.id)} disabled={isSaving}>{isSaving ? "Saving..." : "Save"}</button>
                          <button type="button" className="ghost-button" onClick={cancelEditing} disabled={isSaving}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{score.test_name}</td>
                        <td>{score.grade}</td>
                        <td>{score.year_taken}</td>
                        <td className="state-test-edit-actions">
                          <button type="button" className="note-edit-button" title="Edit this score" aria-label={`Edit ${score.test_name} score from ${score.year_taken}`} onClick={() => startEditing(score)}>
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                  {editingScoreId === score.id && saveError && (
                    <tr key={`${score.id}-error`}><td colSpan={4}><p className="error-state" role="alert">{saveError}</p></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No state test scores have been recorded.</p>
      )}
    </section>
  );
}
