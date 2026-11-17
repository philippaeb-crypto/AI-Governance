import React from 'react';
import { MonthlyCostTrendPoint } from '../../domain/financials';

interface CostTrendChartProps {
  points: MonthlyCostTrendPoint[];
  compact?: boolean;
}

function formatCompactEur(val: number): string {
  const abs = Math.abs(Math.round(val));
  const sign = val < 0 ? '-' : '';
  if (abs >= 1000) {
    return `${sign}€${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }
  return `${sign}€${abs}`;
}

export const CostTrendChart: React.FC<CostTrendChartProps> = ({
  points,
  compact = false,
}) => {
  if (points.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
        No monthly AI cost transactions or plans recorded for the active filter.
      </div>
    );
  }

  const hasForecastSeries = points.some(
    (p) => p.forecastEur !== undefined && p.forecastEur !== null
  );

  const width = 660;
  const height = compact ? 185 : 220;
  const padLeft = 52;
  const padRight = 18;
  const padTop = 22;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxSpend = Math.max(
    1000,
    ...points.map((p) =>
      Math.max(p.plannedEur, p.actualEur, p.forecastEur ?? 0)
    )
  );
  const groupW = plotW / points.length;
  const seriesCount = hasForecastSeries ? 3 : 2;
  const barW = Math.min(20, Math.max(6, (groupW * 0.7) / seriesCount));
  const gap = Math.min(3, Math.max(1.5, groupW * 0.04));

  const yPos = (eur: number) => padTop + ((maxSpend - eur) / maxSpend) * plotH;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-slate-300" />
          <span>Planned Budget (EUR)</span>
        </span>
        {hasForecastSeries && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#0066B2]" />
            <span>Latest Forecast (EUR)</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-slate-900" />
          <span>Actual Spend (EUR)</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={`${compact ? 'h-44' : 'h-56'} w-full min-w-[460px]`}
          role="img"
          aria-label="Monthly planned budget, forecast, and actual AI spend trend"
        >
          {[0, 0.5, 1].map((frac) => {
            const val = maxSpend * frac;
            const y = yPos(val);
            return (
              <g key={frac}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] tabular-nums"
                >
                  {formatCompactEur(val)}
                </text>
              </g>
            );
          })}

          {points.map((pt, idx) => {
            const cx = padLeft + idx * groupW + groupW / 2;
            const totalW = barW * seriesCount + gap * (seriesCount - 1);
            const startX = cx - totalW / 2;

            const plannedY = yPos(pt.plannedEur);
            const plannedH = Math.max(0, padTop + plotH - plannedY);
            const actualY = yPos(pt.actualEur);
            const actualH = Math.max(0, padTop + plotH - actualY);

            const forecastVal = pt.forecastEur;
            const forecastY =
              forecastVal !== null && forecastVal !== undefined
                ? yPos(forecastVal)
                : padTop + plotH;
            const forecastH =
              forecastVal !== null && forecastVal !== undefined
                ? Math.max(0, padTop + plotH - forecastY)
                : 0;

            const actualX = hasForecastSeries
              ? startX + (barW + gap) * 2
              : startX + barW + gap;

            const shortLabel =
              points.length > 7 && /^\d{4}-\d{2}$/.test(pt.period)
                ? pt.period.slice(5)
                : pt.period;

            return (
              <g key={pt.period}>
                <rect
                  x={startX}
                  y={plannedY}
                  width={barW}
                  height={plannedH}
                  rx={1.5}
                  fill="#cbd5e1"
                >
                  <title>{`${pt.period} Planned Budget: €${Math.round(pt.plannedEur).toLocaleString('en-US')}`}</title>
                </rect>

                {hasForecastSeries &&
                  (forecastVal !== null && forecastVal !== undefined ? (
                    <rect
                      x={startX + barW + gap}
                      y={forecastY}
                      width={barW}
                      height={forecastH}
                      rx={1.5}
                      fill="#0066B2"
                    >
                      <title>{`${pt.period} Latest Forecast: €${Math.round(forecastVal).toLocaleString('en-US')}`}</title>
                    </rect>
                  ) : (
                    <rect
                      x={startX + barW + gap}
                      y={padTop + plotH - 4}
                      width={barW}
                      height={4}
                      rx={1}
                      fill="#f59e0b"
                    >
                      <title>{`${pt.period}: Missing Forecast data`}</title>
                    </rect>
                  ))}

                <rect
                  x={actualX}
                  y={actualY}
                  width={barW}
                  height={actualH}
                  rx={1.5}
                  fill="#0f172a"
                >
                  <title>{`${pt.period} Actual Spend: €${Math.round(pt.actualEur).toLocaleString('en-US')} · ${pt.tokens.toLocaleString('en-US')} tokens`}</title>
                </rect>

                <text
                  x={cx}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-slate-600 text-[10px] font-medium tabular-nums"
                >
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
