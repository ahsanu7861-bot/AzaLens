import { BriefcaseBusiness, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import EquitySearchBox from "../components/equities/EquitySearchBox";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import {
  addHolding,
  getPortfolio,
  removeHolding,
  updateHolding,
  type PortfolioHolding,
} from "../services/portfolio";

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const totalCost = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.shares * holding.averagePrice, 0),
    [holdings],
  );

  useEffect(() => {
    void getPortfolio().then(setHoldings).catch((error) => setMessage(error.message));
  }, []);

  function resetForm() {
    setSymbol("");
    setShares("");
    setAveragePrice("");
    setEditing(false);
  }

  async function submit() {
    const input = { shares: Number(shares), averagePrice: Number(averagePrice) };
    if (!symbol || input.shares <= 0 || input.averagePrice <= 0) {
      setMessage("Choose a stock and enter valid shares and average price.");
      return;
    }
    try {
      if (editing) {
        const updated = await updateHolding(symbol, input);
        setHoldings((current) => current.map((item) => item.symbol === symbol ? updated : item));
      } else {
        const added = await addHolding({ symbol, ...input });
        setHoldings((current) => [...current, added]);
      }
      setMessage("");
      resetForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save holding.");
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <div className="mb-7 flex items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand"><BriefcaseBusiness /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Portfolio intelligence</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Portfolio</h1>
          <p className="mt-2 text-sm text-ink-muted">Record owned listed shares. Values below are cost basis—not invented live market value.</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-wider text-ink-muted">Holdings</p><p className="mt-2 font-display text-2xl font-semibold">{holdings.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-ink-muted">Total shares</p><p className="mt-2 font-display text-2xl font-semibold">{holdings.reduce((sum, item) => sum + item.shares, 0).toLocaleString()}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-ink-muted">Recorded cost basis</p><p className="mt-2 font-display text-2xl font-semibold">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></Card>
      </div>

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{editing ? `Edit ${symbol}` : "Add a holding"}</h2>
          {editing && <button aria-label="Cancel editing" onClick={resetForm} className="az-icon-button grid"><X size={17} /></button>}
        </div>
        {!editing && <EquitySearchBox onSelect={(stock) => setSymbol(stock.symbol)} />}
        {symbol && <p className="mt-3 text-sm font-semibold text-brand">Selected: {symbol}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="Shares" type="number" min="0" step="any" value={shares} onChange={(event) => setShares(event.target.value)} />
          <Input label="Average purchase price (USD)" type="number" min="0" step="any" value={averagePrice} onChange={(event) => setAveragePrice(event.target.value)} />
        </div>
        <Button className="mt-4" onClick={() => void submit()}>{editing ? "Update holding" : "Add holding"}</Button>
        {message && <p role="status" className="mt-3 text-sm text-caution">{message}</p>}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-stroke px-5 py-4"><h2 className="font-display text-lg font-semibold">Positions</h2></div>
        {holdings.length === 0 ? <p className="p-8 text-center text-sm text-ink-muted">No holdings recorded yet.</p> : (
          <ul className="divide-y divide-stroke">
            {holdings.map((holding) => (
              <li key={holding.symbol} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                <Link to={`/analysis/${encodeURIComponent(holding.symbol)}`}><span className="font-display font-semibold">{holding.symbol}</span><span className="ml-3 text-xs text-ink-muted">Analyze</span></Link>
                <span className="text-sm text-ink-soft">{holding.shares.toLocaleString()} shares</span>
                <span className="text-sm text-ink-soft">${holding.averagePrice.toLocaleString()} avg.</span>
                <span className="flex gap-2">
                  <button aria-label={`Edit ${holding.symbol}`} className="az-icon-button grid" onClick={() => { setSymbol(holding.symbol); setShares(String(holding.shares)); setAveragePrice(String(holding.averagePrice)); setEditing(true); }}><Pencil size={16} /></button>
                  <button aria-label={`Remove ${holding.symbol}`} className="az-icon-button grid text-critical" onClick={async () => { try { setHoldings(await removeHolding(holding.symbol)); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to remove holding."); } }}><Trash2 size={16} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
