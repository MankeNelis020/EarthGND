import {
  calculateWorkingDaysUntil,
  hasExecutionDateChangedSinceKlic,
  KLIC_WARNING_THRESHOLDS,
} from '@/lib/klic/deadlines';
import type { KlicReadiness, KlicStatus } from '@/lib/klic/types';

export type GetKlicReadinessInput = {
  plannedExecutionDate: string | null | undefined;
  klicStatus: KlicStatus | null | undefined;
  policyEnabled: boolean;
  integrationStatus?: string | null;
  executionDateAtSubmission?: string | null;
  hasOverride?: boolean;
  now?: Date;
};

const READY_STATUSES: KlicStatus[] = ['ready'];

export function getKlicReadiness(input: GetKlicReadinessInput): KlicReadiness {
  if (!input.policyEnabled) {
    return {
      level: 'not_applicable',
      code: 'POLICY_DISABLED',
      messageKey: 'klicMsg.policyDisabled',
    };
  }

  const status = input.klicStatus ?? 'not_started';
  const dateChanged = hasExecutionDateChangedSinceKlic(
    input.plannedExecutionDate,
    input.executionDateAtSubmission,
  );

  if (dateChanged && (READY_STATUSES.includes(status) || status === 'submitted' || status === 'processing')) {
    return {
      level: 'urgent',
      code: 'DATE_CHANGED_AFTER_SUBMISSION',
      messageKey: 'klicMsg.dateChanged',
      daysUntilExecution: input.plannedExecutionDate
        ? calculateWorkingDaysUntil(input.plannedExecutionDate, input.now)
        : undefined,
    };
  }

  if (status === 'attention_required') {
    return {
      level: 'urgent',
      code: 'ATTENTION_REQUIRED',
      messageKey: 'klicMsg.attention',
      daysUntilExecution: input.plannedExecutionDate
        ? calculateWorkingDaysUntil(input.plannedExecutionDate, input.now)
        : undefined,
    };
  }

  if (status === 'failed') {
    return {
      level: 'urgent',
      code: 'SUBMISSION_FAILED',
      messageKey: 'klicMsg.failed',
    };
  }

  if (READY_STATUSES.includes(status)) {
    return {
      level: 'ok',
      code: 'READY',
      messageKey: 'klicMsg.ok',
    };
  }

  if (input.hasOverride) {
    return {
      level: 'warning',
      code: 'OVERRIDE_USED',
      messageKey: 'klicMsg.override',
    };
  }

  if (!input.plannedExecutionDate) {
    return {
      level: 'info',
      code: 'NO_EXECUTION_DATE',
      messageKey: 'klicMsg.noDate',
    };
  }

  const days = calculateWorkingDaysUntil(input.plannedExecutionDate, input.now);

  if (status === 'submitted' || status === 'processing' || status === 'manual_pending') {
    if (days <= KLIC_WARNING_THRESHOLDS.urgentWorkdays) {
      return {
        level: 'urgent',
        code: 'PROCESSING_NEAR_EXECUTION',
        daysUntilExecution: days,
        messageKey: 'klicMsg.processingUrgent',
      };
    }
    return {
      level: 'info',
      code: 'PROCESSING',
      daysUntilExecution: days,
      messageKey: 'klicMsg.processing',
    };
  }

  // not_started
  if (days < 0) {
    return {
      level: 'urgent',
      code: 'PAST_WITHOUT_KLIC',
      daysUntilExecution: days,
      messageKey: 'klicMsg.pastDue',
    };
  }
  if (days <= KLIC_WARNING_THRESHOLDS.urgentWorkdays) {
    return {
      level: 'urgent',
      code: 'URGENT_NEAR_EXECUTION',
      daysUntilExecution: days,
      messageKey: 'klicMsg.urgent',
    };
  }
  if (days <= KLIC_WARNING_THRESHOLDS.warningWorkdays) {
    return {
      level: 'warning',
      code: 'WARNING_NEAR_EXECUTION',
      daysUntilExecution: days,
      messageKey: 'klicMsg.warning',
    };
  }
  if (days <= KLIC_WARNING_THRESHOLDS.reminderWorkdays) {
    return {
      level: 'info',
      code: 'REMINDER',
      daysUntilExecution: days,
      messageKey: 'klicMsg.reminder',
    };
  }

  return {
    level: 'info',
    code: 'NOT_STARTED',
    daysUntilExecution: days,
    messageKey: 'klicMsg.notStarted',
  };
}

export function isKlicEffectivelyReady(input: GetKlicReadinessInput): boolean {
  if (!input.policyEnabled) return true;
  if (input.hasOverride) return true;
  const r = getKlicReadiness(input);
  return r.level === 'ok';
}
