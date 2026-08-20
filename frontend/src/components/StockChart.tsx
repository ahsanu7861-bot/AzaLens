import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import { useTheme } from '../app/providers/theme';
import type {
  HistoricalBar,
  HistoryResponse,
} from '../types/analysis';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://api.azalens.com';

type StockChartProps = {
  symbol: string;
};

function calculateSMA(
  bars: HistoricalBar[],
  period: number,
): LineData<Time>[] {
  const results: LineData<Time>[] = [];

  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1);

    const average =
      window.reduce((total, bar) => total + bar.close, 0) /
      period;

    results.push({
      time: bars[index].date as Time,
      value: Number(average.toFixed(2)),
    });
  }

  return results;
}

function calculateEMA(
  bars: HistoricalBar[],
  period: number,
): LineData<Time>[] {
  if (bars.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);

  const initialAverage =
    bars
      .slice(0, period)
      .reduce((total, bar) => total + bar.close, 0) /
    period;

  let previousEMA = initialAverage;

  const results: LineData<Time>[] = [
    {
      time: bars[period - 1].date as Time,
      value: Number(initialAverage.toFixed(2)),
    },
  ];

  for (let index = period; index < bars.length; index += 1) {
    const currentEMA =
      (bars[index].close - previousEMA) * multiplier +
      previousEMA;

    results.push({
      time: bars[index].date as Time,
      value: Number(currentEMA.toFixed(2)),
    });

    previousEMA = currentEMA;
  }

  return results;
}

export default function StockChart({
  symbol,
}: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();

  const [bars, setBars] = useState<HistoricalBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      try {
        setLoading(true);
        setError('');

        const normalizedSymbol = symbol.trim().toUpperCase();

        const response = await fetch(
          `${API_BASE_URL}/history/${encodeURIComponent(
            normalizedSymbol,
          )}`,
          {
            signal: controller.signal,
            credentials: 'include',
          },
        );

        if (!response.ok) {
          throw new Error(
            `Historical data request failed with status ${response.status}.`,
          );
        }

        const result =
          (await response.json()) as HistoryResponse;

        if (
          result.success !== true ||
          !Array.isArray(result.bars) ||
          result.bars.length === 0
        ) {
          throw new Error(
            result.error ||
              `No historical data was returned for ${normalizedSymbol}.`,
          );
        }

        const validBars = result.bars
          .filter(
            (bar) =>
              typeof bar.date === 'string' &&
              Number.isFinite(bar.open) &&
              Number.isFinite(bar.high) &&
              Number.isFinite(bar.low) &&
              Number.isFinite(bar.close) &&
              Number.isFinite(bar.volume),
          )
          .sort((first, second) =>
            first.date.localeCompare(second.date),
          );

        if (validBars.length === 0) {
          throw new Error(
            `No valid historical bars were returned for ${normalizedSymbol}.`,
          );
        }

        setBars(validBars);
      } catch (caughtError) {
        if (
          caughtError instanceof DOMException &&
          caughtError.name === 'AbortError'
        ) {
          return;
        }

        setBars([]);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to load chart data.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => controller.abort();
  }, [symbol]);

  useEffect(() => {
    const container = chartContainerRef.current;

    if (!container || bars.length === 0) {
      return;
    }

    const isDayTheme = resolvedTheme === 'day';
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientWidth < 640 ? 280 : 520,

      layout: {
        background: {
          type: ColorType.Solid,
          color: isDayTheme ? '#ffffff' : '#080e18',
        },
        textColor: isDayTheme ? '#77849a' : '#7f8ca1',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
        attributionLogo: false,
      },

      grid: {
        vertLines: {
          color: isDayTheme
            ? 'rgba(119, 132, 154, 0.12)'
            : 'rgba(127, 140, 161, 0.09)',
        },
        horzLines: {
          color: isDayTheme
            ? 'rgba(119, 132, 154, 0.12)'
            : 'rgba(127, 140, 161, 0.09)',
        },
      },

      crosshair: {
        mode: CrosshairMode.Normal,
      },

      rightPriceScale: {
        borderColor: isDayTheme ? '#dce4ef' : '#1c2637',
        scaleMargins: {
          top: 0.08,
          bottom: 0.25,
        },
      },

      timeScale: {
        borderColor: isDayTheme ? '#dce4ef' : '#1c2637',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 3,
      },

      localization: {
        priceFormatter: (price: number) =>
          `$${price.toFixed(2)}`,
      },
    });

    const candlestickSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        priceLineVisible: true,
        lastValueVisible: true,
      },
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      title: 'EMA 20',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    const smaSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      title: 'SMA 50',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    const candlestickData: CandlestickData<Time>[] =
      bars.map((bar) => ({
        time: bar.date as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

    const volumeData: HistogramData<Time>[] = bars.map(
      (bar) => ({
        time: bar.date as Time,
        value: bar.volume,
        color:
          bar.close >= bar.open
            ? 'rgba(34, 197, 94, 0.45)'
            : 'rgba(239, 68, 68, 0.45)',
      }),
    );

    candlestickSeries.setData(candlestickData);
    volumeSeries.setData(volumeData);
    emaSeries.setData(calculateEMA(bars, 20));
    smaSeries.setData(calculateSMA(bars, 50));

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.width < 640 ? 280 : 520,
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [bars, resolvedTheme]);

  return (
    <section className="az-chart-card min-h-[280px] overflow-hidden rounded-2xl border border-stroke bg-surface shadow-[var(--az-card-shadow)]">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
          padding: '20px 22px 10px',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <h2
              style={{
                margin: 0,
                color: 'var(--az-text)',
                fontSize: '22px',
                fontFamily: 'var(--az-font-display)',
              }}
            >
              {symbol.toUpperCase()} Price Chart
            </h2>

            <span
              style={{
                padding: '5px 9px',
                borderRadius: '999px',
                background: 'var(--az-brand-soft)',
                color: 'var(--az-brand)',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              1D
            </span>
          </div>

          <p
            style={{
              margin: '6px 0 0',
              color: 'var(--az-text-muted)',
              fontSize: '13px',
            }}
          >
            Candlesticks · Volume · EMA 20 · SMA 50
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '18px',
          flexWrap: 'wrap',
          padding: '16px 22px 14px',
          color: 'var(--az-text-muted)',
          fontSize: '12px',
        }}
      >
        <span>
          <strong style={{ color: '#38bdf8' }}>—</strong>{' '}
          EMA 20
        </span>

        <span>
          <strong style={{ color: '#f59e0b' }}>—</strong>{' '}
          SMA 50
        </span>

        <span>
          <strong style={{ color: '#22c55e' }}>■</strong>{' '}
          Bullish candle
        </span>

        <span>
          <strong style={{ color: '#ef4444' }}>■</strong>{' '}
          Bearish candle
        </span>
      </div>

      {loading && (
        <div
          style={{
            height: '520px',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--az-text-muted)',
          }}
        >
          Loading {symbol.toUpperCase()} chart…
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            height: '300px',
            display: 'grid',
            placeItems: 'center',
            padding: '30px',
            color: 'var(--az-critical)',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="az-chart-viewport">
          <div
            ref={chartContainerRef}
            style={{
              width: '100%',
              minHeight: '520px',
            }}
          />
        </div>
      )}

      <div
        style={{
          padding: '9px 22px 16px',
          color: 'var(--az-text-muted)',
          fontSize: '11px',
          textAlign: 'right',
        }}
      >
        Charts powered by{' '}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-ink-soft transition-colors hover:text-brand"
        >
          TradingView Lightweight Charts™
        </a>
      </div>
    </section>
  );
}
