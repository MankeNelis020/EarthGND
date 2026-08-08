import type { KlicErrorCode } from '@/lib/klic/types';

const SAFE_MESSAGES: Record<KlicErrorCode, string> = {
  AUTHENTICATION_REQUIRED: 'Authenticatie bij Kadaster is vereist.',
  AUTHORIZATION_FAILED: 'Geen toestemming voor deze Kadaster-actie.',
  ACCOUNT_CONFIGURATION_REQUIRED: 'Je Kadaster-account vereist aandacht.',
  INVALID_REQUEST: 'De KLIC-aanvraag is ongeldig.',
  INVALID_GEOMETRY: 'Controleer het graafgebied.',
  DATE_INVALID: 'Controleer de geplande uitvoeringsdatum.',
  RATE_LIMITED: 'Te veel verzoeken. Probeer later opnieuw.',
  PROVIDER_UNAVAILABLE: 'Kadaster is tijdelijk niet bereikbaar.',
  FEATURE_NOT_ENTITLED: 'KLIC API-integratie is niet beschikbaar op dit plan.',
  DUPLICATE_SUBMISSION: 'Er loopt al een KLIC-aanvraag voor dit project.',
  UNKNOWN_PROVIDER_ERROR: 'Er ging iets mis bij de KLIC-aanvraag.',
};

export function safeMessageForKlicError(code: KlicErrorCode): string {
  return SAFE_MESSAGES[code];
}

/**
 * Map provider/raw errors into normalized codes.
 * Never pass through raw provider bodies.
 */
export function normalizeKlicProviderError(err: unknown): {
  errorCode: KlicErrorCode;
  messageSafe: string;
} {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: string }).code);
    if (code in SAFE_MESSAGES) {
      const errorCode = code as KlicErrorCode;
      return { errorCode, messageSafe: SAFE_MESSAGES[errorCode] };
    }
  }

  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('auth')) {
    return {
      errorCode: 'AUTHENTICATION_REQUIRED',
      messageSafe: SAFE_MESSAGES.AUTHENTICATION_REQUIRED,
    };
  }
  if (msg.includes('rate')) {
    return {
      errorCode: 'RATE_LIMITED',
      messageSafe: SAFE_MESSAGES.RATE_LIMITED,
    };
  }
  if (msg.includes('geometry')) {
    return {
      errorCode: 'INVALID_GEOMETRY',
      messageSafe: SAFE_MESSAGES.INVALID_GEOMETRY,
    };
  }

  return {
    errorCode: 'UNKNOWN_PROVIDER_ERROR',
    messageSafe: SAFE_MESSAGES.UNKNOWN_PROVIDER_ERROR,
  };
}
