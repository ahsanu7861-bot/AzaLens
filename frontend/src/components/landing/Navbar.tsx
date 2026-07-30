import { Button, Container } from "../ui";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stroke bg-surface/85 backdrop-blur-xl">
      <Container className="flex h-20 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-canvas">
            A
          </div>

          <div>
            <p className="font-display text-lg font-semibold text-ink">AzaLens</p>
            <p className="text-xs text-ink-muted">
              AI Stock Intelligence
            </p>
          </div>
        </div>

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
