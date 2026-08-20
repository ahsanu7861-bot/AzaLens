import SearchBox from "./SearchBox";

export default function Hero() {
  return (
    <section className="mx-auto flex min-h-[85vh] max-w-6xl flex-col items-center justify-center px-8 text-center">

      <span className="rounded-full border border-brand/20 bg-brand/10 px-4 py-2 text-sm text-brand">
        EXPLAINABLE STOCK ANALYSIS
      </span>

      <h1 className="mt-8 font-display text-6xl font-bold leading-tight tracking-tight text-ink">

        Listed Stocks.

        <br />

        Clearly Explained.

      </h1>

      <p className="mt-8 max-w-2xl text-xl leading-9 text-ink-soft">

        Analysis of listed-company shares worldwide, with the evidence, risk
        context and built-in AAOIFI-based Shariah screening shown clearly.

      </p>

      <div className="mt-12 w-full max-w-3xl">
        <SearchBox />
      </div>

      <p className="mt-5 text-sm text-ink-muted">
        Cash equities only · No leverage · No derivatives
      </p>

    </section>
  );
}
