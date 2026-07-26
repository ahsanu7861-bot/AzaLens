import { Command } from "cmdk";
import { ArrowUpRight, Search } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useCommandStore } from "../../store/commandStore";
import { searchStocks } from "../../lib/searchStocks";

export default function CommandCenter() {
  const { open, setOpen } = useCommandStore();
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const closeDialog = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useDialogFocus({
    open,
    dialogRef,
    onClose: closeDialog,
  });

  if (!open) return null;
  const results = searchStocks(query);

  function openStock(ticker: string) {
    navigate(`/analysis/${encodeURIComponent(ticker)}`);
    setQuery("");
    setOpen(false);
  }

  return (
    <div
      className="az-command-backdrop fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh] backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeDialog();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search AzaLens"
        tabIndex={-1}
        className="az-command-dialog w-full max-w-2xl overflow-hidden rounded-[24px] border border-stroke bg-surface shadow-[0_30px_100px_var(--az-shadow-strong)]"
      >
        <Command className="w-full bg-transparent">
          <div className="flex items-center border-b border-stroke px-4 sm:px-5">
            <Search
              size={19}
              strokeWidth={1.8}
              className="mr-3 shrink-0 text-brand"
            />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search stocks by name, ticker, or sector..."
              className="w-full bg-transparent py-5 text-sm text-ink outline-none placeholder:text-ink-muted"
            />
            <kbd className="rounded-lg border border-stroke bg-surface-soft px-2 py-1 text-[10px] font-semibold text-ink-muted">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[380px] space-y-1 overflow-y-auto p-2.5">
            <Command.Empty className="px-5 py-10 text-center text-sm text-ink-muted">
              {query.trim()
                ? "No matching listed company found."
                : "Start typing a symbol or company name."}
            </Command.Empty>

            {results.map((stock) => (
              <Command.Item
                key={stock.id}
                value={`${stock.ticker} ${stock.company} ${stock.exchange}`}
                onSelect={() => openStock(stock.ticker)}
                className="group flex cursor-pointer items-center justify-between rounded-2xl px-3 py-3 text-sm text-ink-soft transition-colors data-[selected=true]:bg-brand/10 data-[selected=true]:text-ink sm:px-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/20 bg-brand/10 font-display text-xs font-bold text-brand">
                    {stock.ticker.slice(0, 2)}
                  </span>

                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">
                      {stock.ticker}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {stock.company}
                    </span>
                  </span>
                </div>

                <div className="ml-4 flex items-center gap-3">
                  <span className="hidden rounded-full border border-stroke bg-surface-soft px-2.5 py-1 text-[10px] font-semibold text-ink-muted sm:inline-flex">
                    {stock.exchange}
                  </span>
                  <ArrowUpRight
                    size={16}
                    className="text-ink-muted transition group-data-[selected=true]:text-brand"
                  />
                </div>
              </Command.Item>
            ))}
          </Command.List>

          <div className="flex items-center justify-between border-t border-stroke px-5 py-3 text-[11px] text-ink-muted">
            <span>Listed company shares only</span>
            <span>↵ Open · ↑↓ Navigate</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
