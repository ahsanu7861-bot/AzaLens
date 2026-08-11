import { BrainCircuit } from 'lucide-react'

type EvidenceSummaryProps = {
  trend: string
  confidence: string | number
  risk: string
  shariah: string
  explanation: string
}

export default function EvidenceSummary({
  trend,
  confidence,
  risk,
  shariah,
  explanation,
}: EvidenceSummaryProps) {
  const normalizedShariah = shariah.trim().toLowerCase()
  const shariahTone =
    normalizedShariah === 'compliant'
      ? 'text-positive'
      : normalizedShariah === 'non-compliant'
        ? 'text-critical'
        : 'text-caution'
  const confidenceLabel =
    typeof confidence === 'number' ? `${confidence}%` : confidence

  return (
    <article className="az-card az-workspace-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold text-ink">
            Market Thesis
          </h3>

          <p className="mt-1 text-sm text-ink-muted">
            Clear interpretation of the technical evidence
          </p>
        </div>

        <BrainCircuit className="text-intelligence" size={22} />
      </div>

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-4">
            <p className="text-xs text-ink-muted">Trend</p>

            <p className="az-numeric mt-2 text-lg font-semibold text-positive">
              {trend}
            </p>
          </div>

          <div className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-4">
            <p className="text-xs text-ink-muted">Evidence Agreement</p>

            <p className="az-numeric mt-2 text-lg font-semibold text-ink">
              {confidenceLabel}
            </p>
          </div>

          <div className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-4">
            <p className="text-xs text-ink-muted">Risk</p>

            <p className="az-numeric mt-2 text-lg font-semibold text-caution">
              {risk}
            </p>
          </div>

          <div className="az-subcard rounded-2xl border border-stroke bg-surface-soft p-4">
            <p className="text-xs text-ink-muted">AAOIFI Shariah</p>

            <p className={`mt-2 text-lg font-semibold ${shariahTone}`}>
              {shariah}
            </p>
          </div>
        </div>

        <div className="az-subcard rounded-2xl border border-intelligence/20 bg-intelligence/5 p-5">
          <h4 className="mb-2 font-semibold text-intelligence">
            Thesis Summary
          </h4>

          <p className="leading-7 text-ink-soft">
            {explanation}
          </p>
        </div>
      </div>
    </article>
  )
}
