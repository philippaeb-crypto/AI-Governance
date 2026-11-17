import React, { useState } from 'react';
import { ABBOTT_THEME } from '../../branding/abbottTheme';
import { LifecycleAnalyticsSummary } from '../../domain/calculations';
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleStatus,
} from '../../domain/types';

interface LifecycleDistributionRedesignChartsProps {
  analytics: LifecycleAnalyticsSummary;
  activeStage?: LifecycleStatus | '';
  activeDepartmentId?: string;
  onSelectStage?: (stage: LifecycleStatus | '') => void;
  onSelectDepartment?: (departmentId: string) => void;
  onSelectDepartmentStage?: (
    departmentId: string,
    stage: LifecycleStatus
  ) => void;
  onClearDrilldown?: () => void;
  compact?: boolean;
}

export const LifecycleDistributionRedesignCharts: React.FC<
  LifecycleDistributionRedesignChartsProps
> = ({
  analytics,
  activeStage = '',
  activeDepartmentId = '',
  onSelectStage,
  onSelectDepartment,
  onSelectDepartmentStage,
  onClearDrilldown,
  compact = false,
}) => {
  const [labelMode, setLabelMode] = useState<'PERCENT' | 'COUNT'>('PERCENT');
  const [hoveredSegment, setHoveredSegment] = useState<{
    deptName: string;
    stageLabel: string;
    count: number;
    percentage: number;
  } | null>(null);

  const maxOverallCount = Math.max(
    1,
    ...analytics.overallDistribution.map((s) => s.count)
  );
  const interactive = Boolean(
    onSelectStage || onSelectDepartment || onSelectDepartmentStage
  );
  const hasDrilldown = Boolean(activeStage || activeDepartmentId);

  return (
    <div className="space-y-3">
      {/* Ordered 8-Stage Color Legend + Shared Drill-Down Reset */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white ${
          compact ? 'px-3 py-1.5' : 'px-4 py-2.5'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Lifecycle Order:
          </span>
          {LIFECYCLE_ORDER.map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-xs"
                style={{ backgroundColor: ABBOTT_THEME.stageColors[status] }}
              />
              <span>{LIFECYCLE_LABELS[status]}</span>
            </span>
          ))}
        </div>

        {interactive && hasDrilldown && onClearDrilldown && (
          <button
            type="button"
            onClick={onClearDrilldown}
            className="rounded border border-[#BFD7EE] bg-[#EBF3FB] px-2.5 py-1 text-[11px] font-semibold text-[#004F9F] hover:bg-[#DCEAF9] whitespace-nowrap shrink-0"
          >
            Clear Drill-Down & Return to Overview
          </button>
        )}
      </div>

      {/* Primary Side-by-Side Visualizations A & B */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* A. Overall Lifecycle Distribution */}
        <section
          aria-label="Overall Lifecycle Distribution"
          className={`rounded-lg border border-slate-200 bg-white ${
            compact ? 'p-3' : 'p-5'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3
                className={`font-semibold text-slate-900 ${
                  compact ? 'text-xs' : 'text-sm'
                }`}
              >
                Overall Lifecycle Distribution
              </h3>
              <p className="text-[11px] text-slate-500">
                Sorted by defined 8-stage progression · Count & portfolio %
              </p>
            </div>
            {interactive && activeStage && onSelectStage && (
              <button
                type="button"
                onClick={() => onSelectStage('')}
                className="text-[11px] font-medium text-[#004F9F] hover:underline whitespace-nowrap shrink-0"
              >
                Clear Stage
              </button>
            )}
          </div>

          <div className={compact ? 'mt-2 space-y-1.5' : 'mt-3.5 space-y-2'}>
            {analytics.overallDistribution.map((stage) => {
              const widthPct =
                stage.count === 0
                  ? 0
                  : Math.max(6, Math.round((stage.count / maxOverallCount) * 100));
              const isSelected = activeStage === stage.status;
              const stageColor = ABBOTT_THEME.stageColors[stage.status];
              const barColor = stage.isLargest ? '#004F9F' : stageColor;

              return (
                <button
                  key={stage.status}
                  type="button"
                  disabled={!onSelectStage}
                  onClick={() =>
                    onSelectStage?.(isSelected ? '' : stage.status)
                  }
                  aria-label={`${stage.label}: ${stage.count} initiatives (${stage.percentage}%)`}
                  className={`group flex w-full items-center gap-2 rounded-md px-2 ${
                    compact ? 'py-0.5' : 'py-1.5'
                  } text-left text-xs transition-colors ${
                    onSelectStage
                      ? 'cursor-pointer hover:bg-slate-50'
                      : 'cursor-default'
                  } ${
                    isSelected
                      ? 'bg-[#EBF3FB] ring-1 ring-[#004F9F]'
                      : stage.isLargest
                        ? 'bg-[#EBF3FB]/50 ring-1 ring-[#BFD7EE]'
                        : ''
                  }`}
                >
                  <div className="flex w-32 shrink-0 items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-xs"
                      style={{ backgroundColor: stageColor }}
                    />
                    <span
                      className={`truncate ${
                        stage.isLargest
                          ? 'font-bold text-[#004F9F]'
                          : 'font-medium text-slate-700'
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 pr-1">
                    <div
                      className={`w-full overflow-hidden rounded bg-slate-100 ${
                        compact ? 'h-3.5' : 'h-5'
                      }`}
                    >
                      {stage.count > 0 && (
                        <div
                          className={`rounded transition-all ${
                            compact ? 'h-3.5' : 'h-5'
                          }`}
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: barColor,
                            opacity:
                              activeStage && !isSelected
                                ? 0.35
                                : stage.isLargest
                                  ? 1
                                  : 0.85,
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <div
                    className={`flex shrink-0 items-center justify-end gap-1.5 text-right tabular-nums ${
                      compact ? 'w-24' : 'w-40'
                    }`}
                  >
                    {stage.isLargest && !compact && (
                      <span className="rounded bg-[#004F9F] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shrink-0">
                        Largest
                      </span>
                    )}
                    <span
                      className={`font-mono text-xs font-bold ${
                        stage.isLargest ? 'text-[#004F9F]' : 'text-slate-900'
                      }`}
                    >
                      {stage.count}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      ({stage.percentage}%)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* B. Department Lifecycle Distribution (100% Stacked Bar) */}
        <section
          aria-label="Department Lifecycle Distribution"
          className={`flex flex-col justify-between rounded-lg border border-slate-200 bg-white ${
            compact ? 'p-3' : 'p-5'
          }`}
        >
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3
                  className={`font-semibold text-slate-900 ${
                    compact ? 'text-xs' : 'text-sm'
                  }`}
                >
                  Department Lifecycle Distribution (100% Stacked)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Stage share per department ·{' '}
                  {interactive
                    ? 'Click department or stage segment to drill down'
                    : 'Sorted by Operations priority'}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {interactive && activeDepartmentId && onSelectDepartment && (
                  <button
                    type="button"
                    onClick={() => onSelectDepartment('')}
                    className="text-[11px] font-medium text-[#004F9F] hover:underline whitespace-nowrap"
                  >
                    Clear Dept
                  </button>
                )}
                {!compact && (
                  <div
                    role="group"
                    aria-label="Department label format"
                    className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => setLabelMode('PERCENT')}
                      className={`rounded px-2 py-0.5 font-medium transition-colors whitespace-nowrap ${
                        labelMode === 'PERCENT'
                          ? 'bg-white text-[#004F9F] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabelMode('COUNT')}
                      className={`rounded px-2 py-0.5 font-medium transition-colors whitespace-nowrap ${
                        labelMode === 'COUNT'
                          ? 'bg-white text-[#004F9F] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Count
                    </button>
                  </div>
                )}
              </div>
            </div>

            {analytics.departmentRows.length === 0 ? (
              <div className="mt-6 rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                No department initiatives found in the selected scope.
              </div>
            ) : (
              <div className={compact ? 'mt-2 space-y-2' : 'mt-4 space-y-3'}>
                {analytics.departmentRows.map((dept) => {
                  const isDeptSelected =
                    activeDepartmentId === dept.departmentId;
                  return (
                    <div
                      key={dept.departmentId}
                      className={`rounded-md px-2 ${
                        compact ? 'py-1' : 'py-1.5'
                      } transition-colors ${
                        isDeptSelected
                          ? 'bg-[#EBF3FB] ring-1 ring-[#004F9F]'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          disabled={!onSelectDepartment}
                          onClick={() =>
                            onSelectDepartment?.(
                              isDeptSelected ? '' : dept.departmentId
                            )
                          }
                          className={`truncate text-left font-semibold ${
                            onSelectDepartment
                              ? 'cursor-pointer hover:text-[#004F9F] hover:underline'
                              : 'cursor-default'
                          } ${
                            isDeptSelected ? 'text-[#004F9F]' : 'text-slate-800'
                          }`}
                        >
                          {dept.departmentName}
                        </button>
                        <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                          Total: {dept.totalCount}
                        </span>
                      </div>

                      {dept.totalCount === 0 ? (
                        <div
                          className={`flex w-full items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 text-[10px] text-slate-400 ${
                            compact ? 'h-4' : 'h-6'
                          }`}
                        >
                          0 initiatives in scope
                        </div>
                      ) : (
                        <div
                          className={`flex w-full overflow-hidden rounded bg-slate-100 ${
                            compact ? 'h-5' : 'h-7'
                          }`}
                        >
                          {dept.segments
                            .filter((seg) => seg.count > 0)
                            .map((seg) => {
                              const widthPct =
                                (seg.count / dept.totalCount) * 100;
                              const dimmed =
                                (activeStage && activeStage !== seg.status) ||
                                (activeDepartmentId && !isDeptSelected);
                              const showInline = widthPct >= (compact ? 14 : 11);
                              const segText =
                                labelMode === 'PERCENT'
                                  ? `${Math.round(seg.percentage)}%`
                                  : `${seg.count}`;

                              return (
                                <button
                                  key={seg.status}
                                  type="button"
                                  disabled={
                                    !onSelectDepartmentStage && !onSelectStage
                                  }
                                  onClick={() => {
                                    if (onSelectDepartmentStage) {
                                      onSelectDepartmentStage(
                                        dept.departmentId,
                                        seg.status
                                      );
                                    } else {
                                      onSelectStage?.(
                                        activeStage === seg.status
                                          ? ''
                                          : seg.status
                                      );
                                    }
                                  }}
                                  onMouseEnter={() =>
                                    setHoveredSegment({
                                      deptName: dept.departmentName,
                                      stageLabel: seg.label,
                                      count: seg.count,
                                      percentage: seg.percentage,
                                    })
                                  }
                                  onMouseLeave={() => setHoveredSegment(null)}
                                  title={`${dept.departmentName} · ${seg.label}: ${seg.count} (${seg.percentage}%)`}
                                  aria-label={`${dept.departmentName} ${seg.label}: ${seg.count} (${seg.percentage}%)`}
                                  style={{
                                    width: `${widthPct}%`,
                                    backgroundColor:
                                      ABBOTT_THEME.stageColors[seg.status],
                                    opacity: dimmed ? 0.35 : 0.95,
                                  }}
                                  className={`flex items-center justify-center border-r border-white/60 px-1 text-[10px] font-semibold text-white transition-opacity last:border-r-0 tabular-nums ${
                                    onSelectDepartmentStage || onSelectStage
                                      ? 'cursor-pointer hover:brightness-110'
                                      : 'cursor-default'
                                  }`}
                                >
                                  {showInline ? segText : ''}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Exact Segment Breakdown Readout / Hover Tooltip */}
          <div
            className={`mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 ${
              compact ? 'text-[10px]' : ''
            }`}
          >
            {hoveredSegment ? (
              <span>
                <strong className="text-slate-900">
                  {hoveredSegment.deptName}
                </strong>{' '}
                · {hoveredSegment.stageLabel}:{' '}
                <strong className="font-mono text-[#004F9F] tabular-nums">
                  {hoveredSegment.count} initiative
                  {hoveredSegment.count === 1 ? '' : 's'} (
                  {hoveredSegment.percentage}%)
                </strong>
              </span>
            ) : (
              <span>
                Hover or select any stage bar or department segment for exact
                counts & percentages.
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
