import {
  ClarificationQuestion,
  ExcludedUse,
  RegistrableCategory,
  ScopeClarificationAnswers,
  ScopeDecision,
  ScopeEvaluationInput,
  ScopeEvaluationResult,
} from './types';

const GOVERNANCE_VISIBILITY_NOTE =
  'Registration creates portfolio visibility only. It is not a compliance, security, or budget approval gate.';

const PERSONAL_KEYWORDS = [
  'personal notes',
  'my own notes',
  'my calendar',
  'personal inbox',
  'just for me',
  'personal productivity',
  'draft my emails',
  'rewrite my email',
  'my daily tasks',
];

const LEARNING_KEYWORDS = [
  'learning',
  'study',
  'studying',
  'tutorial',
  'sandbox test',
  'python course',
  'certification prep',
  'training exercise',
  'practice prompt',
  'just exploring',
  'playing around',
];

const ONE_TIME_KEYWORDS = [
  'one-time',
  'one time',
  'one-off',
  'one off',
  'single event',
  'ad-hoc',
  'ad hoc',
  'once for a meeting',
  'single presentation',
  'temporary script for today',
];

const AGENT_KEYWORDS = [
  'autonomous',
  'agent',
  'multi-step',
  'copilot studio',
  'tool calling',
  'orchestrate',
  'triage tickets automatically',
  'handles requests end-to-end',
];

const AUTOMATION_KEYWORDS = [
  'power automate',
  'workflow',
  'automate',
  'automation',
  'pipeline',
  'batch',
  'trigger',
  'extract invoice',
  'ocr',
  'document intelligence',
  'scheduled',
];

const ENHANCED_APP_KEYWORDS = [
  'existing app',
  'erp',
  'crm',
  'sap',
  'salesforce',
  'dynamics',
  'sharepoint',
  'portal',
  'embed ai',
  'ai-enhanced',
  'copilot extension',
  'plugin',
];

const DEVELOPED_SOLUTION_KEYWORDS = [
  'custom model',
  'fine-tune',
  'azure ml',
  'python service',
  'custom api',
  'rag application',
  'vector database',
  'custom developed',
  'build from scratch',
];

const SOLUTION_KEYWORDS = [
  'department',
  'team',
  'enterprise',
  'shared',
  'recurring',
  'weekly',
  'daily process',
  'customer support',
  'procurement',
  'finance',
  'hr',
  'operations',
  'compliance review',
];

function containsAny(text: string, patterns: string[]): string[] {
  return patterns.filter((p) => text.includes(p));
}

function buildClarificationQuestions(): ClarificationQuestion[] {
  return [
    {
      id: 'isSharedOrOperational',
      prompt:
        'Who will use this AI capability, and is it part of an operational business process?',
      options: [
        {
          value: 'yes',
          label: 'Shared by a team or supports an operational business workflow',
        },
        {
          value: 'no',
          label: 'Only for my personal use or private learning',
        },
      ],
    },
    {
      id: 'isRepeatableProcess',
      prompt: 'Is this intended for recurring ongoing use or a one-time task?',
      options: [
        {
          value: 'yes',
          label: 'Recurring / ongoing business usage',
        },
        {
          value: 'no',
          label: 'One-time ad-hoc task or short learning exercise',
        },
      ],
    },
    {
      id: 'intendedForm',
      prompt: 'Which implementation pattern best describes the initiative?',
      options: [
        {
          value: 'autonomous_agent',
          label: 'AI Agent (autonomous / multi-step decisioning or tool use)',
        },
        {
          value: 'workflow_automation',
          label: 'AI Automation (triggered workflow, document extraction, routing)',
        },
        {
          value: 'embedded_app',
          label: 'AI-Enhanced App (AI feature inside an existing enterprise system)',
        },
        {
          value: 'custom_developed',
          label: 'AI-Developed Solution (custom-built model, RAG, or API service)',
        },
        {
          value: 'standalone_solution',
          label: 'AI Solution (packaged or configured departmental AI tool)',
        },
        {
          value: 'personal_or_adhoc',
          label: 'Personal prompt / learning / one-off experiment',
        },
      ],
    },
  ];
}

function mapFormToCategory(
  intendedForm: ScopeClarificationAnswers['intendedForm'],
  text: string
): RegistrableCategory {
  switch (intendedForm) {
    case 'autonomous_agent':
      return RegistrableCategory.AI_AGENT;
    case 'workflow_automation':
      return RegistrableCategory.AI_AUTOMATION;
    case 'embedded_app':
      return RegistrableCategory.AI_ENHANCED_APP;
    case 'custom_developed':
      return RegistrableCategory.AI_DEVELOPED_SOLUTION;
    case 'standalone_solution':
      return RegistrableCategory.AI_SOLUTION;
    default:
      break;
  }

  if (containsAny(text, AGENT_KEYWORDS).length > 0) {
    return RegistrableCategory.AI_AGENT;
  }
  if (containsAny(text, DEVELOPED_SOLUTION_KEYWORDS).length > 0) {
    return RegistrableCategory.AI_DEVELOPED_SOLUTION;
  }
  if (containsAny(text, ENHANCED_APP_KEYWORDS).length > 0) {
    return RegistrableCategory.AI_ENHANCED_APP;
  }
  if (containsAny(text, AUTOMATION_KEYWORDS).length > 0) {
    return RegistrableCategory.AI_AUTOMATION;
  }
  return RegistrableCategory.AI_SOLUTION;
}

/**
 * Deterministic rule-based registry scope classifier.
 * Always evaluates explicit rules first before any mock AI suggestion.
 */
export function evaluateRegistryScope(
  input: ScopeEvaluationInput
): ScopeEvaluationResult {
  const text = input.ideaText.trim().toLowerCase();
  const clarifications = input.clarifications ?? {};

  const hasAnyClarification = Boolean(
    clarifications.isSharedOrOperational ||
      clarifications.isRepeatableProcess ||
      clarifications.intendedForm
  );
  const activeQuestions = hasAnyClarification ? buildClarificationQuestions() : [];

  // 1. Check explicit clarification answers for excluded uses
  if (clarifications.intendedForm === 'personal_or_adhoc') {
    return {
      decision: ScopeDecision.NOT_REQUIRED,
      excludedUse: ExcludedUse.PERSONAL,
      reasons: [
        'Clarification indicates personal prompting, learning, or an ad-hoc experiment.',
        'Personal, learning, and one-time uses are excluded from the enterprise AI portfolio registry.',
      ],
      clarificationQuestions: activeQuestions,
      governanceNote: GOVERNANCE_VISIBILITY_NOTE,
    };
  }

  if (clarifications.isSharedOrOperational === 'no') {
    return {
      decision: ScopeDecision.NOT_REQUIRED,
      excludedUse: ExcludedUse.PERSONAL,
      reasons: [
        'Usage is limited to individual personal productivity or private learning rather than a shared operational workflow.',
        'Excluded Category: Personal Productivity / Learning.',
      ],
      clarificationQuestions: activeQuestions,
      governanceNote: GOVERNANCE_VISIBILITY_NOTE,
    };
  }

  if (clarifications.isRepeatableProcess === 'no') {
    return {
      decision: ScopeDecision.NOT_REQUIRED,
      excludedUse: ExcludedUse.ONE_TIME,
      reasons: [
        'Clarification confirms a one-time ad-hoc task rather than a recurring business process.',
        'Excluded Category: One-Time / Ad-Hoc Task.',
      ],
      clarificationQuestions: activeQuestions,
      governanceNote: GOVERNANCE_VISIBILITY_NOTE,
    };
  }

  // 2. Deterministic keyword exclusions (unless user explicitly clarified it IS shared + repeatable)
  const hasExplicitOperationalOverride =
    clarifications.isSharedOrOperational === 'yes' &&
    clarifications.isRepeatableProcess === 'yes';

  if (!hasExplicitOperationalOverride) {
    const personalHits = containsAny(text, PERSONAL_KEYWORDS);
    if (personalHits.length > 0) {
      return {
        decision: ScopeDecision.NOT_REQUIRED,
        excludedUse: ExcludedUse.PERSONAL,
        reasons: [
          `Detected personal productivity indicator ("${personalHits[0]}").`,
          'Individual personal AI usage without shared departmental workflow impact does not require portfolio registration.',
        ],
        clarificationQuestions: [],
        governanceNote: GOVERNANCE_VISIBILITY_NOTE,
      };
    }

    const learningHits = containsAny(text, LEARNING_KEYWORDS);
    if (learningHits.length > 0) {
      return {
        decision: ScopeDecision.NOT_REQUIRED,
        excludedUse: ExcludedUse.LEARNING,
        reasons: [
          `Detected learning or experimentation indicator ("${learningHits[0]}").`,
          'Self-guided learning, tutorials, and unshared sandbox experiments are excluded from registration.',
        ],
        clarificationQuestions: [],
        governanceNote: GOVERNANCE_VISIBILITY_NOTE,
      };
    }

    const oneTimeHits = containsAny(text, ONE_TIME_KEYWORDS);
    if (oneTimeHits.length > 0) {
      return {
        decision: ScopeDecision.NOT_REQUIRED,
        excludedUse: ExcludedUse.ONE_TIME,
        reasons: [
          `Detected one-time / ad-hoc indicator ("${oneTimeHits[0]}").`,
          'Single-occurrence tasks that do not persist as a repeatable process are excluded from registration.',
        ],
        clarificationQuestions: [],
        governanceNote: GOVERNANCE_VISIBILITY_NOTE,
      };
    }
  }

  // 3. If user completed operational + repeatable + form clarifications -> REGISTER
  if (
    clarifications.isSharedOrOperational === 'yes' &&
    clarifications.isRepeatableProcess === 'yes' &&
    clarifications.intendedForm
  ) {
    const category = mapFormToCategory(clarifications.intendedForm, text);
    return {
      decision: ScopeDecision.REGISTER,
      suggestedCategory: category,
      reasons: [
        'Confirmed shared or operational business usage across a recurring process.',
        `Implementation pattern maps to registrable category: ${category}.`,
      ],
      clarificationQuestions: activeQuestions,
      governanceNote: GOVERNANCE_VISIBILITY_NOTE,
    };
  }

  // 4. Strong deterministic registration signals from text
  const agentHits = containsAny(text, AGENT_KEYWORDS);
  const developedHits = containsAny(text, DEVELOPED_SOLUTION_KEYWORDS);
  const enhancedHits = containsAny(text, ENHANCED_APP_KEYWORDS);
  const automationHits = containsAny(text, AUTOMATION_KEYWORDS);
  const solutionHits = containsAny(text, SOLUTION_KEYWORDS);

  const hasClearTechnicalPattern =
    agentHits.length > 0 ||
    developedHits.length > 0 ||
    enhancedHits.length > 0 ||
    automationHits.length > 0;

  const hasClearBusinessContext = solutionHits.length > 0 || text.length >= 90;

  if (hasClearTechnicalPattern && hasClearBusinessContext) {
    const category = mapFormToCategory(clarifications.intendedForm, text);
    const matchedSignals = [
      ...agentHits,
      ...developedHits,
      ...enhancedHits,
      ...automationHits,
      ...solutionHits,
    ].slice(0, 3);

    return {
      decision: ScopeDecision.REGISTER,
      suggestedCategory: category,
      reasons: [
        `Text indicates a repeatable enterprise capability (${matchedSignals.join(', ')}).`,
        `Deterministic rule classifier recommends registration under ${category}.`,
      ],
      clarificationQuestions: activeQuestions,
      governanceNote: GOVERNANCE_VISIBILITY_NOTE,
    };
  }

  // 5. Ambiguous / underspecified -> NEEDS_CLARIFICATION
  const questions = buildClarificationQuestions();
  const reasons = [
    'The description does not yet establish whether this is a shared/recurring business capability or an excluded personal, learning, or one-time use.',
    'Answer the clarifying questions below so deterministic scope rules can classify the initiative.',
  ];

  return {
    decision: ScopeDecision.NEEDS_CLARIFICATION,
    reasons,
    clarificationQuestions: questions,
    governanceNote: GOVERNANCE_VISIBILITY_NOTE,
  };
}
