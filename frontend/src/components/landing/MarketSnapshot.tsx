import MarketCard from "./MarketCard";

const stocks = [
  {
    name: "Apple Inc.",
    symbol: "AAPL",
    exchange: "NASDAQ",
    market: "United States",
  },
  {
    name: "ASML Holding",
    symbol: "ASML",
    exchange: "NASDAQ",
    market: "Netherlands",
  },
  {
    name: "Toyota Motor",
    symbol: "TM",
    exchange: "NYSE",
    market: "Japan",
  },
  {
    name: "Novartis",
    symbol: "NVS",
    exchange: "NYSE",
    market: "Switzerland",
  },
];

const excludedProducts = [
  "No CFDs",
  "No crypto",
  "No forex",
  "No gold or silver",
  "No options",
  "No leverage or margin",
];

export default function MarketSnapshot() {
  return (
    <section className="mx-auto max-w-7xl px-8 py-24">
      <div className="mb-14 text-center">
        <span className="rounded-full bg-brand/10 px-4 py-2 text-sm text-brand">
          GLOBAL EQUITY COVERAGE
        </span>

        <h2 className="mt-6 font-display text-5xl font-bold text-ink">
          Listed Stocks Across Global Markets
        </h2>

        <p className="mt-4 text-lg text-ink-soft">
          Analyze individual companies by stock ticker with transparent,
          evidence-based market intelligence.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stocks.map((stock) => (
          <MarketCard key={stock.symbol} {...stock} />
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-brand/20 bg-brand/5 p-8">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-wide text-ink-muted">
              Product Scope
            </p>

            <h3 className="mt-2 font-display text-3xl font-bold text-ink">
              Global listed stocks. Cash equity only.
            </h3>

            <p className="mt-3 leading-7 text-ink-soft">
              AzaLens is designed for analyzing shares in listed companies.
              Market indices may provide context, but the analysis product is
              not for leveraged or derivative trading.
            </p>
          </div>

          <div className="flex max-w-xl flex-wrap gap-2 lg:justify-end">
            {excludedProducts.map((product) => (
              <span
                key={product}
                className="rounded-full border border-stroke bg-surface-soft px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-soft"
              >
                {product}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
