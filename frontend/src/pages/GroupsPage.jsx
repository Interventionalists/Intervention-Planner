import { useEffect, useState } from "react";
import { PageHeading } from "../components/PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function GroupsPage({ user }) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const canCreateGroups = ["admin", "interventionist"].includes(user?.role);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError("");

    apiFetch(`${API_BASE_URL}/groups-fetch`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.detail || "Unable to load groups.");
        }
        if (!Array.isArray(result?.groups)) {
          throw new Error("The groups response has an unexpected format.");
        }
        setGroups(result.groups);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setLoadError(error.message || "Unable to load groups.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadKey]);

  const createGroup = async (event) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    setIsSaving(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/groups-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), purpose: purpose.trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || "Unable to create group.");
      }
      if (!result?.group) {
        throw new Error("The create group response has an unexpected format.");
      }
      setGroups((currentGroups) => [result.group, ...currentGroups]);
      setName("");
      setPurpose("");
      setSuccessMessage("Group created.");
    } catch (error) {
      setFormError(error.message || "Unable to create group.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Groups"
        title="Intervention groups"
        subtitle="Create and review intervention groups at your school."
      />

      {canCreateGroups && (
        <section className="card groups-create-card">
          <h2>Create a group</h2>
          <form className="groups-create-form" onSubmit={createGroup}>
            <label>
              Group name
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Reading support"
              />
            </label>
            <label>
              Purpose
              <textarea
                required
                rows={3}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Describe the group's intervention focus"
              />
            </label>
            {formError && <p className="assignment-error" role="alert">{formError}</p>}
            {successMessage && <p className="assignment-success" role="status">{successMessage}</p>}
            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create group"}
            </button>
          </form>
        </section>
      )}

      <section className="student-list-section groups-list-section">
        <h2>School groups</h2>
        {isLoading ? (
          <div className="card" role="status">Loading groups...</div>
        ) : loadError ? (
          <div className="card" role="alert">
            <p>{loadError}</p>
            <button
              className="text-button"
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </div>
        ) : groups.length ? (
          <div className="groups-list">
            {groups.map((group) => (
              <article className="card group-card" key={group.public_id || group.id}>
                <div>
                  <h3>{group.name}</h3>
                  <p>{group.purpose}</p>
                </div>
                <span className="group-owner">
                  {group.interventionist_name || (group.interventionist ? "Assigned" : "Unassigned")}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="card">
            <p>No intervention groups have been created for this school yet.</p>
          </div>
        )}
      </section>
    </>
  );
}

export default GroupsPage;
