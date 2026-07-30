import { describe, expect, it } from "vitest";

import {
  defaultLocalSettings,
  readLocalSettings,
  SETTINGS_STORAGE_KEY,
} from "./preferences";

describe("local settings", () => {
  it("uses honest defaults when no settings are saved", () => {
    const storage = { getItem: () => null };
    expect(readLocalSettings(storage)).toEqual(defaultLocalSettings);
  });

  it("accepts known settings", () => {
    const storage = {
      getItem: (key: string) =>
        key === SETTINGS_STORAGE_KEY
          ? JSON.stringify({
              motion: "reduced",
              defaultWorkspace: "shariah",
            })
          : null,
    };

    expect(readLocalSettings(storage)).toEqual({
      motion: "reduced",
      defaultWorkspace: "shariah",
    });
  });

  it("rejects malformed and unknown values", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          motion: "fast",
          defaultWorkspace: "signals",
        }),
    };

    expect(readLocalSettings(storage)).toEqual(defaultLocalSettings);
  });
});
