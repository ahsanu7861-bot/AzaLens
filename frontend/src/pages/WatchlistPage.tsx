import { ArrowUpRight, ListChecks, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import EquitySearchBox from "../components/equities/EquitySearchBox";
import Card from "../components/ui/Card";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  type WatchlistItem,
} from "../services/watchlist";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getWatchlist()
      .then(setItems)
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <div className="mb-7 flex items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
          <ListChecks />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Investor workspace</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Watchlist</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Track listed company shares across supported global exchanges. Crypto, forex, funds, futures and commodities are excluded.
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Add a stock</h2>
        <EquitySearchBox
          onSelect={async (stock) => {
            setMessage("");
            try {
              const item = await addToWatchlist(stock.symbol);
              setItems((current) => [...current, item]);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Unable to add stock.");
            }
          }}
        />
        {message && <p role="status" className="mt-3 text-sm text-caution">{message}</p>}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-stroke px-5 py-4">
          <h2 className="font-display text-lg font-semibold">Tracked stocks</h2>
          <p className="text-sm text-ink-muted">{items.length} {items.length === 1 ? "company" : "companies"}</p>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-muted">Loading watchlist…</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-muted">Your watchlist is empty. Search above to add your first stock.</p>
        ) : (
          <ul className="divide-y divide-stroke">
            {items.map((item) => (
              <li key={item.symbol} className="flex items-center gap-3 px-5 py-4">
                <Link className="min-w-0 flex-1" to={`/analysis/${encodeURIComponent(item.symbol)}`}>
                  <span className="font-display font-semibold text-ink">{item.symbol}</span>
                  <span className="ml-3 text-xs text-ink-muted">Open analysis</span>
                </Link>
                <Link aria-label={`Analyze ${item.symbol}`} to={`/analysis/${encodeURIComponent(item.symbol)}`} className="az-icon-button grid">
                  <ArrowUpRight size={17} />
                </Link>
                <button
                  type="button"
                  aria-label={`Remove ${item.symbol}`}
                  className="az-icon-button grid text-critical"
                  onClick={async () => {
                    try {
                      setItems(await removeFromWatchlist(item.symbol));
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Unable to remove stock.");
                    }
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
