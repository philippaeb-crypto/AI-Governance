import {
  AI_PLATFORMS,
  AI_TYPES,
  CATEGORY_LABELS,
  RegistrableCategory,
  SimilarityMatch,
  SOLUTION_TYPES,
  ValueCategory,
} from '../domain/types';
import { InitiativeRepository, SimilarityProvider } from '../repositories/interfaces';

export interface MockAiSuggestion {
  suggestedTitle: string;
  suggestedCapability: string;
  suggestedCategory: RegistrableCategory;
  suggestedPlatform: string;
  suggestedSolutionType: string;
  suggestedAiType: string;
  suggestedValueCategory: ValueCategory;
  isDemoOnly: true;
  disclaimer: string;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'using',
  'across',
  'team',
  'teams',
  'tool',
  'work',
  'help',
  'will',
  'have',
  'been',
  'more',
  'also',
  'some',
  'their',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export class MockAiProvider implements SimilarityProvider {
  private readonly repository: InitiativeRepository;

  constructor(repository: InitiativeRepository) {
    this.repository = repository;
  }

  /**
   * Deterministic similarity check computed strictly against initiatives in the local repository.
   * No external AI API or LLM is invoked.
   */
  async findSimilarInitiatives(params: {
    queryText: string;
    departmentId?: string;
    businessCapability?: string;
    excludeInitiativeId?: string;
    limit?: number;
  }): Promise<SimilarityMatch[]> {
    const initiatives = await this.repository.listInitiatives();
    const queryTokens = new Set(
      tokenize(`${params.queryText} ${params.businessCapability ?? ''}`)
    );

    if (queryTokens.size === 0) {
      return [];
    }

    const scored: SimilarityMatch[] = [];

    for (const initiative of initiatives) {
      if (
        params.excludeInitiativeId &&
        initiative.id === params.excludeInitiativeId
      ) {
        continue;
      }

      const candidateText = `${initiative.title} ${initiative.businessProblem} ${initiative.description} ${initiative.businessCapability} ${initiative.aiPlatform}`;
      const candidateTokens = new Set(tokenize(candidateText));

      const matchedTerms: string[] = [];
      for (const token of queryTokens) {
        if (candidateTokens.has(token)) {
          matchedTerms.push(token);
        }
      }

      const sameDepartment =
        Boolean(params.departmentId) &&
        initiative.departmentId === params.departmentId;
      const sameCapability =
        Boolean(params.businessCapability) &&
        initiative.businessCapability.toLowerCase() ===
          params.businessCapability!.trim().toLowerCase();

      const rawScore =
        matchedTerms.length * 15 +
        (sameDepartment ? 12 : 0) +
        (sameCapability ? 20 : 0);

      if (matchedTerms.length >= 2 || rawScore >= 30) {
        const normalizedScore = Math.min(96, rawScore);
        scored.push({
          initiative,
          score: normalizedScore,
          matchedTerms: matchedTerms.slice(0, 6),
          sameDepartment,
          sameCapability,
          isDemoOnly: true,
          disclaimer:
            'Demo similarity preview computed locally from seeded/demo repository records via deterministic keyword overlap. Not an external AI semantic match.',
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, params.limit ?? 5);
  }

  /**
   * Deterministic mock metadata suggestion for Smart Intake.
   * Explicitly labeled as a demo suggestion.
   */
  suggestMetadataFromDescription(
    ideaText: string,
    suggestedCategory?: RegistrableCategory
  ): MockAiSuggestion {
    const lower = ideaText.toLowerCase();

    const category =
      suggestedCategory ??
      (lower.includes('agent') || lower.includes('autonomous')
        ? RegistrableCategory.AI_AGENT
        : lower.includes('automate') || lower.includes('invoice') || lower.includes('workflow')
          ? RegistrableCategory.AI_AUTOMATION
          : lower.includes('erp') || lower.includes('crm') || lower.includes('portal')
            ? RegistrableCategory.AI_ENHANCED_APP
            : lower.includes('custom') || lower.includes('model') || lower.includes('rag')
              ? RegistrableCategory.AI_DEVELOPED_SOLUTION
              : RegistrableCategory.AI_SOLUTION);

    const suggestedPlatform = lower.includes('power automate')
      ? AI_PLATFORMS[3]
      : lower.includes('invoice') || lower.includes('ocr') || lower.includes('document')
        ? AI_PLATFORMS[4]
        : lower.includes('copilot studio') || lower.includes('agent')
          ? AI_PLATFORMS[0]
          : lower.includes('python') || lower.includes('azure ml')
            ? AI_PLATFORMS[5]
            : AI_PLATFORMS[1];

    const suggestedSolutionType =
      category === RegistrableCategory.AI_AUTOMATION
        ? SOLUTION_TYPES[4]
        : category === RegistrableCategory.AI_DEVELOPED_SOLUTION
          ? SOLUTION_TYPES[1]
          : category === RegistrableCategory.AI_ENHANCED_APP
            ? SOLUTION_TYPES[2]
            : SOLUTION_TYPES[0];

    const suggestedAiType = lower.includes('invoice') || lower.includes('ocr')
      ? AI_TYPES[2]
      : category === RegistrableCategory.AI_AGENT
        ? AI_TYPES[1]
        : lower.includes('chat') || lower.includes('q&a') || lower.includes('assistant')
          ? AI_TYPES[3]
          : lower.includes('predict') || lower.includes('forecast')
            ? AI_TYPES[4]
            : AI_TYPES[0];

    const suggestedValueCategory =
      lower.includes('accuracy') || lower.includes('error') || lower.includes('compliance') || lower.includes('audit')
        ? ValueCategory.QUALITY
        : lower.includes('revenue') || lower.includes('growth') || lower.includes('market') || lower.includes('early-warning')
          ? ValueCategory.STRATEGIC
          : ValueCategory.EFFICIENCY;

    const words = ideaText
      .trim()
      .split(/\s+/)
      .slice(0, 7)
      .join(' ')
      .replace(/[.,;:!?]+$/, '');

    const suggestedTitle =
      words.length >= 6
        ? words.charAt(0).toUpperCase() + words.slice(1)
        : `Departmental ${CATEGORY_LABELS[category]}`;

    const suggestedCapability = lower.includes('invoice') || lower.includes('finance')
      ? 'Financial Operations & Accounting'
      : lower.includes('contract') || lower.includes('vendor') || lower.includes('procurement')
        ? 'Procurement & Contract Management'
        : lower.includes('customer') || lower.includes('ticket') || lower.includes('support')
          ? 'Customer Support & Service Delivery'
          : lower.includes('supply') || lower.includes('warehouse') || lower.includes('inventory')
            ? 'Supply Chain & Operations Planning'
            : 'Enterprise Knowledge & Process Automation';

    return {
      suggestedTitle,
      suggestedCapability,
      suggestedCategory: category,
      suggestedPlatform,
      suggestedSolutionType,
      suggestedAiType,
      suggestedValueCategory,
      isDemoOnly: true,
      disclaimer:
        'Demo suggestion generated locally by deterministic rules in MockAiProvider. Review and adjust before saving.',
    };
  }
}
