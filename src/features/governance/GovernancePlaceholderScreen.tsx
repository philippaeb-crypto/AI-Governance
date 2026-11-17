import React from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { useApp } from '../../services/appContext';

interface GovernancePlaceholderConfig {
  title: string;
  subtitle: string;
  plannedCapabilities: string[];
  phase2Dependencies: string[];
}

const PLACEHOLDER_MAP: Record<
  'gov-savings' | 'gov-redundancy' | 'gov-similarity' | 'gov-imports',
  GovernancePlaceholderConfig
> = {
  'gov-savings': {
    title: 'Savings & Costs',
    subtitle:
      'Financial benefit realization, Azure AI/Copilot licensing cost allocation, and budget variance tracking.',
    plannedCapabilities: [
      'Structured cost ledger imports linked to department cost centers',
      'Separation of non-cash productivity hours from validated hard cost savings',
      'Multi-year TCO vs. realized benefit reconciliation',
    ],
    phase2Dependencies: [
      'Azure SQL financial ledger tables',
      'ERP / FinOps cost export ingestion pipeline',
    ],
  },
  'gov-redundancy': {
    title: 'Redundancy & Synergies',
    subtitle:
      'Cross-departmental overlap detection, platform consolidation candidates, and reusable capability synergies.',
    plannedCapabilities: [
      'Portfolio-wide capability clustering across departments',
      'Identification of duplicate vendor SaaS vs. internal Copilot Studio builds',
      'Consolidation tracking and shared-owner handoff workflows',
    ],
    phase2Dependencies: [
      'Embeddings-based semantic indexing in Azure AI Search / pgvector',
      'Governance review disposition workflow',
    ],
  },
  'gov-similarity': {
    title: 'Governance Similarity Reviews',
    subtitle:
      'Dedicated queue for reviewing potential initiative overlaps flagged during Smart Intake.',
    plannedCapabilities: [
      'Triage queue of newly registered initiatives with high cross-department similarity',
      'Merge, link-as-synergy, or mark-distinct governance dispositions',
      'Audit trail linking intake similarity snapshots to governance outcomes',
    ],
    phase2Dependencies: [
      'Server-side similarity scoring service',
      'Microsoft Teams / Outlook governance review notifications',
    ],
  },
  'gov-imports': {
    title: 'Data Imports & M365 Sync Jobs',
    subtitle:
      'Batch onboarding from spreadsheets, Microsoft Lists initial inventory import, and sync outbox monitoring.',
    plannedCapabilities: [
      'CSV / Excel portfolio bulk import with dry-run validation',
      'Microsoft Lists initial full import retaining SharePoint siteId/listId/itemId',
      'Bidirectional sync conflict inspector (ETag & optimistic concurrency)',
    ],
    phase2Dependencies: [
      'MicrosoftGraphSyncAdapter implementation',
      'Azure SQL transactional outbox worker',
    ],
  },
};

export const GovernancePlaceholderScreen: React.FC<{
  pageKey: 'gov-savings' | 'gov-redundancy' | 'gov-similarity' | 'gov-imports';
}> = ({ pageKey }) => {
  const { navigate } = useApp();
  const config = PLACEHOLDER_MAP[pageKey];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Not Yet Implemented — Planned for Phase 2</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          {config.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{config.subtitle}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Phase 1 Status Disclosure
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          This module is intentionally scoped out of the Phase 1 inventory
          prototype. No synthetic charts, fabricated financial savings, or
          simulated redundancy scores are rendered here.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-slate-200 pt-5 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-800">
              Planned Phase 2 Capabilities
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-600">
              {config.plannedCapabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-800">
              Target Azure / Microsoft 365 Dependencies
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-600">
              {config.phase2Dependencies.map((dep) => (
                <li key={dep}>{dep}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => navigate({ page: 'gov-overview' })}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Return to Executive Overview</span>
          </button>
        </div>
      </div>
    </div>
  );
};
