/** Hiérarchie d'erreurs partagée : chaque erreur porte un code stable et un statut HTTP. */

export type VeritasErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_PLATFORM'
  | 'EXTRACTION_FAILED'
  | 'FETCH_BLOCKED'
  | 'FETCH_TIMEOUT'
  | 'ROBOTS_DISALLOWED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'ANALYSIS_FAILED'
  | 'BRAIN_UNAVAILABLE'
  | 'STORAGE_ERROR'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<VeritasErrorCode, number> = {
  INVALID_INPUT: 400,
  UNSUPPORTED_PLATFORM: 422,
  EXTRACTION_FAILED: 422,
  FETCH_BLOCKED: 502,
  FETCH_TIMEOUT: 504,
  ROBOTS_DISALLOWED: 451,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  ANALYSIS_FAILED: 500,
  BRAIN_UNAVAILABLE: 503,
  STORAGE_ERROR: 500,
  INTERNAL: 500,
};

export class VeritasError extends Error {
  readonly code: VeritasErrorCode;
  readonly statusCode: number;
  /** Message destiné à l'utilisateur final, en français, sans détail technique. */
  readonly userMessage: string;
  /** Piste d'action concrète proposée à l'utilisateur. */
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: VeritasErrorCode,
    userMessage: string,
    options: { hint?: string; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(userMessage, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'VeritasError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.userMessage = userMessage;
    this.hint = options.hint;
    this.details = options.details;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.userMessage,
        hint: this.hint,
        details: this.details,
      },
    };
  }
}

export function isVeritasError(value: unknown): value is VeritasError {
  return value instanceof VeritasError;
}

/** Normalise n'importe quelle exception en `VeritasError`. */
export function toVeritasError(error: unknown): VeritasError {
  if (isVeritasError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new VeritasError('INTERNAL', "Une erreur interne s'est produite.", {
    details: { original: message },
    cause: error,
  });
}
