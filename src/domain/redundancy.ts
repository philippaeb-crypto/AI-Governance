import { Initiative, LifecycleStatus } from './types';

/**
 * Only initiatives in Idea, Assessment, Development, or Pilot are included
 * in active redundancy analysis.
 */
export const ELIGIBLE_REDUNDANCY_STATUSES: ReadonlySet<LifecycleStatus> =
  new Set([
    LifecycleStatus.IDEA,
    LifecycleStatus.ASSESSMENT,
    LifecycleStatus.DEVELOPMENT,
    LifecycleStatus.PILOT,
  ]);

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
  'solution',
  'enterprise',
  'automated',
  'automation',
  'assistant',
  'copilot',
  'ai',
]);

export function normalizeTextTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface RedundancyCandidatePair {
  pairKey: string;
  initiativeA: Initiative;
  initiativeB: Initiative;
  heuristicScore: number; // 0-100 deterministic heuristic demo score
  matchedKeywords: string[];
  sameCapability: boolean;
  sameDepartment: boolean;
  samePlatform: boolean;
  rationale: string;
  isDemoHeuristic: true;
}

export interface RedundancyAnalysisSummary {
  eligibleInitiativesCount: number;
  flaggedInitiativesCount: number;
  potentialRedundancyRatePercent: number; // eligible with >= 1 match / total eligible * 100
  candidatePairs: RedundancyCandidatePair[];
  thresholdScore: number;
  disclaimer: string;
}

export function buildCanonicalPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

export function computeHeuristicPairSimilarity(
  a: Initiative,
  b: Initiative
): {
  score: number;
  matchedKeywords: string[];
  sameCapability: boolean;
  sameDepartment: boolean;
  samePlatform: boolean;
} {
  const fullTokensA = new Set(
    normalizeTextTokens(
      `${a.title} ${a.businessProblem} ${a.description} ${a.businessCapability}`
    )
  );
  const fullTokensB = new Set(
    normalizeTextTokens(
      `${b.title} ${b.businessProblem} ${b.description} ${b.businessCapability}`
    )
  );

  const capTokensA = new Set(normalizeTextTokens(a.businessCapability));
  const capTokensB = new Set(normalizeTextTokens(b.businessCapability));
  const descTokensA = new Set(
    normalizeTextTokens(`${a.businessProblem} ${a.description}`)
  );
  const descTokensB = new Set(
    normalizeTextTokens(`${b.businessProblem} ${b.description}`)
  );

  const matchedKeywords: string[] = [];
  for (const tok of fullTokensA) {
    if (fullTokensB.has(tok)) matchedKeywords.push(tok);
  }

  const sameCapability =
    a.businessCapability.trim().toLowerCase() ===
    b.businessCapability.trim().toLowerCase();
  const sameDepartment = a.departmentId === b.departmentId;
  const samePlatform =
    a.aiPlatform.trim().toLowerCase() === b.aiPlatform.trim().toLowerCase();

  const overallJaccard = jaccardSimilarity(fullTokensA, fullTokensB);
  const capJaccard = jaccardSimilarity(capTokensA, capTokensB);
  const descJaccard = jaccardSimilarity(descTokensA, descTokensB);

  const weighted =
    overallJaccard * 42 +
    descJaccard * 28 +
    capJaccard * 22 +
    (sameCapability ? 18 : 0) +
    (samePlatform ? 6 : 0) +
    Math.min(12, matchedKeywords.length * 3);

  return {
    score: Math.min(98, Math.round(weighted)),
    matchedKeywords: matchedKeywords.slice(0, 8),
    sameCapability,
    sameDepartment,
    samePlatform,
  };
}

export function computeRedundancyAnalysis(
  initiatives: Initiative[],
  thresholdScore = 24
): RedundancyAnalysisSummary {
  const eligible = initiatives.filter((i) =>
    ELIGIBLE_REDUNDANCY_STATUSES.has(i.lifecycleStatus)
  );

  const candidatePairs: RedundancyCandidatePair[] = [];
  const flaggedIds = new Set<string>();

  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const a = eligible[i];
      const b = eligible[j];
      const sim = computeHeuristicPairSimilarity(a, b);
      if (sim.score >= thresholdScore && sim.matchedKeywords.length >= 2) {
        flaggedIds.add(a.id);
        flaggedIds.add(b.id);
        const reasons: string[] = [];
        if (sim.sameCapability) reasons.push('identical business capability');
        if (sim.matchedKeywords.length > 0) {
          reasons.push(
            `shared terms (${sim.matchedKeywords.slice(0, 4).join(', ')})`
          );
        }
        if (sim.samePlatform) reasons.push(`shared platform (${a.aiPlatform})`);
        if (!sim.sameDepartment) reasons.push('cross-department overlap');

        candidatePairs.push({
          pairKey: buildCanonicalPairKey(a.id, b.id),
          initiativeA: a,
          initiativeB: b,
          heuristicScore: sim.score,
          matchedKeywords: sim.matchedKeywords,
          sameCapability: sim.sameCapability,
          sameDepartment: sim.sameDepartment,
          samePlatform: sim.samePlatform,
          rationale: `Heuristic overlap detected: ${reasons.join('; ')}.`,
          isDemoHeuristic: true,
        });
      }
    }
  }

  candidatePairs.sort((x, y) => y.heuristicScore - x.heuristicScore);

  const eligibleCount = eligible.length;
  const flaggedCount = flaggedIds.size;
  const potentialRedundancyRatePercent =
    eligibleCount > 0 ? Math.round((flaggedCount / eligibleCount) * 100) : 0;

  return {
    eligibleInitiativesCount: eligibleCount,
    flaggedInitiativesCount: flaggedCount,
    potentialRedundancyRatePercent,
    candidatePairs,
    thresholdScore,
    disclaimer:
      'Heuristic demo similarity score computed locally from normalized text, capability, and keyword overlap across Idea, Assessment, Development, and Pilot initiatives. Not an AI semantic certainty.',
  };
}
