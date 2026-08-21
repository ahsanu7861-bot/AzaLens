import { Link } from "react-router-dom";
import { BookOpen, Clock3, Scale, ShieldCheck, TriangleAlert } from "lucide-react";

import AzaLensLogo from "../components/brand/AzaLensLogo";
import Card from "../components/ui/Card";
import Container from "../components/ui/Container";
import disclosure from "../data/methodologyDisclosure.json";

const sections = [
  {
    icon: ShieldCheck,
    title: "What the Shariah screen does",
    body: `${disclosure.screeningSource} AzaLens displays that result without turning an unknown or stale response into a compliant one. Only confirmed, current compliance can clear the verdict gate.`,
  },
  {
    icon: Scale,
    title: "What AzaLens checks locally",
    body: `AzaLens treats debt above ${disclosure.researchBoundaries.debtToAssetsPercent}% of assets or impermissible income above ${disclosure.researchBoundaries.impermissibleIncomePercent}% as a fundamental thesis-invalidation boundary. These checks are research safeguards, not a reproduction of the provider’s complete screening methodology and not an independent religious ruling.`,
  },
  {
    icon: Clock3,
    title: "Freshness and market timing",
    body: `A screening response may be cached for ${disclosure.cacheHours} hours. Evidence older than ${disclosure.staleAfterDays} days is treated as stale and cannot clear the Shariah gate. Market data may be delayed; the configured default delay is ${disclosure.defaultMarketDelayMinutes} minutes.`,
  },
  {
    icon: BookOpen,
    title: "Horizon and interpretation",
    body: `Published guidance describes a swing-research horizon of ${disclosure.guidanceHorizon}. It is a conditional reading of available evidence—not a prediction, trade instruction, or promise of an outcome.`,
  },
];

export default function MethodologyPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-stroke bg-surface/90">
        <Container className="flex min-h-20 items-center justify-between gap-5 py-4">
          <Link to="/" aria-label="AzaLens home">
            <AzaLensLogo decorative className="h-8 w-36 sm:w-[156px]" />
          </Link>
          <Link className="text-sm font-medium text-brand hover:underline" to="/">
            Back to AzaLens
          </Link>
        </Container>
      </header>

      <Container size="lg" className="py-12 sm:py-16">
        <p className="az-eyebrow text-brand">Public methodology</p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Methodology &amp; Limitations
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-ink-soft">
          How AzaLens turns deterministic market evidence and provider-supplied
          Shariah screening into conditional research guidance—and where its
          authority stops.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {sections.map(({ icon: Icon, title, body }) => (
            <Card key={title} variant="glass" padding="lg">
              <Icon aria-hidden="true" className="text-brand" size={22} />
              <h2 className="mt-4 font-display text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-ink-soft">{body}</p>
            </Card>
          ))}
        </div>

        <Card variant="brand" padding="lg" className="mt-6">
          <h2 className="font-display text-xl font-semibold text-ink">Purification</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-ink-soft">
            When available, AzaLens reports the provider’s dividend-purification
            rate. It does not calculate an investor’s personal cash obligation,
            infer a missing rate as zero, or decide how the rate applies to a
            particular holding. Personal application should be confirmed with a
            qualified Shariah scholar.
          </p>
        </Card>

        <Card variant="outline" padding="lg" className="mt-6">
          <div className="flex items-start gap-4">
            <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0 text-warning" size={22} />
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Version and authority</h2>
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                AzaLens’s internal Shariah response contract is version {disclosure.internalShariahContractVersion}.
                The provider states that it independently implements {disclosure.providerStatedStandardReference}.
                It has no AAOIFI accreditation, endorsement, or formal relationship, and the precise edition or
                revision is not exposed or verified by the current provider contract.
                This automated research screen is not a fatwa, scholarly attestation, personal religious ruling,
                or investment advice.
              </p>
            </div>
          </div>
        </Card>
      </Container>
    </main>
  );
}
