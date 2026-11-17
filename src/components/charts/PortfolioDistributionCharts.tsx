import React from 'react';
import { ABBOTT_THEME } from '../../branding/abbottTheme';
import {
  LifecycleStatus,
  PortfolioMetrics,
} from '../../domain/types';

interface PortfolioDistributionChartsProps {
  metrics: PortfolioMetrics;
  activeDepartmentId?: string;
  activeStatus?: LifecycleStatus | '';
  onSelectDepartment?: (departmentId: string) => void;
  onSelectStatus?: (status: LifecycleStatus | '') => void;
  compact?: boolean;
}

export const PortfolioDistributionCharts: React.FC<
  PortfolioDistributionChartsProps
> = ({
  metrics,
  activeDepartmentId = '',
  activeStatus = '',
  onSelectDepartment,
  onSelectStatus,
  compact = false,
}) => {
  const maxStageCount = Math.max(
    1,
    ...metrics.lifecycleDistribution.map((s) => s.count)
  );
  const maxDeptCount = Math.max(
    1,
    ...metrics.departmentBreakdown.map((d) => d.totalCount)
  );
  const total = Math.max(1, metrics.totalInitiatives);

  const cohorts = [
    {
      id: 'pipeline',
      label: 'Pipeline (Idea–Dev)',
      count: metrics.pipelineCount,
      color: '#0066B2',
      bgClass: 'bg-[#0066B2]',
    },
    {
      id: 'live',
      label: 'Live Portfolio (Pilot + Prod)',
      count: metrics.liveCount,
      color: '#059669',
      bgClass: 'bg-emerald-600',
    },
    {
      id: 'monitoring',
      label: 'Monitoring',
      count: metrics.monitoringCount,
      color: '#0D9488',
      bgClass: 'bg-teal-600',
    },
    {
      id: 'scale',
      label: 'Scale / Improve',
      count: metrics.scaleImproveCount,
      color: '#4F46E5',
      bgClass: 'bg-indigo-600',
    },
    {
      id: 'retire',
      label: 'Retire',
      count: metrics.retiredCount,
      color: '#64748B',
      bgClass: 'bg-slate-500',
    },
  ];

  const interactive = Boolean(onSelectStatus || onSelectDepartment);

  return (
    <div
      className={`grid grid-cols-1 gap-4 ${compact ? 'lg:grid-cols-2' : 'lg:grid-cols-2'}`}
    >
      {/* 1. Interactive Lifecycle Funnel */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Lifecycle Funnel (8 Stages)
          </h3>
          {interactive && activeStatus && onSelectStatus && (
            <button
              type="button"
              onClick={() => onSelectStatus('')}
              className="text-[11px] font-medium text-[#004F9F] hover:underline"
            >
              Clear Stage Filter
            </button>
          )}
        </div>
        <div className="mt-3 space-y-1.5">
          {metrics.lifecycleDistribution.map((item) => {
            const widthPct =
              item.count === 0
                ? 0
                : Math.max(8, Math.round((item.count / maxStageCount) * 100));
            const isSelected = activeStatus === item.status;
            const color = ABBOTT_THEME.stageColors[item.status] ?? '#004F9F';

            return (
              <button
                key={item.status}
                type="button"
                disabled={!onSelectStatus}
                onClick={() =>
                  onSelectStatus?.(isSelected ? '' : item.status)
                }
                aria-label={`Filter by stage ${item.label}: ${item.count}`}
                className={`group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors ${
                  onSelectStatus ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
                } ${isSelected ? 'bg-blue-50 ring-1 ring-[#004F9F]' : ''}`}
              >
                <span className="w-28 shrink-0 truncate font-medium text-slate-700">
                  {item.label}
                </span>
                <div className="flex-1">
                  <div className="h-4 w-full rounded bg-slate-100">
                    <div
                      className="h-4 rounded transition-all"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: color,
                        opacity: activeStatus && !isSelected ? 0.35 : 0.9,
                      }}
                    />
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-[11px] font-semibold text-slate-800 tabular-nums">
                  {item.count} ({item.percentage}%)
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Pipeline vs Live Portfolio + Separate Branches & Department Distribution */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Pipeline vs. Live Portfolio (Separated Cohorts)
          </h3>
          <div className="mt-2.5 flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
            {cohorts
              .filter((c) => c.count > 0)
              .map((c) => (
                <div
                  key={c.id}
                  title={`${c.label}: ${c.count}`}
                  style={{
                    width: `${(c.count / total) * 100}%`,
                    backgroundColor: c.color,
                  }}
                />
              ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-700">
            {cohorts.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 tabular-nums">
                <span
                  className="h-2.5 w-2.5 rounded-xs"
                  style={{ backgroundColor: c.color }}
                />
                <span>{c.label}:</span>
                <strong className="text-slate-900">{c.count}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Department Distribution
            </h3>
            {interactive && activeDepartmentId && onSelectDepartment && (
              <button
                type="button"
                onClick={() => onSelectDepartment('')}
                className="text-[11px] font-medium text-[#004F9F] hover:underline"
              >
                Clear Dept Filter
              </button>
            )}
          </div>

          {metrics.departmentBreakdown.length === 0 ? (
            <div className="mt-2 text-xs text-slate-500">
              No department records match active filters.
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {[...metrics.departmentBreakdown]
                .sort((a, b) => b.totalCount - a.totalCount)
                .slice(0, compact ? 6 : 8)
                .map((dept) => {
                  const pct = Math.max(
                    8,
                    Math.round((dept.totalCount / maxDeptCount) * 100)
                  );
                  const selected = activeDepartmentId === dept.departmentId;
                  return (
                    <button
                      key={dept.departmentId}
                      type="button"
                      disabled={!onSelectDepartment}
                      onClick={() =>
                        onSelectDepartment?.(selected ? '' : dept.departmentId)
                      }
                      aria-label={`Filter by department ${dept.departmentName}: ${dept.totalCount}`}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs ${
                        onSelectDepartment
                          ? 'cursor-pointer hover:bg-slate-50'
                          : 'cursor-default'
                      } ${selected ? 'bg-blue-50 ring-1 ring-[#004F9F]' : ''}`}
                    >
                      <span className="w-36 shrink-0 truncate font-medium text-slate-700">
                        {dept.departmentName}
                      </span>
                      <div className="flex-1">
                        <div className="h-3 w-full rounded bg-slate-100">
                          <div
                            className="h-3 rounded bg-[#004F9F]"
                            style={{
                              width: `${pct}%`,
                              opacity:
                                activeDepartmentId && !selected ? 0.35 : 0.9,
                            }}
                          />
                        </div>
                      </div>
                      <span className="w-20 shrink-0 text-right font-mono text-[11px] text-slate-700 tabular-nums">
                        {dept.totalCount} ({dept.activeSolutionsCount} live)
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
