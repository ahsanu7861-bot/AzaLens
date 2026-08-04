import AzaLensLogo from "../brand/AzaLensLogo";
import { Button, Container } from "../ui";

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
              AI Stock Intelligence
            </p>
          </div>
        </a>

        <nav className="hidden items-center gap-8 text-sm text-ink-soft md:flex">
          <a className="transition hover:text-ink" href="#features">
            Features
          </a>

          <a className="transition hover:text-ink" href="#pricing">
            Pricing
          </a>

          <a className="transition hover:text-ink" href="#product">
            Product
          </a>

          <a className="transition hover:text-ink" href="#about">
            About
          </a>
        </nav>

        <Button size="sm">Start Free</Button>
      </Container>
    </header>
  );
}
