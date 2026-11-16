import { useEffect, useState } from "react";
import { Save } from "lucide-react";

function getParentName(student) {
  return student.parent_name ?? student.parent ?? student.guardian_name ?? student.guardian ?? "";
}

export default function ChangeParentNameTile({ student, onSave, isSaving }) {
  const [parentName, setParentName] = useState(() => getParentName(student));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setParentName(getParentName(student));
    setMessage("");
    setError("");
  }, [student.id, student.parent_name, student.parent, student.guardian_name, student.guardian]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const result = await onSave({ parent_name: parentName.trim() || null });
    if (result?.error) {
      setError(result.error);
      return;
    }
    setMessage("Parent or guardian name updated.");
  };

  return (
    <section className="card profile-name-card" aria-label="Change parent or guardian name">
      <h2>Parent or guardian name</h2>
      <form className="profile-name-form" onSubmit={submit}>
        <label>
          Name
          <input
            autoComplete="name"
            maxLength={200}
            onChange={(event) => setParentName(event.target.value)}
            placeholder="Enter a parent or guardian name"
            value={parentName}
          />
        </label>
        <p className="profile-name-hint">Leave blank to clear the saved name.</p>
        {error && <p className="error-state" role="alert">{error}</p>}
        {message && <p className="success-state" role="status">{message}</p>}
        <button className="session-primary-button" disabled={isSaving} type="submit">
          <Save aria-hidden="true" size={16} />
          {isSaving ? "Saving…" : "Save parent name"}
        </button>
      </form>
    </section>
  );
}
