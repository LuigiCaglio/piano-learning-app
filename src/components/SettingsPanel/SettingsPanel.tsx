import type { Settings } from '../../settings/useSettings';
import './SettingsPanel.css';

interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, settings, onChange, onClose }: SettingsPanelProps) {
  return (
    <>
      {open && <div className="settings-panel__backdrop" onClick={onClose} />}
      <div className={open ? 'settings-panel settings-panel--open' : 'settings-panel'} role="dialog" aria-label="Settings" aria-hidden={!open}>
        <div className="settings-panel__header">
          <h2>Settings</h2>
          <button type="button" className="settings-panel__close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <label className="settings-panel__row">
          <span>Show note names on keyboard</span>
          <input
            type="checkbox"
            checked={settings.showNoteNames}
            onChange={(e) => onChange({ showNoteNames: e.target.checked })}
          />
        </label>

        <div className="settings-panel__row">
          <span>Theme</span>
          <div className="settings-panel__theme-toggle">
            <button
              type="button"
              className={settings.theme === 'light' ? 'active' : ''}
              onClick={() => onChange({ theme: 'light' })}
            >
              Light
            </button>
            <button
              type="button"
              className={settings.theme === 'dark' ? 'active' : ''}
              onClick={() => onChange({ theme: 'dark' })}
            >
              Dark
            </button>
          </div>
        </div>

        <label className="settings-panel__row">
          <span>Keyboard highlight color</span>
          <input
            type="color"
            value={settings.keyHighlightColor}
            onChange={(e) => onChange({ keyHighlightColor: e.target.value })}
          />
        </label>

        <label className="settings-panel__row">
          <span>Score highlight color</span>
          <input
            type="color"
            value={settings.scoreHighlightColor}
            onChange={(e) => onChange({ scoreHighlightColor: e.target.value })}
          />
        </label>
      </div>
    </>
  );
}
