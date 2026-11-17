import React from 'react';

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      aria-busy="true"
      aria-label="Loading records"
    >
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-slate-200">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-64 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-6 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
};
