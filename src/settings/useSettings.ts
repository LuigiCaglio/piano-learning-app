import { useEffect, useState } from 'react';

export interface Settings {
  theme: 'light' | 'dark';
  showNoteNames: boolean;
  keyHighlightColor: string;
  scoreHighlightColor: string;
}

const STORAGE_KEY = 'piano-learning-settings';

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  showNoteNames: false,
  keyHighlightColor: '#2f7a3d',
  scoreHighlightColor: '#2f7a3d',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Persisted user preferences for appearance (theme, highlight colors, note-name labels).
 * Applies the theme to <html data-theme> directly here, rather than leaving that to a consumer,
 * so it always stays in sync with the stored value -- including on first load, before any
 * settings UI has even rendered. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const updateSettings = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }));

  return { settings, updateSettings };
}
