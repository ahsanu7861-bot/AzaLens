import SearchBox from "./SearchBox";

export default function Hero() {
  return (
    <section className="mx-auto flex min-h-[85vh] max-w-6xl flex-col items-center justify-center px-8 text-center">

      <span className="rounded-full border border-brand/20 bg-brand/10 px-4 py-2 text-sm text-brand">
        AI Stock Intelligence
      </span>

      <h1 className="mt-8 font-display text-6xl font-bold leading-tight tracking-tight text-ink">

        Every Stock.

        <br />

        Explained.

      </h1>

      <p className="mt-8 max-w-2xl text-xl leading-9 text-ink-soft">

        AI-powered analysis for listed stocks worldwide, with transparent
        technical reasoning, risk assessment and built-in Shariah screening.

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
