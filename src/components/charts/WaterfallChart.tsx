import React, { useId, useMemo, useState } from 'react';
import { DepartmentWaterfallRow } from '../../domain/financials';

interface WaterfallChartProps {
  rows: DepartmentWaterfallRow[];
  compact?: boolean;
  controlledDeptId?: string;
  onDeptChange?: (deptId: string) => void;
  showDeptSelectInCompact?: boolean;
}

function formatEur(val: number): string {
  const sign = val < 0 ? '-' : '';
  return `${sign}€${Math.abs(Math.round(val)).toLocaleString('en-US')}`;
}

export const WaterfallChart: React.FC<WaterfallChartProps> = ({
  rows,
  compact = false,
  controlledDeptId,
  onDeptChange,
  showDeptSelectInCompact = false,
}) => {
  const selectId = useId();
  const [internalDeptId, setInternalDeptId] = useState<string>('ALL');
  const selectedDeptId = controlledDeptId ?? internalDeptId;
  const setSelectedDeptId = (next: string) => {
    if (onDeptChange) {
      onDeptChange(next);
    } else {
      setInternalDeptId(next);
    }
  };

  const activeData = useMemo(() => {
    if (selectedDeptId === 'ALL') {
      const cash = rows.reduce((s, r) => s + r.cashSavingsEur, 0);
      const avoidance = rows.reduce((s, r) => s + r.costAvoidanceEur, 0);
      const costs = rows.reduce((s, r) => s + r.incrementalAiCostsEur, 0);
      return {
        label: 'All Departments Combined',
        cash,
        avoidance,
        costs,
        net: cash + avoidance - costs,
      };
    }
    const found = rows.find((r) => r.departmentId === selectedDeptId);
    if (!found) {
      return {
        label: 'No Data',
        cash: 0,
        avoidance: 0,
        costs: 0,
        net: 0,
      };
    }
    return {
      label: found.departmentName,
      cash: found.cashSavingsEur,
      avoidance: found.costAvoidanceEur,
      costs: found.incrementalAiCostsEur,
      net: found.netFinancialBenefitEur,
    };
  }, [rows, selectedDeptId]);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
        No department financial benefits or AI costs recorded in this dataset yet.
      </div>
    );
  }

  // Waterfall cumulative coordinates
  const s1Start = 0;
  const s1End = activeData.cash;
  const s2Start = s1End;
  const s2End = s1End + activeData.avoidance;
  const s3Start = s2End;
  const s3End = s2End - activeData.costs;
  const s4Start = 0;
  const s4End = activeData.net;

  const allY = [0, s1End, s2End, s3End, s4End];
  const minVal = Math.min(0, ...allY);
  const maxVal = Math.max(1000, ...allY);
  const paddingTop = 28;
  const paddingBottom = 38;
  const chartHeight = 220;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const span = Math.max(1, maxVal - minVal);

  const yPos = (v: number) =>
    paddingTop + ((maxVal - v) / span) * plotHeight;
  const zeroY = yPos(0);

  const bars = [
    {
      label: 'Cash Savings',
      start: s1Start,
      end: s1End,
      display: `+${formatEur(activeData.cash)}`,
      fill: '#059669',
      x: 70,
    },
    {
      label: 'Cost Avoidance',
      start: s2Start,
      end: s2End,
      display: `+${formatEur(activeData.avoidance)}`,
      fill: '#0d9488',
      x: 205,
    },
    {
      label: 'Incremental AI Costs',
      start: s3Start,
      end: s3End,
      display: `-${formatEur(activeData.costs)}`,
      fill: '#e11d48',
      x: 340,
    },
    {
      label: 'Net Financial Benefit',
      start: s4Start,
      end: s4End,
      display: formatEur(activeData.net),
      fill: activeData.net >= 0 ? '#0f172a' : '#b91c1c',
      x: 475,
    },
  ];

  const showSelect = !compact || showDeptSelectInCompact;

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-slate-700">
          {activeData.label} · Formula: Cash Savings + Cost Avoidance − Incremental AI Costs
        </div>
        {showSelect && (
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="sr-only">
              Filter waterfall chart by department
            </label>
            <select
              id={selectId}
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none"
            >
              <option value="ALL">All Departments Combined</option>
              {rows.map((r) => (
                <option key={r.departmentId} value={r.departmentId}>
                  {r.departmentName} ({r.departmentCode})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 600 220"
          className={`${compact ? 'h-36' : 'h-56'} w-full min-w-[420px]`}
          role="img"
          aria-label={`Department net financial benefit waterfall for ${activeData.label}`}
        >
          {/* Baseline zero axis */}
          <line
            x1={40}
            y1={zeroY}
            x2={575}
            y2={zeroY}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={34}
            y={zeroY + 3}
            textAnchor="end"
            className="fill-slate-400 text-[10px] tabular-nums"
          >
            €0
          </text>

          {/* Connector lines between steps */}
          <line
            x1={150}
            y1={yPos(s1End)}
            x2={205}
            y2={yPos(s1End)}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <line
            x1={285}
            y1={yPos(s2End)}
            x2={340}
            y2={yPos(s2End)}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <line
            x1={420}
            y1={yPos(s3End)}
            x2={475}
            y2={yPos(s3End)}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="2 2"
          />

          {bars.map((b) => {
            const topY = Math.min(yPos(b.start), yPos(b.end));
            const height = Math.max(4, Math.abs(yPos(b.end) - yPos(b.start)));
            const labelY = Math.max(14, topY - 7);
            return (
              <g key={b.label}>
                <rect
                  x={b.x}
                  y={topY}
                  width={80}
                  height={height}
                  rx={3}
                  fill={b.fill}
                >
                  <title>{`${b.label}: ${b.display}`}</title>
                </rect>
                <text
                  x={b.x + 40}
                  y={labelY}
                  textAnchor="middle"
                  className="fill-slate-900 text-[11px] font-semibold tabular-nums"
                >
                  {b.display}
                </text>
                <text
                  x={b.x + 40}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  className="fill-slate-600 text-[10px] font-medium"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
