import { useEffect, useState } from "react";
import { Save } from "lucide-react";

export default function ChangeStudentNameTile({ student, onSave, isSaving }) {
  const [firstName, setFirstName] = useState(student.first_name || "");
  const [lastName, setLastName] = useState(student.last_name || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setFirstName(student.first_name || "");
    setLastName(student.last_name || "");
    setMessage("");
    setError("");
  }, [student.id, student.first_name, student.last_name]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const result = await onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });
    if (result?.error) {
      setError(result.error);
      return;
    }
    setMessage("Student name updated.");
  };

  return (
    <section className="card profile-name-card" aria-label="Change student name">
      <h2>Student name</h2>
      <form className="profile-name-form" onSubmit={submit}>
        <label>
          First name
          <input
            autoComplete="given-name"
            maxLength={100}
            onChange={(event) => setFirstName(event.target.value)}
            required
            value={firstName}
          />
        </label>
        <label>
          Last name
          <input
            autoComplete="family-name"
            maxLength={100}
            onChange={(event) => setLastName(event.target.value)}
            required
            value={lastName}
          />
        </label>
        {error && <p className="error-state" role="alert">{error}</p>}
        {message && <p className="success-state" role="status">{message}</p>}
        <button className="session-primary-button" disabled={isSaving} type="submit">
          <Save aria-hidden="true" size={16} />
          {isSaving ? "Saving…" : "Save name"}
        </button>
      </form>
    </section>
  );
}
