import { useState } from "react";
import { themePresets } from "../data";
import { CardTitle, PageHeading } from "../components/PageElements";

const colorLabels = ["Primary", "Secondary", "Tertiary"];

function SettingsPage({
  theme,
  savedTheme,
  hasSavedTheme,
  setTheme,
  onSaveTheme,
  loadError,
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const hasChanges = JSON.stringify(theme) !== JSON.stringify(savedTheme);

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

  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Customize Interventioner"
        subtitle="Choose a three-color scheme to match your school."
      />
      <div className="settings-grid">
        <div className="card">
          <CardTitle title="Color scheme" />
          <div className="theme-grid">
            {themePresets.map((preset) => {
              const selected = JSON.stringify(theme) === JSON.stringify(preset.colors);
              return (
                <button
                  className={`theme-option ${selected ? "selected" : ""}`}
                  key={preset.name}
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
          <button
            className="theme-save-button"
            type="button"
            onClick={saveTheme}
            disabled={(!hasChanges && hasSavedTheme) || saving}
          >
            {saving ? "Saving..." : "Save color scheme"}
          </button>
        </div>

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
      </div>
    </>
  );
}

export default SettingsPage;
