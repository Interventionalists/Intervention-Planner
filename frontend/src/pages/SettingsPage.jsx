import { themePresets } from "../data";
import { CardTitle, PageHeading } from "../components/PageElements";

function SettingsPage({ theme, setTheme }) {
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
                  onClick={() => setTheme(preset.colors)}
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
