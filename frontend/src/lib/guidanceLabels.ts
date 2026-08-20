/*
 * Display mapping for the backend's horizon vocabulary.
 *
 * The backend owns the horizon *token* (docs/VERDICT_CONTRACT.md); this module
 * owns its user-facing *text*, and is the only place that text exists. It was
 * extracted from GuidanceVerdict.tsx so the landing demonstration and the
 * analysis workspace cannot drift into two different renderings of the same
 * contract value.
 *
 * Unknown tokens are de-underscored rather than guessed at, so a horizon this
 * mapping has not been taught still reads as itself instead of as a wrong label.
 */
export function horizonLabel(horizon?: string) {
  return horizon === "SWING_2_TO_10_SESSIONS"
    ? "Swing · 2–10 sessions"
    : horizon?.replaceAll("_", " ") || "Horizon unavailable";
}
