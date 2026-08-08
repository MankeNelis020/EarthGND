import type { KlicReadiness, KlicStatus } from '@/lib/klic/types';

export type ContractorNotificationStatus = 'not_sent' | 'sent' | 'manually_confirmed';

export type PreparationItemStatus = 'done' | 'attention' | 'pending' | 'na';

export type PreparationItem = {
  key: 'calculation' | 'contractor' | 'klic' | 'executionDate';
  status: PreparationItemStatus;
  messageKey: string;
};

export type ProjectReadiness = {
  calculationReady: boolean;
  contractorInformed: boolean;
  klicReady: boolean | null;
  executionDateConfirmed: boolean;
  readyCount: number;
  totalCount: number;
  allReady: boolean;
  items: PreparationItem[];
  klic: KlicReadiness;
};

export type PreparationSnapshot = {
  calculationId: string;
  rapportNaam: string | null;
  postcode: string | null;
  plannedExecutionDate: string | null;
  executionDateConfirmedAt: string | null;
  contractorNotificationStatus: ContractorNotificationStatus;
  contractorNotifiedAt: string | null;
  klicOverrideAt: string | null;
  klicStatus: KlicStatus;
  klicReferenceNumber: string | null;
  klicProvider: string | null;
  executionDateAtSubmission: string | null;
  klicRequestedAt: string | null;
  policyEnabled: boolean;
  metingStatus: string | null;
};
