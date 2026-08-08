import { getKlicReadiness, isKlicEffectivelyReady } from '@/lib/klic/readiness';
import type { KlicStatus } from '@/lib/klic/types';
import type {
  ContractorNotificationStatus,
  PreparationItem,
  ProjectReadiness,
} from '@/lib/work-preparation/types';

export type CalculateProjectReadinessInput = {
  hasCalculationResult: boolean;
  contractorNotificationStatus: ContractorNotificationStatus;
  plannedExecutionDate: string | null | undefined;
  executionDateConfirmedAt: string | null | undefined;
  klicStatus: KlicStatus | null | undefined;
  policyEnabled: boolean;
  executionDateAtSubmission?: string | null;
  hasKlicOverride?: boolean;
  now?: Date;
};

export function calculateProjectReadiness(
  input: CalculateProjectReadinessInput,
): ProjectReadiness {
  const calculationReady = input.hasCalculationResult === true;
  const contractorInformed =
    input.contractorNotificationStatus === 'sent' ||
    input.contractorNotificationStatus === 'manually_confirmed';
  const executionDateConfirmed =
    !!input.plannedExecutionDate && !!input.executionDateConfirmedAt;

  const klic = getKlicReadiness({
    plannedExecutionDate: input.plannedExecutionDate,
    klicStatus: input.klicStatus,
    policyEnabled: input.policyEnabled,
    executionDateAtSubmission: input.executionDateAtSubmission,
    hasOverride: input.hasKlicOverride,
    now: input.now,
  });

  const klicReady = input.policyEnabled
    ? isKlicEffectivelyReady({
        plannedExecutionDate: input.plannedExecutionDate,
        klicStatus: input.klicStatus,
        policyEnabled: true,
        executionDateAtSubmission: input.executionDateAtSubmission,
        hasOverride: input.hasKlicOverride,
        now: input.now,
      })
    : null;

  const items: PreparationItem[] = [
    {
      key: 'calculation',
      status: calculationReady ? 'done' : 'pending',
      messageKey: calculationReady
        ? 'items.calculationDone'
        : 'items.calculationPending',
    },
    {
      key: 'contractor',
      status: contractorInformed ? 'done' : 'pending',
      messageKey: contractorInformed
        ? 'items.contractorDone'
        : 'items.contractorPending',
    },
  ];

  if (input.policyEnabled) {
    const klicItemStatus =
      klic.level === 'ok' ? 'done' :
      klic.level === 'urgent' || klic.level === 'warning' ? 'attention' :
      'pending';
    items.push({
      key: 'klic',
      status: klicItemStatus,
      messageKey:
        klic.level === 'ok'
          ? 'items.klicDone'
          : klic.messageKey.replace(/^klic\.readiness\./, 'klicMsg.'),
    });
  } else {
    items.push({
      key: 'klic',
      status: 'na',
      messageKey: 'items.klicDisabled',
    });
  }

  items.push({
    key: 'executionDate',
    status: executionDateConfirmed ? 'done' : 'pending',
    messageKey: executionDateConfirmed
      ? 'items.dateDone'
      : input.plannedExecutionDate
        ? 'items.dateUnconfirmed'
        : 'items.dateMissing',
  });

  const countable = items.filter(i => i.status !== 'na');
  const readyCount = countable.filter(i => i.status === 'done').length;
  const totalCount = countable.length;
  const allReady = readyCount === totalCount && totalCount > 0;

  return {
    calculationReady,
    contractorInformed,
    klicReady,
    executionDateConfirmed,
    readyCount,
    totalCount,
    allReady,
    items,
    klic,
  };
}
