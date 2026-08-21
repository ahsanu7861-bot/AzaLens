import { Link } from "react-router-dom";

import AzaLensLogo from "../components/brand/AzaLensLogo";
import { Card, Container } from "../components/ui";

const HALAL_TERMINAL_METHODOLOGY =
  "https://www.halalterminal.com/methodology";
const AAOIFI_STANDARD_LIST =
  "https://aaoifi.com/shariah-standards-3/?lang=en";

type PrincipleProps = {
  marker: string;
  title: string;
  children: React.ReactNode;
};

function Principle({ marker, title, children }: PrincipleProps) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/20 bg-brand/10 text-brand">
          <span className="text-xs font-bold tracking-wider" aria-hidden="true">
            {marker}
          </span>
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <div className="mt-2 space-y-3 text-sm leading-6 text-ink-muted">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
    >
      {children}
    </a>
  );
}

export default function MethodologyPage() {
  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="border-b border-stroke bg-surface/88 backdrop-blur-xl">
        <Container className="flex h-[68px] items-center gap-3">
          <Link to="/" aria-label="AzaLens home">
            <AzaLensLogo className="h-8 w-36" />
          </Link>
          <div className="ml-auto">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-soft transition hover:bg-surface-soft hover:text-ink"
            >
              <span aria-hidden="true">←</span> Back to AzaLens
            </Link>
          </div>
        </Container>
      </header>

      <main id="main-content" tabIndex={-1}>
        <Container size="lg" className="py-12 sm:py-16">
          <header className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              How AzaLens reaches its result
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Methodology &amp; limitations
            </h1>
            <p className="mt-5 text-base leading-7 text-ink-muted sm:text-lg">
              AzaLens is deterministic research software for listed-company
              shares. It organizes market evidence, risk context and a
              provider-reported AAOIFI Shariah screen. It does not predict
              outcomes, issue a fatwa, or place trades.
            </p>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Methodology statement reviewed 21 August 2026. Provider rules
              may change; the linked provider methodology is the current
              description of its screening implementation.
            </p>
          </header>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <Principle marker="01" title="What the product covers">
              <p>
                AzaLens covers listed-company shares. It does not cover
                cryptocurrency, foreign exchange, commodities, CFDs, options,
                futures or other derivatives.
              </p>
              <p>
                Its technical and risk sections use explicit rules over market
                data. Its public verdict is withheld whenever the required
                evidence or current Shariah confirmation is unavailable.
              </p>
            </Principle>

            <Principle marker="02" title="AAOIFI screening boundary">
              <p>
                Halal Terminal supplies the company-level screening result.
                AzaLens selects the provider&apos;s AAOIFI result as its sole
                displayed Shariah methodology and does not promote a secondary
                methodology over it, infer a missing result, or change the
                provider&apos;s status.
              </p>
              <p>
                Halal Terminal describes its current AAOIFI implementation as
                applying Shari&apos;ah Standard No. 21 business-activity screens,
                30% debt and interest-bearing-deposit screens against market
                capitalization, and a 5% impure-income screen.
              </p>
              <p>
                See the <SourceLink href={HALAL_TERMINAL_METHODOLOGY}>provider methodology</SourceLink>{" "}
                and AAOIFI&apos;s <SourceLink href={AAOIFI_STANDARD_LIST}>official standards list</SourceLink>.
                AzaLens is not affiliated with or endorsed by AAOIFI.
              </p>
            </Principle>

            <Principle marker="03" title="What unlocks a verdict">
              <p>
                Directional guidance is released only when the provider result
                is successful, the AAOIFI status is compliant, and the evidence
                is not stale. Non-compliant, unknown, missing or stale screening
                evidence produces a withheld result rather than a guess.
              </p>
              <p>
                Technical evidence is grouped into independent families and
                reported as support out of four. Family support describes the
                current evidence configuration; it is not an accuracy rate or a
                probability of market success.
              </p>
            </Principle>

            <Principle marker="04" title="Freshness and data timing">
              <p>
                The Shariah provider response is cached for up to 24 hours to
                control cost and duplicate requests. AzaLens treats Shariah
                evidence older than seven days as stale, and also honors any
                earlier stale flag returned by the provider.
              </p>
              <p>
                Financial filings generally update quarterly, while prices and
                market-cap inputs can change more frequently. Results can
                change after filings, material price moves, corporate actions
                or methodology updates.
              </p>
            </Principle>

            <Principle marker="05" title="Risk and technical limitations">
              <p>
                Indicators summarize historical price and volume. They can be
                unavailable, delayed, contradictory or structurally incomplete.
                No indicator guarantees continuation or reversal.
              </p>
              <p>
                A temporary private compatibility formula still contributes to
                the numeric risk score. Its thresholds and penalties are frozen
                under contract but are not empirically calibrated or validated
                against an outcome ledger. Contractual governance is not proof
                of accuracy.
              </p>
            </Principle>

            <Principle marker="06" title="Purification and personal decisions">
              <p>
                When available, AzaLens reports the provider&apos;s dividend
                purification rate. It does not calculate an investor&apos;s personal
                purification amount, tax position, zakat obligation or religious
                duty.
              </p>
              <p>
                Screening depends on source-data quality, issuer classification
                and the provider&apos;s interpretation of published standards.
                Borderline or consequential cases should be reviewed with a
                qualified scholar and an appropriately licensed financial or
                legal professional.
              </p>
            </Principle>
          </div>

          <Card variant="brand" className="mt-6">
            <h2 className="font-display text-xl font-semibold text-ink">
              Important boundary
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-ink-muted">
              AzaLens provides educational research. It is not investment
              advice, a recommendation, a solicitation, a brokerage service, a
              Shariah board, a fatwa or a personal religious ruling. It does not
              execute trades, hold assets, connect to a broker, or know a
              user&apos;s personal circumstances.
            </p>
          </Card>
        </Container>
      </main>
    </div>
  );
}
