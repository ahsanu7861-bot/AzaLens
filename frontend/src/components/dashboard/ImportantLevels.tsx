import type { StructureReference } from "../../types/analysis"

type ImportantLevelsProps = {
  support?: StructureReference | null
  actionableConfluence?: StructureReference | null
  strongestConfluence?: StructureReference | null
  actionableDistancePercent?: number
}

function formatPrice(value?: string | number) {
  if (value === undefined || value === null || value === '') {
    return '--'
  }

  const numericValue = Number(value)

  if (Number.isNaN(numericValue)) {
    return String(value)
  }

  return `$${numericValue.toFixed(2)}`
}

export default function ImportantLevels({
  support,
  actionableConfluence,
  strongestConfluence,
  actionableDistancePercent = 5,
}: ImportantLevelsProps) {
  const supportDistance = support?.distancePercent
  const actionableDistance = actionableConfluence?.distancePercent
  const strongestDistance = strongestConfluence?.distancePercent
  const strongestIsOutsideSwingWindow =
    !actionableConfluence &&
    typeof strongestDistance === "number" &&
    strongestDistance > actionableDistancePercent

  return (
    <article className="az-card az-secondary-card p-5">
      <h3 className="font-display font-semibold text-ink">Important Levels</h3>

      <div className="mt-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-sm text-ink-muted">Nearest support</span>
            {typeof supportDistance === "number" && (
              <p className="mt-1 text-[11px] text-ink-muted">
                {supportDistance.toFixed(1)}% from the analysis price
              </p>
            )}
          </div>

          <span className="az-numeric font-medium text-ink">
            {formatPrice(support?.zone?.center)}
          </span>
        </div>

        <div className="h-px bg-stroke" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-sm text-ink-muted">
              Actionable confluence
            </span>
            <p className="mt-1 text-[11px] leading-4 text-ink-muted">
              Multi-source evidence within {actionableDistancePercent}% of price
            </p>
          </div>

          <span
            className={[
              "az-numeric text-right text-sm font-medium",
              actionableConfluence ? "text-ink" : "text-ink-muted",
            ].join(" ")}
          >
            {actionableConfluence
              ? formatPrice(actionableConfluence.zone?.center)
              : `None within ${actionableDistancePercent}%`}
          </span>
        </div>

        {actionableConfluence && (
          <p className="rounded-xl border border-positive/15 bg-positive/10 px-3 py-2 text-[11px] leading-4 text-ink-soft">
            {typeof actionableDistance === "number"
              ? `${actionableDistance.toFixed(1)}% from price · `
              : ""}
            {actionableConfluence.sourceCount ?? "Multiple"} independent sources
            {typeof actionableConfluence.score === "number"
              ? ` · score ${Math.round(actionableConfluence.score)}`
              : ""}
          </p>
        )}

        {strongestIsOutsideSwingWindow && (
          <p className="rounded-xl border border-caution/15 bg-caution/10 px-3 py-2 text-[11px] leading-4 text-ink-soft">
            The highest-evidence structural zone is{" "}
            {formatPrice(strongestConfluence?.zone?.center)} (
            {strongestDistance.toFixed(1)}% away). It remains a deeper reference,
            but is outside the immediate swing window.
          </p>
        )}
      </div>
    </article>
  )
}
