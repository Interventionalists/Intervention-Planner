import { useEffect, useState } from "react";
import { themePresets } from "../data";
import { CardTitle, PageHeading } from "../components/PageElements";
import { apiFetch } from "../api";

const colorLabels = ["Primary", "Secondary", "Tertiary"];
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

//each scope maps to the backend reset scope and the local layout cache keys
//TileWorkspace writes, which must be cleared too or the old layout reappears.
const layoutResets = {
  dashboard: {
    label: "Reset dashboard",
    done: "Dashboard reset to the default layout.",
    cachePrefix: "tile-layout-dashboard-",
  },
  students: {
    label: "Reset all student pages",
    done: "All student pages reset to the default layout.",
    cachePrefix: "tile-layout-student-",
  },
};

function clearCachedLayouts(prefix) {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    //no local cache available; nothing to clear.
  }
}

function SettingsPage({
  theme,
  savedTheme,
  hasSavedTheme,
  setTheme,
  onSaveTheme,
  schoolLogo,
  onSaveLogo,
  canManageTheme,
  loadError,
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [logoUrl, setLogoUrl] = useState(schoolLogo || "");
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoSaveError, setLogoSaveError] = useState("");
  const [logoSavedNotice, setLogoSavedNotice] = useState("");
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [resettingLayout, setResettingLayout] = useState(null);
  const [layoutResetError, setLayoutResetError] = useState("");
  const [layoutResetNotice, setLayoutResetNotice] = useState("");
  const hasChanges = JSON.stringify(theme) !== JSON.stringify(savedTheme);
  const hasLogoChanges = logoUrl.trim() !== (schoolLogo || "");
  const normalizedLogoUrl = logoUrl.trim();
  const isLogoUrlValid = (() => {
    if (!normalizedLogoUrl) return true;
    try {
      const url = new URL(normalizedLogoUrl);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    setLogoUrl(schoolLogo || "");
    setLogoPreviewError(false);
  }, [schoolLogo]);

  const updateColor = (index, color) => {
    setTheme(theme.map((currentColor, colorIndex) =>
      colorIndex === index ? color : currentColor
    ));
    setSaveError("");
    setSavedNotice("");
  };

  const saveTheme = async () => {
    setSaving(true);
    setSaveError("");
    setSavedNotice("");
    try {
      await onSaveTheme(theme);
      setSavedNotice("Color scheme saved.");
    } catch (error) {
      setSaveError(error.message || "Unable to save your color scheme.");
    } finally {
      setSaving(false);
    }
  };

  const saveLogo = async () => {
    setSavingLogo(true);
    setLogoSaveError("");
    setLogoSavedNotice("");
    try {
      await onSaveLogo(normalizedLogoUrl);
      setLogoSavedNotice("School logo saved.");
    } catch (error) {
      setLogoSaveError(error.message || "Unable to save the school logo.");
    } finally {
      setSavingLogo(false);
    }
  };

  const revertTheme = () => {
    setTheme(savedTheme);
    setSaveError("");
    setSavedNotice("");
  };

  const resetLayout = async (scope) => {
    const reset = layoutResets[scope];
    const confirmed = window.confirm(
      scope === "students"
        ? "Reset the layout of every student page to the default? Your custom arrangements will be lost."
        : "Reset your dashboard to the default layout? Your custom arrangement will be lost."
    );
    if (!confirmed) return;

    setResettingLayout(scope);
    setLayoutResetError("");
    setLayoutResetNotice("");
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/layouts?scope=${scope}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error(`Reset failed (${response.status}).`);
      }
      clearCachedLayouts(reset.cachePrefix);
      setLayoutResetNotice(reset.done);
    } catch (error) {
      setLayoutResetError(error.message || "Unable to reset the layout.");
    } finally {
      setResettingLayout(null);
    }
  };

  const revertLogo = () => {
    setLogoUrl(schoolLogo || "");
    setLogoPreviewError(false);
    setLogoSaveError("");
    setLogoSavedNotice("");
  };

  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Customize Interventioner"
        subtitle={
          canManageTheme
            ? "Choose a three-color scheme to match your school."
            : "Your school's color scheme is managed by an administrator."
        }
      />
      <div className="settings-grid">
        {canManageTheme && (
          <div className="card">
            <CardTitle title="Color scheme" />
            <div className="theme-grid">
              {themePresets.map((preset) => {
                const selected = JSON.stringify(theme) === JSON.stringify(preset.colors);
                return (
                  <button
                    className={`theme-option ${selected ? "selected" : ""}`}
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setTheme(preset.colors);
                      setSaveError("");
                      setSavedNotice("");
                    }}
                  >
                    <div className="swatches">
                      {preset.colors.map((color) => (
                        <span key={color} style={{ background: color }} />
                      ))}
                    </div>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="custom-theme">
              <h3>Custom colors</h3>
              <div className="custom-color-grid">
                {colorLabels.map((label, index) => (
                  <label className="custom-color-field" key={label}>
                    <span>{label}</span>
                    <input
                      type="color"
                      value={theme[index]}
                      onChange={(event) => updateColor(index, event.target.value)}
                      aria-label={`${label} color`}
                    />
                    <span className="color-value">{theme[index].toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>
            {loadError && <p className="theme-message error-state" role="alert">{loadError}</p>}
            {saveError && <p className="theme-message error-state" role="alert">{saveError}</p>}
            {savedNotice && <p className="theme-message" role="status">{savedNotice}</p>}
            <div className="theme-actions">
              <button
                className="theme-revert-button"
                type="button"
                onClick={revertTheme}
                disabled={!hasChanges || saving}
              >
                Revert changes
              </button>
              <button
                className="theme-save-button"
                type="button"
                onClick={saveTheme}
                disabled={(!hasChanges && hasSavedTheme) || saving}
              >
                {saving ? "Saving..." : "Save color scheme"}
              </button>
            </div>
          </div>
        )}

        <div className="card style-preview">
          <CardTitle title="Preview" />
          <div className="preview-shell">
            <div className="preview-nav" />
            <div className="preview-content">
              <div />
              <div />
              <div />
            </div>
          </div>
        </div>
        <div className="card">
          <CardTitle title="Page layouts" />
          <p className="muted">
            Put your tiles back in the default arrangement. This only affects
            your own account.
          </p>
          {layoutResetError && (
            <p className="theme-message error-state" role="alert">{layoutResetError}</p>
          )}
          {layoutResetNotice && (
            <p className="theme-message" role="status">{layoutResetNotice}</p>
          )}
          <div className="theme-actions">
            {Object.entries(layoutResets).map(([scope, reset]) => (
              <button
                className="theme-revert-button"
                disabled={resettingLayout !== null}
                key={scope}
                onClick={() => resetLayout(scope)}
                type="button"
              >
                {resettingLayout === scope ? "Resetting..." : reset.label}
              </button>
            ))}
          </div>
        </div>
        {canManageTheme && (
          <>
            <div className="card school-logo-settings">
              <CardTitle title="School logo" />
              <label className="school-logo-url-field">
                <span>Logo image URL</span>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(event) => {
                    setLogoUrl(event.target.value);
                    setLogoPreviewError(false);
                    setLogoSaveError("");
                    setLogoSavedNotice("");
                  }}
                  placeholder="https://example.com/school-logo.png"
                  maxLength={2048}
                  aria-invalid={!isLogoUrlValid}
                />
              </label>
              <p className="muted">
                Paste a public image URL. Leave it blank to remove the current logo.
              </p>
              {logoSaveError && (
                <p className="theme-message error-state" role="alert">{logoSaveError}</p>
              )}
              {logoSavedNotice && (
                <p className="theme-message" role="status">{logoSavedNotice}</p>
              )}
              <div className="theme-actions">
                <button
                  className="theme-revert-button"
                  type="button"
                  onClick={revertLogo}
                  disabled={!hasLogoChanges || savingLogo}
                >
                  Revert logo
                </button>
                <button
                  className="theme-save-button"
                  type="button"
                  onClick={saveLogo}
                  disabled={!hasLogoChanges || !isLogoUrlValid || savingLogo}
                >
                  {savingLogo ? "Saving..." : "Save logo"}
                </button>
              </div>
            </div>
            <div className="card school-logo-preview-card">
              <CardTitle title="Logo preview" />
              <div className="school-logo-preview" aria-live="polite">
                {normalizedLogoUrl && isLogoUrlValid && !logoPreviewError ? (
                  <img
                    key={normalizedLogoUrl}
                    src={normalizedLogoUrl}
                    alt="Preview of the school logo"
                    onError={() => setLogoPreviewError(true)}
                  />
                ) : logoPreviewError ? (
                  <span role="status">Could not load this logo. Check the URL.</span>
                ) : (
                  <span>{normalizedLogoUrl ? "Enter a valid image URL." : "No logo selected."}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default SettingsPage;
