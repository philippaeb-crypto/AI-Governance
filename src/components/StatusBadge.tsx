import React from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardList,
  Code2,
  FlaskConical,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';
import {
  formatRedundancyStatusLabel,
  LegacyRedundancyCaseStatus,
  LIFECYCLE_LABELS,
  LifecycleStatus,
  normalizeRedundancyCaseStatus,
  OWNER_ALIGNMENT_STANCE_LABELS,
  OwnerAlignmentStance,
  RedundancyCaseStatus,
} from '../domain/types';

interface LifecycleStatusBadgeProps {
  status: LifecycleStatus;
}

const STATUS_STYLE_MAP: Record<
  LifecycleStatus,
  { classes: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  [LifecycleStatus.IDEA]: {
    classes: 'border-slate-300 bg-slate-50 text-slate-700',
    Icon: Lightbulb,
  },
  [LifecycleStatus.ASSESSMENT]: {
    classes: 'border-amber-300 bg-amber-50 text-amber-800',
    Icon: ClipboardList,
  },
  [LifecycleStatus.DEVELOPMENT]: {
    classes: 'border-sky-300 bg-sky-50 text-sky-800',
    Icon: Code2,
  },
  [LifecycleStatus.PILOT]: {
    classes: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    Icon: FlaskConical,
  },
  [LifecycleStatus.PRODUCTION]: {
    classes: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    Icon: CheckCircle2,
  },
  [LifecycleStatus.MONITORING]: {
    classes: 'border-teal-300 bg-teal-50 text-teal-800',
    Icon: Activity,
  },
  [LifecycleStatus.SCALE_IMPROVE]: {
    classes: 'border-blue-300 bg-blue-50 text-blue-800',
    Icon: TrendingUp,
  },
  [LifecycleStatus.RETIRE]: {
    classes: 'border-slate-200 bg-slate-100 text-slate-500',
    Icon: Archive,
  },
};

export const LifecycleStatusBadge: React.FC<LifecycleStatusBadgeProps> = ({
  status,
}) => {
  const { classes, Icon } = STATUS_STYLE_MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{LIFECYCLE_LABELS[status]}</span>
    </span>
  );
};

interface ReviewStatusIndicatorProps {
  nextReviewDue: string;
  lifecycleStatus: LifecycleStatus;
  overdue: boolean;
  dueSoon: boolean;
}

export const ReviewStatusIndicator: React.FC<ReviewStatusIndicatorProps> = ({
  nextReviewDue,
  lifecycleStatus,
  overdue,
  dueSoon,
}) => {
  const formatted = new Date(nextReviewDue).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (lifecycleStatus === LifecycleStatus.RETIRE) {
    return (
      <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
        Retired
      </span>
    );
  }

  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 tabular-nums whitespace-nowrap">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Overdue ({formatted})</span>
      </span>
    );
  }

  if (dueSoon) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 tabular-nums whitespace-nowrap">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Due {formatted}</span>
      </span>
    );
  }

  return (
    <span className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
      {formatted}
    </span>
  );
};

const CASE_STATUS_CLASSES: Record<RedundancyCaseStatus, string> = {
  NEW: 'border-slate-300 bg-slate-50 text-slate-700',
  IN_REVIEW: 'border-sky-300 bg-sky-50 text-sky-800',
  ACTION_AGREED: 'border-teal-300 bg-teal-50 text-teal-800',
  ESCALATED: 'border-red-300 bg-red-50 text-red-800',
  CLOSED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};

export const RedundancyCaseStatusBadge: React.FC<{
  status: RedundancyCaseStatus | LegacyRedundancyCaseStatus;
}> = ({ status }) => {
  const normalized = normalizeRedundancyCaseStatus(status);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${CASE_STATUS_CLASSES[normalized]}`}
    >
      {formatRedundancyStatusLabel(normalized)}
    </span>
  );
};

const STANCE_CLASSES: Record<OwnerAlignmentStance, string> = {
  PENDING: 'border-slate-200 bg-slate-50 text-slate-600',
  AGREED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  DISAGREED: 'border-red-300 bg-red-50 text-red-800',
  NEEDS_INFO: 'border-amber-300 bg-amber-50 text-amber-900',
};

export const OwnerStanceBadge: React.FC<{
  stance: OwnerAlignmentStance;
}> = ({ stance }) => (
  <span
    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0 ${STANCE_CLASSES[stance]}`}
  >
    {OWNER_ALIGNMENT_STANCE_LABELS[stance]}
  </span>
);

