/*
 * The single owner of the public model-driven-claim vocabulary.
 *
 * AzaLens v1 contains no model, no SDK and no model key: the analysis is
 * deterministic arithmetic and string templates (docs/LLM_DECISION_V1.md §8
 * item 4). Claiming otherwise on a public surface is a truthfulness defect.
 *
 * This list previously existed in three places — the rendered-DOM test, the
 * published-metadata check and the visual spec's pre-shutter assertion — and
 * they had drifted apart. Independent review found the consequence: two copies
 * matched `\bAI\b` case-sensitively, so a public lowercase claim such as
 * "ai analysis", "built with ml" or "powered by an llm" passed every guard.
 *
 * The rationale recorded alongside those patterns was also wrong. It claimed
 * case sensitivity was needed so the guard would not fire on the "ai" inside
 * ordinary words like "Explained". Word boundaries already prevent that: `\b`
 * requires a non-word character on each side, and the "ai" in "Explained" has
 * letters on both sides, so `/\bai\b/i` cannot match it. Case sensitivity was
 * buying nothing and costing coverage.
 *
 * Scope matters as much as the patterns, and it is set by the caller.
 *
 * This module describes wording the product must not **publish**. It says
 * nothing about where such wording may exist in the repository. What is scanned
 * is decided entirely by the values callers pass in: the rendered landing DOM,
 * the parsed page metadata and the manifest branding. Nothing here reads
 * repository source.
 *
 * Historical documentation, explicit negations and unmounted dead code are
 * therefore simply outside the input domain — not exceptions that need granting.
 * Their continued existence, and their wording, is **not required** by anything
 * here. A guard that demanded they keep saying "AI" would convert temporary debt
 * into a permanent dependency and block the planned dead-code cleanup; that is a
 * mistake this file made once and must not repeat.
 */
export const MODEL_DRIVEN_CLAIM_PATTERNS = [
  /* Standalone tokens, case-insensitive. `\b` keeps them out of ordinary words. */
  /\bAIs?\b/i,
  /\bML\b/i,
  /\bLLMs?\b/i,
  /\bGPTs?\b/i,

  /* Phrases. */
  /AI[-\s]powered/i,
  /AI[-\s]driven/i,
  /artificial intelligence/i,
  /machine learning/i,
  /large language model/i,
  /model[-\s]driven/i,
  /neural/i,
];

/**
 * Every pattern that matches `value`. Empty means the text carries no public
 * model-driven claim.
 */
export function findModelDrivenClaims(value) {
  if (typeof value !== "string") return [];
  return MODEL_DRIVEN_CLAIM_PATTERNS.filter((pattern) => pattern.test(value));
}
