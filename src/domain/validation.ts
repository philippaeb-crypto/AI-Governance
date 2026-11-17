import {
  CreateInitiativeInput,
  LifecycleStatus,
  RegistrableCategory,
  ValueCategory,
} from './types';

export interface InitiativeValidationPayload {
  title?: string;
  businessProblem?: string;
  description?: string;
  businessCapability?: string;
  departmentId?: string;
  ownerId?: string;
  aiPlatform?: string;
  solutionType?: string;
  aiType?: string;
  category?: RegistrableCategory | string;
  lifecycleStatus?: LifecycleStatus | string;
  valueCategory?: ValueCategory | string;
  usersCount?: number | string | null;
  minutesSavedPerOccurrence?: number | string | null;
  processFrequencyPerWeek?: number | string | null;
  hourlyRate?: number | string | null;
  ideaDate?: string;
  goLiveDate?: string;
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function parseNonNegativeNumber(
  raw: unknown
): { valid: boolean; value?: number; reason?: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { valid: false, reason: 'This numeric field is required.' };
  }
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return { valid: false, reason: 'Enter a valid number.' };
  }
  if (num < 0) {
    return { valid: false, reason: 'Value must be 0 or greater (non-negative).' };
  }
  return { valid: true, value: num };
}

export function validateInitiativeDetails(
  payload: InitiativeValidationPayload
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (isBlank(payload.title)) {
    errors.title = 'Initiative title is required.';
  } else if (payload.title!.trim().length < 4) {
    errors.title = 'Title must be at least 4 characters.';
  }

  if (isBlank(payload.businessProblem)) {
    errors.businessProblem = 'Business problem statement is required.';
  }

  if (isBlank(payload.description)) {
    errors.description = 'Solution description is required.';
  }

  if (isBlank(payload.businessCapability)) {
    errors.businessCapability = 'Business capability is required.';
  }

  if (isBlank(payload.departmentId)) {
    errors.departmentId = 'Business area / department is required.';
  }

  if (isBlank(payload.ownerId)) {
    errors.ownerId = 'Accountable owner is required.';
  }

  if (isBlank(payload.aiPlatform)) {
    errors.aiPlatform = 'AI platform is required.';
  }

  if (isBlank(payload.solutionType)) {
    errors.solutionType = 'Solution type is required.';
  }

  if (isBlank(payload.aiType)) {
    errors.aiType = 'AI type is required.';
  }

  if (
    !payload.category ||
    !Object.values(RegistrableCategory).includes(
      payload.category as RegistrableCategory
    )
  ) {
    errors.category = 'Select a valid registrable AI category.';
  }

  if (
    !payload.lifecycleStatus ||
    !Object.values(LifecycleStatus).includes(
      payload.lifecycleStatus as LifecycleStatus
    )
  ) {
    errors.lifecycleStatus = 'Select a valid lifecycle status.';
  }

  if (isBlank(payload.ideaDate)) {
    errors.ideaDate = 'Idea date is required.';
  }

  return errors;
}

export function validateUsageAndValue(
  payload: InitiativeValidationPayload
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (
    !payload.valueCategory ||
    !Object.values(ValueCategory).includes(payload.valueCategory as ValueCategory)
  ) {
    errors.valueCategory = 'Select exactly one primary value category.';
  }

  const usersCheck = parseNonNegativeNumber(payload.usersCount);
  if (!usersCheck.valid) {
    errors.usersCount = usersCheck.reason!;
  } else if (!Number.isInteger(usersCheck.value!)) {
    errors.usersCount = 'Users count must be a whole number.';
  }

  const minutesCheck = parseNonNegativeNumber(payload.minutesSavedPerOccurrence);
  if (!minutesCheck.valid) {
    errors.minutesSavedPerOccurrence = minutesCheck.reason!;
  }

  const frequencyCheck = parseNonNegativeNumber(payload.processFrequencyPerWeek);
  if (!frequencyCheck.valid) {
    errors.processFrequencyPerWeek = frequencyCheck.reason!;
  }

  if (
    payload.hourlyRate !== undefined &&
    payload.hourlyRate !== null &&
    payload.hourlyRate !== ''
  ) {
    const rateCheck = parseNonNegativeNumber(payload.hourlyRate);
    if (!rateCheck.valid) {
      errors.hourlyRate = 'Hourly rate must be a non-negative number.';
    }
  }

  return errors;
}

export function validateCreateInitiativeInput(
  input: CreateInitiativeInput | InitiativeValidationPayload
): Record<string, string> {
  return {
    ...validateInitiativeDetails(input),
    ...validateUsageAndValue(input),
  };
}
