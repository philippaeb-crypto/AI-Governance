import { LIFECYCLE_LABELS, LifecycleStatus } from './types';

/**
 * Standard forward lifecycle progression paths.
 * Non-linear transitions outside this map are explicitly allowed as governed exceptions
 * when accompanied by a recorded reason note.
 */
export const RECOMMENDED_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  [LifecycleStatus.IDEA]: [LifecycleStatus.ASSESSMENT, LifecycleStatus.RETIRE],
  [LifecycleStatus.ASSESSMENT]: [
    LifecycleStatus.DEVELOPMENT,
    LifecycleStatus.PILOT,
    LifecycleStatus.RETIRE,
  ],
  [LifecycleStatus.DEVELOPMENT]: [
    LifecycleStatus.PILOT,
    LifecycleStatus.ASSESSMENT,
    LifecycleStatus.RETIRE,
  ],
  [LifecycleStatus.PILOT]: [
    LifecycleStatus.PRODUCTION,
    LifecycleStatus.DEVELOPMENT,
    LifecycleStatus.RETIRE,
  ],
  [LifecycleStatus.PRODUCTION]: [
    LifecycleStatus.MONITORING,
    LifecycleStatus.SCALE_IMPROVE,
    LifecycleStatus.RETIRE,
  ],
  [LifecycleStatus.MONITORING]: [
    LifecycleStatus.SCALE_IMPROVE,
    LifecycleStatus.PRODUCTION,
    LifecycleStatus.RETIRE,
  ],
  [LifecycleStatus.SCALE_IMPROVE]: [
    LifecycleStatus.PRODUCTION,
    LifecycleStatus.MONITORING,
    LifecycleStatus.DEVELOPMENT,
    LifecycleStatus.RETIRE,
  ],
  [LifecycleStatus.RETIRE]: [LifecycleStatus.ASSESSMENT],
};

export function isGovernedExceptionTransition(
  fromStatus: LifecycleStatus,
  toStatus: LifecycleStatus
): boolean {
  if (fromStatus === toStatus) {
    return false;
  }
  const allowed = RECOMMENDED_TRANSITIONS[fromStatus] ?? [];
  return !allowed.includes(toStatus);
}

export interface LifecycleTransitionValidation {
  valid: boolean;
  isGovernedException: boolean;
  error?: string;
}

export function validateLifecycleTransition(params: {
  fromStatus: LifecycleStatus;
  toStatus: LifecycleStatus;
  note: string;
}): LifecycleTransitionValidation {
  const { fromStatus, toStatus, note } = params;

  if (fromStatus === toStatus) {
    return {
      valid: false,
      isGovernedException: false,
      error: `Initiative is already in ${LIFECYCLE_LABELS[toStatus]} status.`,
    };
  }

  const isException = isGovernedExceptionTransition(fromStatus, toStatus);
  const trimmedNote = note.trim();

  if (isException && trimmedNote.length < 8) {
    return {
      valid: false,
      isGovernedException: true,
      error: `Moving directly from ${LIFECYCLE_LABELS[fromStatus]} to ${LIFECYCLE_LABELS[toStatus]} is a governed exception. Provide a reason (at least 8 characters).`,
    };
  }

  if (trimmedNote.length === 0) {
    return {
      valid: false,
      isGovernedException: isException,
      error: 'Enter a brief transition note for the immutable audit log.',
    };
  }

  return {
    valid: true,
    isGovernedException: isException,
  };
}
