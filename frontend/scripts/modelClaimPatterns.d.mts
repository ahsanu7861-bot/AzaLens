/*
 * Types for the shared model-driven-claim vocabulary.
 *
 * The patterns live in a plain `.mjs` module because `checkBrandAssets.mjs`
 * runs under bare Node with no TypeScript step, while the rendered-DOM test and
 * the visual spec are TypeScript. This declaration lets both sides import the
 * same single owner rather than keeping copies that drift.
 */
export declare const MODEL_DRIVEN_CLAIM_PATTERNS: RegExp[];

/** Every pattern that matches `value`; empty means no public model claim. */
export declare function findModelDrivenClaims(value: unknown): RegExp[];
