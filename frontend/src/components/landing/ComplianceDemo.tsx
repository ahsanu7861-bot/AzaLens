import VerdictCard from "../analysis/VerdictCard";
import IslamicCompliance from "../analysis/IslamicCompliance";
import VerdictWithheld from "../analysis/VerdictWithheld";
import {
  confirmedDemoAnalysis,
  withheldDemoAnalysis,
} from "../../data/landingDemo";
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
          <VerdictWithheld
            message={withheldDemoAnalysis.complianceGate?.message}
          />
          <IslamicCompliance data={withheldDemoAnalysis.shariah} />
        </div>

        <div className="space-y-4" data-testid="landing-demo-confirmed">
          <DemoLabel>Demonstration — compliance confirmed</DemoLabel>
          <VerdictCard
            direction={confirmedDemoAnalysis.agreement.direction}
            trend={confirmedDemoAnalysis.trend.trend}
            confidence={confirmedDemoAnalysis.agreement.confidence}
            evidenceState={confirmedDemoAnalysis.agreement.evidenceState}
            coveragePercent={confirmedDemoAnalysis.agreement.coveragePercent}
            availableIndicators={confirmedDemoAnalysis.agreement.availableIndicators}
            expectedIndicators={confirmedDemoAnalysis.agreement.expectedIndicators}
            summary={confirmedDemoAnalysis.agreement.agreementSummary}
            invalidation={confirmedDemoAnalysis.thesisInvalidation}
          />
          <IslamicCompliance data={confirmedDemoAnalysis.shariah} />
        </div>
      </div>

      <p className="mt-6 text-center text-xs leading-5 text-ink-muted">
        Representative data for illustration only — not live market or
        screening results.
      </p>
    </div>
  );
}
