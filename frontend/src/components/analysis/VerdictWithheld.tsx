import { ShieldAlert } from "lucide-react";

type VerdictWithheldProps = {
  message?: string | null;
  onViewShariah?: () => void;
};

const DEFAULT_MESSAGE =
  "AAOIFI Shariah compliance has not been confirmed for this stock, so AzaLens withholds its trade analysis. Details are in the Shariah Compliance workspace.";

export default function VerdictWithheld({
  message,
  onViewShariah,
}: VerdictWithheldProps) {
  return (
    <section className="az-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-caution/10 text-caution">
          <ShieldAlert size={19} strokeWidth={1.8} />
        </span>

        <div>
          <p className="az-eyebrow text-caution">Analysis withheld</p>

          <h2 className="mt-2 font-display text-xl font-semibold text-ink">
            Compliance comes before the verdict
          </h2>
        </div>
      </div>

      <p className="mt-5 text-sm leading-6 text-ink-soft">
        {message || DEFAULT_MESSAGE}
      </p>

      <p className="mt-3 text-sm leading-6 text-ink-muted">
        Market data, chart, and screening evidence remain available.
        The directional verdict unlocks only when AAOIFI compliance
        is confirmed.
      </p>

      {onViewShariah ? (
        <button
          type="button"
          onClick={onViewShariah}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-caution/25 px-4 py-2 text-sm font-semibold text-caution transition hover:bg-caution/10"
        >
          View Shariah screening
        </button>
      ) : null}
    </section>
  );
}
