import { useState } from "react";
import { SquarePen } from "lucide-react";
import { CardTitle } from "../components/PageElements";

const exampleScores = {
  English: 80.56,
  Math: 30.51,
  Reading: 87.67,
  Science: 70.32,
  Band: 70.4,
  Art: 52.3,
  "P.E.": 90.51,
};

export default function ChangeStudentGradeTile() {
  const [isEditing, setIsEditing] = useState(false);
  const [displayedScores, setDisplayedScores] = useState(exampleScores);
  const [draftScores, setDraftScores] = useState(exampleScores);

  const startEditing = () => {
    setDraftScores(
      Object.fromEntries(
        Object.entries(displayedScores).map(([subject, score]) => [
          subject,
          String(score),
        ])
      )
    );
    setIsEditing(true);
  };

  const saveGrades = (event) => {
    event.preventDefault();
    const updatedScores = Object.fromEntries(
      Object.entries(draftScores).map(([subject, score]) => [
        subject,
        score.trim() === "" ? null : Number(score),
      ])
    );
    setDisplayedScores(updatedScores);
    setIsEditing(false);
  };

  return (
    <section className="card profile-grades-card">
      <CardTitle
        title="Grades"
        action={
          !isEditing && (
            <button
              type="button"
              aria-label="Edit grades"
              title="Edit grades"
              onClick={startEditing}
              style={{
                display: "grid",
                placeItems: "center",
                width: 26,
                height: 26,
                padding: 0,
                border: 0,
                borderRadius: 5,
                background: "transparent",
                color: "var(--primary)",
                cursor: "pointer",
              }}
            >
              <SquarePen size={14} />
            </button>
          )
        }
      />
      {isEditing ? (
        <form onSubmit={saveGrades}>
          <div className="grade-list">
            {Object.entries(draftScores).map(([subject, score]) => (
              <label
                key={subject}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>{subject}</span>
                <span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    aria-label={`${subject} grade`}
                    value={score}
                    onChange={(event) =>
                      setDraftScores((current) => ({
                        ...current,
                        [subject]: event.target.value,
                      }))
                    }
                    style={{
                      width: 76,
                      padding: "5px 7px",
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      textAlign: "right",
                    }}
                  />{" "}
                  %
                </span>
              </label>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              style={{ cursor: "pointer" }}
            >
              Cancel
            </button>
            <button type="submit" style={{ cursor: "pointer" }}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="grade-list">
          {Object.entries(displayedScores).map(([subject, score]) => {
            const numericScore = Number(score);
            const hasScore = score !== null && Number.isFinite(numericScore);
            return (
              <div
                key={subject}
                className={hasScore && numericScore < 60 ? "grade-alert" : ""}
              >
                <span>{subject}</span>
                <strong>{hasScore ? `${numericScore.toFixed(2)}%` : "—"}</strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
