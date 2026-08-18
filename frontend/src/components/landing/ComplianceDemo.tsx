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
      <div className="grid gap-6 lg:grid-cols-2">
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
