import { useState } from "react";
import { apiFetch } from "../api";
import { CardTitle } from "../components/PageElements";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000")
  .replace(/\/+$/, "");
const CUSTOM_TEST = "__custom__";

export default function InputStateTestingTile({ studentId, onScoreSaved }) {
  const [selectedTest, setSelectedTest] = useState("");
  const [customTest, setCustomTest] = useState("");
  const [grade, setGrade] = useState("");
  const [year, setYear] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const saveScore = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const testName = selectedTest === CUSTOM_TEST ? customTest.trim() : selectedTest;
    const score = Number(grade);
    const parsedYear = Number(year);
    if (!studentId) {
      setError("Student ID is missing; this score cannot be saved.");
      return;
    }
    if (!testName) {
      setError("Choose a test or enter a test name.");
      return;
    }
    if (grade === "" || !Number.isInteger(score) || score < 0) {
      setError("Enter a whole-number score of zero or higher.");
      return;
    }
    if (
      testName.toUpperCase() === "SAT" &&
      (score < 400 || score > 1600 || score % 10 !== 0)
    ) {
      setError("SAT scores must be from 400 to 1600 in increments of 10.");
      return;
    }
    if (
      testName.toUpperCase() === "ACT" &&
      (score < 1 || score > 36)
    ) {
      setError("ACT scores must be from 1 to 36");
      return;
    }
    if (
      ["MCA-READING", "MCA-MATH", "MCA-SCIENCE"].includes(
      testName.trim().toUpperCase()
      ) && (score < 200 || score > 1300)
    ) {
      setError("MCA scores must be from 200 to 1300.");
      return;
    }
    if (year === "" || !Number.isInteger(parsedYear) || parsedYear < 1900) {
      setError("Enter a valid year.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/students-state-test-scoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: studentId,
          test_name: testName,
          grade: score,
          year_taken: parsedYear,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || "Unable to save this state test score.");
      }

      setGrade("");
      setCustomTest("");
      setMessage(`${testName} score saved.`);
      setYear("");
      onScoreSaved?.();
    } catch (saveError) {
      setError(saveError.message || "Unable to save this state test score.");
    } finally {
      setIsSaving(false);
    }
  };

  const isSat = selectedTest === "SAT";
  const isAct = selectedTest === "ACT";
  const isMCA = ["MCA-READING", "MCA-MATH", "MCA-SCIENCE"].includes(
    selectedTest.toUpperCase()
  );

  return (
    <section className="card state-test-scoring-card">
      <CardTitle title="Input state testing" />
      <form className="state-test-scoring-form" onSubmit={saveScore}>
        <label htmlFor="state-test-name">Test</label>
        <select
          id="state-test-name"
          value={selectedTest}
          onChange={(event) => setSelectedTest(event.target.value)}
          required
        >
          <option value="" disabled>Select a test</option>
          <option value="SAT">SAT</option>
          <option value="ACT">ACT</option>
          <option value="MCA-Reading">MCA-Reading</option>
          <option value="MCA-Math">MCA-Math</option>
          <option value="MCA-Science">MCA-Science</option>
          <option value={CUSTOM_TEST}>Add another test...</option>
        </select>

        {selectedTest === CUSTOM_TEST && (
          <>
            <label htmlFor="state-test-custom-name">New test name</label>
            <input
              id="state-test-custom-name"
              type="text"
              value={customTest}
              onChange={(event) => setCustomTest(event.target.value)}
              maxLength={100}
              placeholder="Enter test name"
              required
            />
          </>
        )}

        <label htmlFor="state-test-grade">Score</label>
        <input
          id="state-test-grade"
          type="number"
          min={isMCA ? "200" : isAct ? "1" : isSat ? "400" : "0"}
          max={isMCA ? "1300" : isAct ? "36" : isSat ? "1600" : "2147483647"}
          step={isSat ? "10" : "1"}
          value={grade}
          onChange={(event) => setGrade(event.target.value)}
          placeholder={isMCA ? "200-1300" : isAct ? "1-36" : isSat ? "400-1600, by 10" : "Enter score"}
          required
        />

        <label htmlFor="state-test-year">Year</label>
        <input
          id="state-test-year"
          type="number"
          min="1900"
          step="1"
          value={year}
          onChange={(event) => setYear(event.target.value)}
          placeholder="Enter year"
          required
        />

        {error && <p className="error-state" role="alert">{error}</p>}
        {message && <p className="state-test-success" role="status">{message}</p>}
        <button type="submit" className="text-button" disabled={isSaving || !studentId}>
          {isSaving ? "Saving..." : "Save score"}
        </button>
      </form>
    </section>
  );
}
