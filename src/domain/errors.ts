export type RepositoryErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONCURRENCY_CONFLICT'
  | 'INTERNAL_ERROR';

export class AppRepositoryError extends Error {
  public readonly code: RepositoryErrorCode;
  public readonly fieldErrors?: Record<string, string>;
  public readonly currentVersion?: number;

  constructor(
    code: RepositoryErrorCode,
    message: string,
    options?: {
      fieldErrors?: Record<string, string>;
      currentVersion?: number;
    }
  ) {
    super(message);
    this.name = 'AppRepositoryError';
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
    this.currentVersion = options?.currentVersion;
  }
}

export function unauthorizedError(message = 'Authentication is required.'): AppRepositoryError {
  return new AppRepositoryError('UNAUTHORIZED', message);
}

export function forbiddenError(
  message = 'You do not have permission to perform this action.'
): AppRepositoryError {
  return new AppRepositoryError('FORBIDDEN', message);
}

export function notFoundError(entity: string, id: string): AppRepositoryError {
  return new AppRepositoryError('NOT_FOUND', `${entity} with id "${id}" was not found.`);
}

export function validationError(
  message: string,
  fieldErrors?: Record<string, string>
): AppRepositoryError {
  return new AppRepositoryError('VALIDATION_ERROR', message, { fieldErrors });
}

export function concurrencyConflictError(
  message: string,
  currentVersion: number
): AppRepositoryError {
  return new AppRepositoryError('CONCURRENCY_CONFLICT', message, { currentVersion });
}
