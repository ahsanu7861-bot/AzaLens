# Performance and Accessibility Contract

This contract defines the first Sprint 4.6 release gate. It is enforced in
GitHub Reliability Gates and applies to both Day and Night themes.

## Performance budgets

The production build must satisfy all of the following:

- Application entry JavaScript: at most 300 KiB raw and 100 KiB gzip.
- Analysis route shell: at most 90 KiB raw and 30 KiB gzip.
- Any JavaScript chunk: at most 320 KiB raw and 100 KiB gzip.
- Any CSS asset: at most 80 KiB raw and 15 KiB gzip.
- Production `index.html`: at most 4 KiB.

The analysis route, chart engine, individual evidence workspaces, and command
center are loaded on demand. The analysis query remains fresh for 60 seconds
and is garbage-collected after 15 minutes. Previous-symbol data is never used
as placeholder data because it could mislabel financial evidence.

Google font CSS is loaded asynchronously with system-font fallbacks so it does
not block the first render. The application remains usable when remote fonts
are unavailable.

Run the budget locally after a production build:

```bash
npm run build
npm run test:performance
```

## WCAG 2.2 AA interaction contract

- Neutral and semantic text tokens must maintain at least 4.5:1 contrast on
  their supported backgrounds in both themes.
- The automated browser scan includes color contrast; it is not waived.
- Every route exposes a visible-on-focus skip link and a programmatically
  focusable main landmark.
- Route changes move focus to the new main landmark.
- Analysis tabs use roving `tabindex`, `aria-controls`, linked tab panels, and
  Arrow Left/Right plus Home/End navigation.
- Modal dialogs trap focus, close with Escape, prevent background scrolling,
  and restore focus to the invoking control.
- The appearance menu supports Arrow Up/Down, Home, End, and Escape.
- Touch and pointer targets remain at least 44 by 44 CSS pixels where the
  shipped interface marks an interactive control.
- `prefers-reduced-motion: reduce` removes non-essential transition and
  animation duration and disables smooth programmatic tab scrolling.

Run the deterministic token check locally:

```bash
npm run test:contrast
```

Browser behavior, accessibility scanning, mobile overflow, and visual
regression remain enforced by the Playwright gate.
