import React from 'react';
import { DepartmentFinancialRow } from '../../domain/financials';

interface DepartmentFinancialComparisonChartProps {
  rows: DepartmentFinancialRow[];
  compact?: boolean;
}

function formatCompactEur(val: number): string {
  const abs = Math.abs(Math.round(val));
  const sign = val < 0 ? '-' : '';
  if (abs >= 1000) {
    const k = abs / 1000;
    const label = abs >= 10000 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, '');
    return `${sign}€${label}k`;
  }
  return `${sign}€${abs}`;
}

function formatFullEur(val: number): string {
  const sign = val < 0 ? '-' : '';
  return `${sign}€${Math.abs(Math.round(val)).toLocaleString('en-US')}`;
}

export const DepartmentFinancialComparisonChart: React.FC<
  DepartmentFinancialComparisonChartProps
> = ({ rows, compact = false }) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
        No department financial benefits or AI costs recorded for the selected year and filter.
      </div>
    );
  }

  const width = 660;
  const height = compact ? 155 : 225;
  const padLeft = 56;
  const padRight = 20;
  const padTop = 22;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allValues = [
    0,
    ...rows.flatMap((r) => [
      r.realizedFinancialBenefitsEur,
      r.actualAiCostsEur,
      r.netFinancialBenefitEur,
    ]),
  ];
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(1000, ...allValues);
  const span = Math.max(1, maxVal - minVal);

  const yPos = (val: number) => padTop + ((maxVal - val) / span) * plotH;
  const zeroY = yPos(0);

  const groupW = plotW / rows.length;
  const barW = Math.min(26, Math.max(12, groupW * 0.22));
  const gap = 4;

  const gridTicks = minVal < 0 ? [minVal, 0, maxVal * 0.5, maxVal] : [0, maxVal * 0.5, maxVal];

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
          <span>Realized Financial Benefits</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-rose-600" />
          <span>AI Costs (Actual)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-[#004F9F]" />
          <span>Net Benefit (Cash + Avoidance − Costs)</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={`${compact ? 'h-36' : 'h-56'} w-full min-w-[440px]`}
          role="img"
          aria-label="Department comparison of realized financial benefits, AI costs, and net benefit"
        >
          {gridTicks.map((val, idx) => {
            const y = yPos(val);
            const isZero = val === 0;
            return (
              <g key={`${idx}-${val}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke={isZero ? '#94a3b8' : '#e2e8f0'}
                  strokeWidth={isZero ? 1.25 : 1}
                  strokeDasharray={isZero && minVal < 0 ? '3 3' : undefined}
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

          {rows.map((r, idx) => {
            const cx = padLeft + idx * groupW + groupW / 2;
            const totalBarsW = barW * 3 + gap * 2;
            const startX = cx - totalBarsW / 2;

            const bars = [
              {
                key: 'ben',
                val: r.realizedFinancialBenefitsEur,
                fill: '#059669',
                x: startX,
                title: `${r.departmentName} Realized Benefits: ${formatFullEur(r.realizedFinancialBenefitsEur)}`,
              },
              {
                key: 'cost',
                val: r.actualAiCostsEur,
                fill: '#e11d48',
                x: startX + barW + gap,
                title: `${r.departmentName} AI Costs (Actual): ${formatFullEur(r.actualAiCostsEur)}`,
              },
              {
                key: 'net',
                val: r.netFinancialBenefitEur,
                fill: r.netFinancialBenefitEur >= 0 ? '#004F9F' : '#b91c1c',
                x: startX + (barW + gap) * 2,
                title: `${r.departmentName} Net Financial Benefit: ${formatFullEur(r.netFinancialBenefitEur)}`,
              },
            ];

            return (
              <g key={r.departmentId}>
                {bars.map((b) => {
                  const yVal = yPos(b.val);
                  const topY = Math.min(zeroY, yVal);
                  const barH = Math.max(2, Math.abs(zeroY - yVal));
                  const labelY =
                    b.val >= 0 ? Math.max(12, topY - 4) : Math.min(height - padBottom - 2, topY + barH + 10);
                  return (
                    <g key={b.key}>
                      <rect
                        x={b.x}
                        y={topY}
                        width={barW}
                        height={barH}
                        rx={2}
                        fill={b.fill}
                      >
                        <title>{b.title}</title>
                      </rect>
                      <text
                        x={b.x + barW / 2}
                        y={labelY}
                        textAnchor="middle"
                        className="fill-slate-700 text-[9px] font-semibold tabular-nums"
                      >
                        {formatCompactEur(b.val)}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={cx}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-slate-700 text-[10px] font-semibold"
                >
                  {rows.length > 5 ? r.departmentCode : r.departmentName}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
