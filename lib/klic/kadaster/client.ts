/**
 * Kadaster BMKL HTTP client boundary.
 *
 * HARD RULE: Do not invent endpoints, OAuth, or request schemas.
 * Live calls are disabled unless KLIC_BMKL_ENABLED=true AND official
 * configuration is supplied. Until then this client refuses network I/O.
 */

export class BmklNotConfiguredError extends Error {
  readonly code = 'ACCOUNT_CONFIGURATION_REQUIRED' as const;
  constructor(message = 'BMKL provider is not configured for live use.') {
    super(message);
    this.name = 'BmklNotConfiguredError';
  }
}

export class KadasterBmklClient {
  /** Placeholder — returns false until official BMKL wiring exists. */
  isConfigured(): boolean {
    return (
      process.env.KLIC_BMKL_ENABLED === 'true' &&
      !!process.env.KLIC_BMKL_BASE_URL &&
      !!process.env.KLIC_BMKL_CREDENTIALS_BACKEND
    );
  }

  async request(path: string, init?: RequestInit): Promise<never> {
    void path;
    void init;
    // Never guess Kadaster URLs or send traffic.
    throw new BmklNotConfiguredError(
      'Live BMKL calls are blocked until official Kadaster API configuration is confirmed.',
    );
  }
}
