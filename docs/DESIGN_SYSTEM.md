# AzaLens Design System

**Date:** 2026-07-30 · Target: a design that reads as one of the most serious financial research instruments in the world.
Grounded in what actually exists at `92d483c`: `frontend/src/index.css` (the live token source), `frontend/src/design/*.ts` (stale, see below), the page components, `e2e/visual.spec.ts` (4 snapshots), `scripts/checkContrast.mjs`, `scripts/checkPerformanceBudget.mjs`.

---

## 1. Honest current critique — why it is a 6.4

Scores are per criterion, with the concrete reason. "9+" in each row describes what would earn it — buildable specifics, not adjectives.

| Criterion | Score | Why this score | What a 9+ looks like |
|---|---|---|---|
| Visual hierarchy | 7.0 | Analysis page layers well (sticky header → tabs → workspace). But every card carries similar visual weight; the single most important element on screen (the verdict / the withheld notice / the AAOIFI status) does not dominate. | One unmistakable focal element per screen; price/verdict/status set in a display size no other element approaches. |
| Typography | 6.0 | Inter + Space Grotesk + JetBrains Mono is a competent, free stack. But the scale is timid (most text sits at 12–14px with similar weights), numerals are not consistently tabular, and `design/typography.ts` documents a *different* font (Sora) than the app ships — two sources of truth. | A documented modular scale; hero numerals with `font-variant-numeric: tabular-nums`; one token source. |
| Colour | 6.0 | The night/day system in `index.css` is solid work (semantic roles, AA-checked by `checkContrast.mjs`). But the brand cyan `#06b6d4` and positive `#10b981` are **stock Tailwind cyan-500/emerald-500** — the palette of ten thousand dashboards. And the landing page uses a *third* palette (emerald/slate, dark-only). | A proprietary palette anchored to the actual logo (navy `#0B1220`, teal `#0FB5A5`), used identically on every surface including landing. |
| Spacing rhythm | 7.0 | Consistent card padding and gaps inside the app; `spacing.ts` exists but is partly decorative since Tailwind utilities are used ad hoc. | A 4px-base rhythm actually enforced; section spacing tokens used, not re-invented per page. |
| Data density | 6.0 | Cards are airy to a fault — a professional instrument shows more per viewport. Indicator values sit in large padded boxes; the watchlist/portfolio tables are generous rows of little information. | Denser tabular surfaces with strong alignment; density toggle later. |
| Information design | 7.0 | The honest-state system (Unavailable / Review required / withheld) is conceptually excellent and already worded well. Visually, these states are plain text in muted grey — the *most important* messages have the *least* visual identity. | Honest states designed as first-class components with icon, colour and consistent anatomy (see §5). |
| Motion | 5.5 | A few transitions and spinners; reduced-motion preference exists and is honoured. No purposeful motion language, no state-change choreography. | The three-phase plan in §7. |
| Accessibility | 7.5 | Genuinely above average: skip link, route focus management, `role="status"`/`aria-live`, focus-trapped dialog, contrast CI gate, reduced-motion setting. Gaps: focus outlines inconsistent on custom buttons; landing page ignores all of it. | §9 checklist applied everywhere, landing included. |
| Distinctiveness | 4.0 | Nothing on screen is recognisably AzaLens. Remove the wordmark and it could be any Tailwind trading dashboard. The one distinctive *idea* — the withheld verdict — has no distinctive *form*. | A signature visual for the gate/verdict (§4); the aperture motif from the logo used structurally. |
| Mobile | 6.5 | Grids collapse sensibly; the analysis page works on mobile snapshots. But density and tab ergonomics on small screens are unrefined; landing hero at 6xl type overwhelms small viewports. | §8. |

**Weighted overall: ~6.4.** The gap to 9+ is not craft in any one component — it is (a) no ownable identity, (b) three disagreeing palettes across landing/app/token-files, and (c) the product's moral core (honest states, the withheld verdict) having no visual signature.

---

## 2. Design position

**AzaLens should feel like a scientific instrument built by people who fear God more than they fear boring you.** Calm, precise, evidentiary. The opposite of a hype trading app: no pulsing greens, no rocket motifs, no urgency. The emotional register is *a well-lit research library at night* — deep navy, disciplined type, one jewel-like accent.

**Identity anchor: keep and build on the existing logo.** The hexagonal aperture in navy `#0B1220` and teal `#0FB5A5` is genuinely good: an aperture is a *lens* (the name), a hexagon echoes geometric Islamic ornament without pastiche, and the navy/teal pair is distinctive in a category drowning in green/purple. Do not replace it. Instead, promote it from a logo to a system:

- **The aperture as a structural motif.** The hexagonal aperture becomes the state-icon of the product: fully open = verdict unlocked; partially closed = review required; closed = withheld. One SVG, three states. This gives the compliance gate — the product's soul — a signature visual no competitor has, and it *encodes honesty* (the aperture only opens when the evidence allows).
- **The palette derives from the logo**, replacing Tailwind defaults (§3).
- **Name the system "Aperture"** internally so tokens/components have a home.

What it must never feel like: a casino, a signals channel, a crypto dashboard, or a generic SaaS template. Guardrail rule: **no visual element may imply certainty the data does not support** (Rules 6, 9, 10, 11) — colour, size and motion all obey the evidence, never decorate it.

---

## 3. Token system

Single source of truth: **CSS custom properties in `index.css`**, mirrored (generated, not hand-copied) into `design/tokens.ts` for TypeScript consumers. The current `design/colors.ts`/`typography.ts` are stale and must be deleted or regenerated — two disagreeing sources is a Rule-7 problem in miniature.

### 3.1 Colour — semantic roles, both themes

All pairs below are chosen to pass WCAG AA (≥4.5:1 body, ≥3:1 large text/UI) and must be added to `checkContrast.mjs`'s checked pairs before shipping.

| Token | Role | Night | Day |
|---|---|---|---|
| `--az-canvas` | page background | `#0A0F1A` (logo-navy derived) | `#F7F9FC` |
| `--az-surface` | cards | `#101726` | `#FFFFFF` |
| `--az-surface-raised` | popovers, sticky bars | `#16203380` on blur | `#FFFFFF` + shadow |
| `--az-ink` | primary text | `#F2F6FA` | `#0E1B2C` |
| `--az-ink-soft` | secondary | `#9FAEC2` | `#44546A` |
| `--az-ink-muted` | tertiary/captions | `#75849B` | `#5E6E86` |
| `--az-stroke` | hairlines | `rgba(255,255,255,.08)` | `rgba(14,27,44,.12)` |
| `--az-brand` | **AzaLens teal** (from logo `#0FB5A5`) | `#14C2B0` | `#0B857A` |
| `--az-positive` | favourable *evidence* (never "buy") | `#3ECF8E` | `#0E7A52` |
| `--az-caution` | review / stale / partial | `#E8B45A` | `#8A5A12` |
| `--az-critical` | violated / non-compliant / error | `#F0647A` | `#B02A40` |
| `--az-shariah` | Shariah surfaces accent | `#8FA8FF` (calm indigo, replacing purple) | `#3D5CC4` |
| `--az-neutral-data` | price/series ink | `#B9C6D8` | `#3E4E63` |

Rationale for the change: today's brand cyan reads generic; the logo teal is ownable and sits beautifully on navy. `--az-shariah` moves from violet to a dignified indigo so the Shariah workspace feels *set apart and calm*, not "premium feature purple".

**Honesty rules encoded in colour:**
- Price up/down uses `--az-neutral-data` with **+/− signs and small arrows**, *not* green/red fills — direction of price is a fact, not a judgement. Green/amber/red are reserved for *evidence quality and compliance states* only. (This alone visually separates AzaLens from every hype app.)
- `--az-positive` is never used on a whole card or a CTA; it appears only on discrete evidence chips and PASS badges.
- Withheld/unavailable states are **caution-amber or neutral, never red** — absence of evidence is not danger.

### 3.2 Data-visualisation palette
Series lines: `--az-neutral-data`; the candle/area chart is monochrome ink with the current session highlighted in `--az-brand`. Bands (Bollinger, ranges): 8–12% opacity brand fills. Threshold/invalidation lines: `--az-caution` dashed. Never a green up-candle / red down-candle scheme in analytical charts — use hollow/filled monochrome candles (hollow = up), which professionals read instantly and which keeps colour reserved for judgement-free honesty. Annotate staleness directly on the chart ("last completed session" tag) rather than letting a stale line look live.

### 3.3 Typography
Free fonts only (already loaded from Google Fonts; later self-host the WOFF2s in `/public/fonts` for performance and to remove the third-party request — free, ~100KB, one afternoon).

- **Display / numerals: Space Grotesk** (600/700) — keep it; it has instrument-panel character.
- **Body / UI: Inter** (400/500/600) with `font-feature-settings: "tnum" 1` on every numeric cell.
- **Mono: JetBrains Mono** for request IDs, raw values, methodology version strings.

Scale (rem): `0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25 / 3 / 4`. Two rules that create the "professional" feel cheaply: captions/eyebrows at 0.75rem **600 tracking +0.08em**, and one hero numeral per screen at ≥2.25rem Space Grotesk — nothing between 1.375 and 2.25 so hierarchy cannot blur.

### 3.4 Space, radius, elevation, borders
- Space: 4px base; component paddings from {12, 16, 20, 24}; section gaps {24, 32, 48}. Kill ad-hoc values in new work.
- Radius: tighten from today's very round 1.5rem cards to **12px cards / 8px controls / 6px chips / full pills**. Rounder = friendlier = less instrument; this single change shifts the register noticeably.
- Elevation: two levels only — `card` (1px hairline + 0 1px 2px shadow) and `raised` (popover: 0 8px 30px). Delete the decorative `brandGlow`/floating shadows for data surfaces; glow implies excitement.
- Borders carry structure in night theme (shadows barely read on navy); shadows carry it in day theme.

---

## 4. Signature moments (what makes it unmistakably AzaLens)

1. **The Aperture Gate.** The verdict area is always headed by the hexagonal aperture icon: open (brand teal) when unlocked; part-closed (amber) for review; closed (amber, not red) when withheld, with the sentence "Compliance comes before the verdict." Same component everywhere a verdict could appear. This is the moment a Mufti, a lawyer, or a trader remembers.
2. **The Evidence Ledger.** Supporting and opposing evidence rendered as a two-column ledger with explicit counts ("6 supporting · 2 opposing · 3 unavailable") — bookkeeping, not vibes. Unavailable evidence is *listed*, not hidden.
3. **Truth chips.** One standardized chip anatomy for every data state: `dot + label + age` ("Fresh · 2m", "Cached · 18m", "Stale · review", "Unavailable"). Used on quotes, history, Shariah, fundamentals — the same four shapes everywhere teach users to read honesty at a glance.

---

## 5. Component specifications

Every component below must define all of: **default / loading (skeleton, not spinner) / empty / partial / stale / unavailable / withheld / error**. Honest states are first-class: same design investment as the happy path.

- **Verdict card (Overview/Thesis).** Aperture state icon → status line → directional lean in plain words → confidence with its basis ("evidence agreement 7/9") → invalidation summary (INTACT/VIOLATED/REVIEW chip with the rule it tests) → "what would change this". Withheld variant replaces everything below the aperture with the withheld explanation + link to Shariah workspace. Never a solid green/red fill; the card stays surface-coloured with only chips carrying state colour.
- **Indicator card.** Name + tabular value + one-line meaning + evidence-direction chip; unavailable variant keeps the card in place with "Unavailable — {reason}" so the layout never silently reflows around missing truth.
- **Shariah panel** (most important surface; see Phase 0): status hero (aperture + Compliant/Non-compliant/Review required in display type + AAOIFI badge + confidence + last-checked truth chip) → screen grid (business activity / financial screen, PASS/FAIL/Review) → ratio rows with formatted values or "Unavailable" → **Purification section**: what purification is (two sentences), the provider rate or "Unavailable", and the honest note that AzaLens reports but does not calculate a personal obligation → methodology footer: AAOIFI version, staleness rule (24h cache / 7-day stale), link to the Methodology page, "not a fatwa" line. Indigo accent, generous quiet spacing — this page should feel like the most carefully made room in the product.
- **Six workspaces** share one grid template (12-col, 24px gutters), one card anatomy, one truth-chip system; only the accent differs (Shariah = indigo, others = brand teal).
- **Watchlist / Portfolio.** True tables (aligned tabular numerals, hairline rows, 40px row height), not stacked cards; empty state teaches the first action; per-row link into analysis.
- **Scanner results.** Observation rows with tone-dot + label + detail; the disclaimer visually attached to results (not a distant footnote); UNAVAILABLE symbols listed inline with reason.
- **Dashboard.** Keeps its honest minimalism; upgrade visual quality of the two real cards rather than adding fabricated ones.
- **Settings.** Current honesty labels are right; give "Planned for accounts phase" chips the standard truth-chip anatomy.
- **Search.** Command-palette style (⌘K), equities-only note in the footer of the popover, recent symbols local-only.
- **Error states.** Human sentence + requestId in mono + retry; never a raw provider message.

---

## 6. Landing page (rebuild, Phase 0)

Same tokens and theme system as the app (respecting day theme and reduced-motion), footer with disclaimers, and the product preview replaced by the truth: a real screenshot-style composition showing **a withheld verdict beside a compliant one** — the honest gate *is* the marketing. Remove "Verdict: BUY", "AI confidence 92%", and the fake trade plan entirely (Rules 6/10 violations; see audit V8). Headline direction: "Evidence first. Shariah always. — Research-grade stock analysis that refuses to guess."

---

## 7. Motion — three phases, all gated by reduced-motion

Every phase honours both `prefers-reduced-motion` and the user's stored setting (already implemented in preferences): reduced = opacity-only, ≤120ms, zero translation. Motion must never delay data or dramatize certainty.

- **(a) Foundational (ship with Phase 1):** 150–250ms opacity/4px-rise on card entry; skeleton shimmer (opacity pulse only); workspace tab crossfade (already exists as `az-workspace-enter` — standardize it); focus-visible transitions.
- **(b) Polish (Phase 3):** staggered evidence-ledger rows (30ms steps, max 8); truth-chip state changes crossfade; number tick on price refresh (no green/red flash).
- **(c) Signature (last):** the Aperture opening/closing when gate state resolves — a single 400ms ease-out blade animation; static open/closed frames under reduced motion. This is the only theatrical moment in the product, and it dramatizes *honesty*, not opportunity.

---

## 8. Mobile and responsive

Breakpoints 480/768/1080/1440. Analysis on mobile: sticky compact header (symbol + price + aperture state), workspace tabs as a scrollable segmented control with edge-fade affordance, cards single-column with density preserved (don't inflate paddings on small screens — professionals use phones too). Tables become two-line rows, never horizontally scrolling pages (individual wide tables may scroll internally). Landing hero type capped at 2.25rem on small screens. Touch targets ≥44px (already respected in ProFeatureWrapper's sizing utility — generalize it).

---

## 9. Accessibility (requirement, not aspiration)

Keep and extend what exists (skip link, focus manager, aria-live, dialog focus trap, contrast CI). Additions: visible 2px `--az-ring` focus on **every** interactive element including landing; all state colours paired with icon/text (never colour-only meaning — the truth chips guarantee this); charts get text summaries (`aria-label` with latest value + change); tab order audit on the workspace tabs; `checkContrast.mjs` extended to the new palette pairs and made to fail on any unchecked new token.

---

## 10. Implementation plan — impact per effort

**Phase 0 — "specialist-ready" (small, ship before the Mufti/lawyer meetings; no accounts needed):**
1. Landing rebuild on app tokens: remove BUY/92% preview, show withheld-vs-compliant composition, add disclaimer footer + Methodology link. *(Biggest credibility delta of the entire plan.)*
2. Shariah workspace upgrade: status hero with aperture (static SVG is enough now), Purification section, methodology footer. *(What the Mufti will actually look at.)*
3. Remove the PRO badge/upsell.
4. Title → "AzaLens — Evidence-first stock research"; favicon/aperture consistency.
5. Analysis page: promote the verdict/withheld card to visual primacy (display-size status, aperture icon).
   *Visual snapshots to update: all 4 in `e2e/visual.spec.ts-snapshots` (analysis-overview day/night × desktop/mobile). Add 2 new: shariah workspace day/night.*

**Phase 1 — token migration (before new features):** new palette + radii + type scale in `index.css`; delete/regenerate `design/*.ts`; extend contrast script; app-wide sweep. *(Mechanical; every later phase gets cheaper.)*

**Phase 2 — truth-chip and state system:** one chip component + eight-state pattern across all cards; error-state anatomy. *(This is where 6.4→8 happens.)*

**Phase 3 — density + tables + motion (a)(b):** watchlist/portfolio/scanner tables; evidence ledger; foundational motion polish.

**Phase 4 — signature (after correctness backlog):** animated aperture, chart monochrome refinement, dashboard glow-up. *(Waits per your own correctness-first rule.)*

Phases 0–3 need no accounts and no paid anything. Constraints respected throughout: React 19 + Vite, no new runtime dependencies required (the aperture is one inline SVG; tables are CSS), fonts remain free (self-hosting optional and free), bundle stays inside `checkPerformanceBudget.mjs` — the plan removes CSS (three palettes → one) rather than adding libraries.
