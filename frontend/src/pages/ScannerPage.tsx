import {
  ArrowUpRight,
  CheckSquare2,
  Radar,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import {
  runWatchlistScan,
  type ScannerObservation,
  type ScannerRun,
} from "../services/scanner";
import {
  getWatchlist,
  type WatchlistItem,
} from "../services/watchlist";

const SCAN_LIMIT = 20;

const toneClasses: Record<ScannerObservation["tone"], string> = {
  neutral: "border-stroke bg-surface-soft text-ink-soft",
  attention: "border-caution/25 bg-caution/10 text-caution",
  positive: "border-positive/25 bg-positive/10 text-positive",
  critical: "border-critical/25 bg-critical/10 text-critical",
};

export default function ScannerPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [scan, setScan] = useState<ScannerRun | null>(null);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getWatchlist()
      .then((items) => {
        setWatchlist(items);
        setSelected(items.slice(0, SCAN_LIMIT).map((item) => item.symbol));
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load watchlist.",
        ),
      )
      .finally(() => setLoadingWatchlist(false));
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggleSymbol(symbol: string) {
    setScan(null);
    setMessage("");
    setSelected((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : current.length < SCAN_LIMIT
          ? [...current, symbol]
          : current,
    );
  }

  async function runScan() {
    setMessage("");
    setRunning(true);
    try {
      setScan(await runWatchlistScan(selected));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to run scanner.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8"
    >
      <div className="mb-7 flex items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
          <Radar />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Evidence discovery
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Watchlist Scanner
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Manually inspect up to 20 saved equities for notable daily price,
            volume and momentum observations. This is research, not a trade
            signal.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">
                Select stocks to scan
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {selected.length} of {SCAN_LIMIT} selected. One historical-data
                request is planned per selected stock.
              </p>
            </div>
            <Button
              onClick={runScan}
              isLoading={running}
              disabled={selected.length === 0 || loadingWatchlist}
            >
              Run scan
            </Button>
          </div>

          {loadingWatchlist ? (
            <p className="mt-6 text-sm text-ink-muted">Loading watchlist…</p>
          ) : watchlist.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">
              Your watchlist is empty.{" "}
              <Link className="font-semibold text-brand" to="/watchlist">
                Add equities first
              </Link>
              .
            </p>
          ) : (
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {watchlist.map((item) => {
                const isSelected = selectedSet.has(item.symbol);
                const limitReached =
                  selected.length >= SCAN_LIMIT && !isSelected;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    disabled={limitReached}
                    aria-pressed={isSelected}
                    onClick={() => toggleSymbol(item.symbol)}
                    className={[
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      isSelected
                        ? "border-brand/35 bg-brand/10 text-ink"
                        : "border-stroke bg-surface-soft text-ink-soft hover:border-brand/25",
                    ].join(" ")}
                  >
                    {isSelected ? (
                      <CheckSquare2 size={18} className="text-brand" />
                    ) : (
                      <Square size={18} />
                    )}
                    <span className="font-display font-semibold">
                      {item.symbol}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card variant="brand">
          <div className="flex items-center gap-2 text-intelligence">
            <ShieldCheck size={19} />
            <h2 className="font-display font-semibold">Cost-safe by design</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            <li>Manual scans only—no background refresh.</li>
            <li>Maximum 20 symbols touched per run.</li>
            <li>Zero Halal Terminal and fundamentals calls.</li>
            <li>Shariah status appears only in full analysis.</li>
          </ul>
        </Card>
      </div>

      {message && (
        <p
          role="alert"
          className="mb-6 rounded-2xl border border-critical/20 bg-critical/10 px-4 py-3 text-sm text-critical"
        >
          {message}
        </p>
      )}

      {scan && (
        <section aria-labelledby="scanner-results-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="scanner-results-title"
                className="font-display text-xl font-semibold text-ink"
              >
                Scan observations
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {scan.symbolsTouched} symbols touched · {scan.shariahCalls}{" "}
                Shariah calls ·{" "}
                {new Date(scan.generatedAt).toLocaleString()}
              </p>
            </div>
            <p className="max-w-xl text-xs text-ink-muted">{scan.disclaimer}</p>
          </div>

          <div className="grid gap-4">
            {scan.results.map((result) => (
              <Card key={result.symbol}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-display text-xl font-semibold text-ink">
                        {result.symbol}
                      </h3>
                      <span className="rounded-full border border-stroke bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                        {result.status === "COMPLETE"
                          ? `Daily data · ${result.asOf || "latest"}`
                          : "Data unavailable"}
                      </span>
                    </div>
                    {result.message && (
                      <p className="mt-2 text-sm text-caution">
                        {result.message}
                      </p>
                    )}
                  </div>
                  <Link
                    to={`/analysis/${encodeURIComponent(result.symbol)}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
                  >
                    Open full analysis <ArrowUpRight size={16} />
                  </Link>
                </div>

                {result.metrics && (
                  <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Close" value={result.metrics.close} />
                    <Metric
                      label="Daily move"
                      value={result.metrics.dailyChangePercent}
                      suffix="%"
                    />
                    <Metric
                      label="Relative volume"
                      value={result.metrics.relativeVolume}
                      suffix="×"
                    />
                    <Metric label="RSI 14" value={result.metrics.rsi14} />
                  </dl>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  {result.observations.map((observation) => (
                    <span
                      key={observation.id}
                      title={observation.detail}
                      className={[
                        "rounded-xl border px-3 py-2 text-xs font-semibold",
                        toneClasses[observation.tone],
                      ].join(" ")}
                    >
                      {observation.label}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value?: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-stroke bg-surface-soft px-3 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 font-display text-lg font-semibold text-ink">
        {typeof value === "number" ? `${value}${suffix}` : "—"}
      </dd>
    </div>
  );
}
