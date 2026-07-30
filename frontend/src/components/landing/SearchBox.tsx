import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "../ui";

const symbols = ["AAPL", "NVDA", "TSLA", "ASML", "TM", "NVS"];

export default function SearchBox() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const symbol = query.trim().toUpperCase();

    if (!symbol) {
      return;
    }

    navigate(`/analysis/${encodeURIComponent(symbol)}`);
  }

  function analyzeSymbol(symbol: string) {
    setQuery(symbol);
    navigate(`/analysis/${encodeURIComponent(symbol)}`);
  }

  return (
    <form
      onSubmit={submitAnalysis}
      className="rounded-3xl border border-stroke bg-surface-soft p-3 backdrop-blur-xl"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          name="symbol"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Analyze AAPL..."
          autoComplete="off"
          aria-label="Stock symbol"
          className="text-lg"
        />

        <Button type="submit" size="lg" className="sm:min-w-36">
          Analyze
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 px-1 pb-1">
        {symbols.map((symbol) => (
          <Button
            key={symbol}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => analyzeSymbol(symbol)}
            className="min-h-0 rounded-full border border-stroke px-4 py-2 text-ink-soft hover:border-brand/30 hover:text-brand"
          >
            {symbol}
          </Button>
        ))}
      </div>

      <p className="px-1 pt-3 text-left text-xs leading-5 text-ink-muted">
        Enter a listed stock ticker. Crypto, forex, commodities, CFDs,
        options and leveraged products are not supported.
      </p>
    </form>
  );
}
