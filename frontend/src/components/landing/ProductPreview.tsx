import BrowserMockup from "./BrowserMockup";
import ComplianceDemo from "./ComplianceDemo";

export default function ProductPreview() {
  return (
    <section id="product" className="mx-auto max-w-7xl px-6 py-24 sm:px-8">
      <div className="mx-auto mb-14 max-w-3xl text-center">
        <span className="rounded-full border border-brand/20 bg-brand/10 px-4 py-2 text-sm font-medium text-brand">
          HOW THE VERDICT IS REACHED
        </span>

        <h2 className="mt-6 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Compliance comes before the verdict.
        </h2>

        <p className="mt-5 text-lg leading-8 text-ink-soft">
          AzaLens never issues a blind trade command. See how the same
          product looks before and after AAOIFI Shariah compliance is
          confirmed for a stock.
        </p>
      </div>

      <BrowserMockup>
        <div className="p-5 sm:p-7 lg:p-9">
          <ComplianceDemo />
        </div>
      </BrowserMockup>
    </section>
  );
}
