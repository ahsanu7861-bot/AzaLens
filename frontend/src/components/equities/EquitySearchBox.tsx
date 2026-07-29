import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import {
  searchEquities,
  type EquitySearchResult,
} from "../../services/equitySearch";
import Input from "../ui/Input";

interface Props {
  onSelect: (stock: EquitySearchResult) => void;
  placeholder?: string;
}

export default function EquitySearchBox({ onSelect, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EquitySearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const nextResults = await searchEquities(query);
        if (!controller.signal.aborted) {
          setResults(nextResults);
          setStatus("idle");
        }
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="relative">
      <Input
        aria-label="Search listed stocks"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder || "Search symbol or company"}
        leadingIcon={<Search size={17} />}
      />
      {query && (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-stroke bg-surface-raised p-2 shadow-[0_24px_70px_var(--az-shadow-strong)]">
          {status === "loading" && (
            <p className="px-3 py-5 text-center text-sm text-ink-muted">
              Searching listed company shares…
            </p>
          )}
          {status === "error" && (
            <p className="px-3 py-5 text-center text-sm text-critical">
              Stock search is temporarily unavailable.
            </p>
          )}
          {status === "idle" && results.length === 0 && (
            <p className="px-3 py-5 text-center text-sm text-ink-muted">
              No listed company shares found.
            </p>
          )}
          {results.map((stock) => (
            <button
              key={stock.symbol}
              type="button"
              onClick={() => {
                onSelect(stock);
                setQuery("");
                setResults([]);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-surface-soft"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{stock.symbol}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {stock.name}
                </span>
              </span>
              <span className="ml-3 rounded-full border border-stroke px-2 py-1 text-[10px] text-ink-muted">
                Equity
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
