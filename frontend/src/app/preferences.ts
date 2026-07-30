export const SETTINGS_STORAGE_KEY = "azalens-settings";

export type MotionPreference = "system" | "reduced";
export type DefaultWorkspace =
  | "overview"
  | "technical"
  | "fundamentals"
  | "risk"
  | "shariah"
  | "thesis";

export type LocalSettings = {
  motion: MotionPreference;
  defaultWorkspace: DefaultWorkspace;
};

export const defaultLocalSettings: LocalSettings = {
  motion: "system",
  defaultWorkspace: "overview",
};

const workspaceValues = new Set<DefaultWorkspace>([
  "overview",
  "technical",
  "fundamentals",
  "risk",
  "shariah",
  "thesis",
]);

export function readLocalSettings(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): LocalSettings {
  try {
    const parsed = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) || "{}");

    return {
      motion: parsed.motion === "reduced" ? "reduced" : "system",
      defaultWorkspace: workspaceValues.has(parsed.defaultWorkspace)
        ? parsed.defaultWorkspace
        : "overview",
    };
  } catch {
    return defaultLocalSettings;
  }
}

export function writeLocalSettings(
  settings: LocalSettings,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  applyLocalSettings(settings);
}

export function applyLocalSettings(settings: LocalSettings) {
  document.documentElement.dataset.motion = settings.motion;
}
