import VerdictCard from "../analysis/VerdictCard";
import IslamicCompliance from "../analysis/IslamicCompliance";
import VerdictWithheld from "../analysis/VerdictWithheld";
import { confirmedDemoCard, withheldDemoCard } from "../../data/landingDemo";
import { horizonLabel } from "../../lib/guidanceLabels";
import { Badge } from "../ui";

function DemoLabel({ children }: { children: string }) {
  return (
    <Badge variant="neutral" className="mb-1">
      {children}
    </Badge>
  );
}

export default function ComplianceDemo() {
  return (
    <div>
      {/*
        The two scenarios stack. They must not sit side by side.

        `IslamicCompliance` sizes its metric grid from *viewport* breakpoints
        (`md:grid-cols-2 xl:grid-cols-3`), but here it renders inside a nested
        landing column. Measured: at viewport >= 1280 the metric grid becomes
        three columns while this demo column is capped at 559px by the
        ProductPreview `max-w-7xl` container — so each metric card is 159px, and
        the "Unavailable" and "0.4% of dividends" badges overflow their cards by
        48px and 51px. Widening the viewport does not help, because the column
        width is capped and stops growing.

        A safe side-by-side would need ~725px per scenario column (three metric
        cards of ~231px plus gaps), i.e. ~1474px of inner width for two columns.
        The container provides at most 1142px. Two columns are therefore
        impossible to make safe within this container at any viewport, which is
        why this stacks unconditionally rather than at some breakpoint.

        Stacked, every badge sits 21px inside its card at every width measured
        from 390px to 1920px. A vertical before/after comparison reads perfectly
        well — the two scenario labels carry that meaning — and readable content
        matters more than a side-by-side that clips the evidence it exists to show.
      */}
      <div className="grid gap-6">
        <div className="space-y-4" data-testid="landing-demo-withheld">
          <DemoLabel>Demonstration — compliance not yet confirmed</DemoLabel>
          <VerdictWithheld message={withheldDemoCard.withheldMessage} />
          <IslamicCompliance data={withheldDemoCard.shariah} />
        </div>

        <div className="space-y-4" data-testid="landing-demo-confirmed">
          <DemoLabel>Demonstration — compliance confirmed</DemoLabel>
          {/*
            The headline carries the canonical public verdict label and the badge
            carries the canonical horizon, exactly as the analysis workspace does.
            Neither slot may carry the internal agreement direction ("Bullish"):
            that is an engine-internal lean, not wording this product publishes.
          */}
          <VerdictCard
            headlineScale="compact"
            direction={confirmedDemoCard.publicLabel}
            trend={horizonLabel(confirmedDemoCard.horizonToken)}
            evidence={confirmedDemoCard.evidence}
            summary={confirmedDemoCard.summary}
            invalidation={confirmedDemoCard.invalidation}
          />
          <IslamicCompliance data={confirmedDemoCard.shariah} />
        </div>
      </div>

      <p className="mt-6 text-center text-xs leading-5 text-ink-muted">
        Representative data for illustration only — not live market or
        screening results.
      </p>
    </div>
  );
}
