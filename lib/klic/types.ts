export type KlicProviderId = 'manual' | 'kadaster_bmkl' | 'dev_mock';

export type KlicIntegrationStatus =
  | 'disconnected'
  | 'configuration_required'
  | 'connected'
  | 'connection_error';

export type KlicStatus =
  | 'not_started'
  | 'manual_pending'
  | 'submitted'
  | 'processing'
  | 'ready'
  | 'attention_required'
  | 'failed';

export type KlicErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHORIZATION_FAILED'
  | 'ACCOUNT_CONFIGURATION_REQUIRED'
  | 'INVALID_REQUEST'
  | 'INVALID_GEOMETRY'
  | 'DATE_INVALID'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'FEATURE_NOT_ENTITLED'
  | 'DUPLICATE_SUBMISSION'
  | 'UNKNOWN_PROVIDER_ERROR';

/** Future-ready geometry container — do not invent BMKL schema. */
export type KlicGeometry = {
  type: 'Point' | 'Polygon' | 'unknown';
  /** WGS84 coordinates or ring; validated only at confirm time for live API. */
  coordinates?: number[] | number[][];
  /** Human-reviewed confirmation required before live submit. */
  userConfirmed?: boolean;
  label?: string;
};

export type KlicConnectionResult = {
  ok: boolean;
  status: KlicIntegrationStatus;
  accountReference?: string;
  errorCode?: KlicErrorCode;
  messageSafe?: string;
};

export type KlicRequestInput = {
  calculationId: string;
  userId: string;
  plannedExecutionDate: string; // YYYY-MM-DD
  addressLabel: string;
  postcode?: string | null;
  lat?: number | null;
  lon?: number | null;
  geometry?: KlicGeometry | null;
  workDescription?: string;
  idempotencyKey: string;
};

export type KlicActionRequired = {
  type: 'external';
  url: string;
};

export type KlicSubmissionResult = {
  ok: boolean;
  status: KlicStatus;
  externalRequestId?: string;
  referenceNumber?: string;
  errorCode?: KlicErrorCode;
  messageSafe?: string;
  actionRequired?: KlicActionRequired;
};

export type KlicStatusResult = {
  ok: boolean;
  status: KlicStatus;
  referenceNumber?: string;
  deliveryReceivedAt?: string | null;
  errorCode?: KlicErrorCode;
  messageSafe?: string;
};

export type KlicDeliveryResult = {
  ok: boolean;
  receivedAt?: string;
  errorCode?: KlicErrorCode;
  messageSafe?: string;
};

export type KlicReadinessLevel =
  | 'not_applicable'
  | 'ok'
  | 'info'
  | 'warning'
  | 'urgent';

export type KlicReadiness = {
  level: KlicReadinessLevel;
  code: string;
  daysUntilExecution?: number;
  messageKey: string;
};
