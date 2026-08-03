import AzaLensLogo from "../brand/AzaLensLogo";
import { Container } from "../ui";

export default function Footer() {
  return (
    <footer className="border-t border-stroke bg-surface/60">
      <Container className="flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <AzaLensLogo className="h-8 w-36" />
          <p className="mt-2 max-w-xs text-xs leading-5 text-ink-muted">
            Research and educational stock intelligence with built-in
            AAOIFI Shariah screening.
          </p>
        </div>

        <div className="max-w-xl space-y-2 text-xs leading-5 text-ink-muted">
          <p>
            AzaLens is a research and educational tool. Nothing on this
            site is investment advice, a trade instruction, or a
            solicitation to buy or sell any security.
          </p>
          <p>
            AzaLens does not execute trades, hold custody of assets, or
            act as a broker-dealer. The Shariah screening shown is an
            automated research screen, not a fatwa or personal religious
            ruling.
          </p>
          <p>&copy; {new Date().getFullYear()} AzaLens.</p>
        </div>
      </Container>
    </footer>
  );
}
