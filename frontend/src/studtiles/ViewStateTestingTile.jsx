import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { CardTitle } from "../components/PageElements";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000")
  .replace(/\/+$/, "");

export default function ViewStateTestingTile({ studentId, refreshToken = 0 }) {
  const [scores, setScores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
              <tr><th>Test</th><th>Score</th><th>Year</th></tr>
            </thead>
            <tbody>
              {scores.map((score) => (
                <tr key={score.id}>
                  <td>{score.test_name}</td>
                  <td>{score.grade}</td>
                  <td>{score.year_taken}</td>
                </tr>
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
