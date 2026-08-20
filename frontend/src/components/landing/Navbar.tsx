import AzaLensLogo from "../brand/AzaLensLogo";
import { Container } from "../ui";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stroke bg-surface/85 backdrop-blur-xl">
      <Container className="flex h-20 items-center justify-between">
        <a
          href="/"
          aria-label="AzaLens home"
          className="flex min-w-0 items-center"
        >
          <div className="min-w-0">
            <AzaLensLogo decorative className="h-8 w-36 sm:w-[156px]" />
            <p className="text-xs text-ink-muted">
              Explainable Stock Analysis
            </p>
          </div>
        </a>

        {/*
          Only #product is listed, because it is the only anchor with a mounted
          target. #features, #pricing and #about all resolved to nothing at every
          viewport, and #pricing additionally advertised a tier that does not
          exist. A "Start Free" button sat here too, with no href and no handler:
          a focusable tab stop that did nothing, implying a signup the product
          does not offer. Do not restore any of them without a real destination.
        */}
        <nav className="hidden items-center gap-8 text-sm text-ink-soft md:flex">
          <a className="transition hover:text-ink" href="#product">
            Product
          </a>
        </nav>
      </Container>
    </header>
  );
}
