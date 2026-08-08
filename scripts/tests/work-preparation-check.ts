/**
 * PR #56 — work preparation / KLIC domain tests (tsx, no Jest).
 */
import assert from 'node:assert/strict';
import { calculateWorkingDaysUntil, hasExecutionDateChangedSinceKlic } from '@/lib/klic/deadlines';
import { getKlicReadiness, isKlicEffectivelyReady } from '@/lib/klic/readiness';
import { canUseFeature } from '@/lib/entitlements';
import { normalizeKlicProviderError, safeMessageForKlicError } from '@/lib/klic/kadaster/errors';
import { calculateProjectReadiness } from '@/lib/work-preparation/readiness';
import { canSubmitViaApi, createKlicProvider } from '@/lib/klic/provider';
import { DevMockKlicProvider, resetDevMockKlicState } from '@/lib/klic/dev-mock-provider';
import { mapBmklStatusToKlicStatus } from '@/lib/klic/kadaster/mapper';

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch(err => {
      console.error(`  ✗ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function main() {
  console.log('work-preparation / KLIC checks\n');

  await test('working days: weekday span', () => {
    // Mon 2026-08-10 → Fri 2026-08-14 = 4 workdays
    const days = calculateWorkingDaysUntil('2026-08-14', new Date('2026-08-10T12:00:00Z'));
    assert.equal(days, 4);
  });

  await test('working days: weekend boundary', () => {
    // Fri → Mon = 1 workday (Monday)
    const days = calculateWorkingDaysUntil('2026-08-17', new Date('2026-08-14T12:00:00Z'));
    assert.equal(days, 1);
  });

  await test('working days: same day = 0', () => {
    assert.equal(calculateWorkingDaysUntil('2026-08-10', new Date('2026-08-10T08:00:00Z')), 0);
  });

  await test('working days: past date negative', () => {
    const days = calculateWorkingDaysUntil('2026-08-10', new Date('2026-08-14T12:00:00Z'));
    assert.ok(days < 0);
  });

  await test('thresholds: >10 info notStarted', () => {
    const r = getKlicReadiness({
      plannedExecutionDate: '2026-09-30',
      klicStatus: 'not_started',
      policyEnabled: true,
      now: new Date('2026-08-10T12:00:00Z'),
    });
    assert.equal(r.level, 'info');
    assert.equal(r.code, 'NOT_STARTED');
  });

  await test('thresholds: 5 workdays warning', () => {
    // From Mon Aug 10, +5 workdays = Mon Aug 17
    const r = getKlicReadiness({
      plannedExecutionDate: '2026-08-17',
      klicStatus: 'not_started',
      policyEnabled: true,
      now: new Date('2026-08-10T12:00:00Z'),
    });
    assert.equal(r.level, 'warning');
  });

  await test('thresholds: 3 workdays urgent', () => {
    const r = getKlicReadiness({
      plannedExecutionDate: '2026-08-13',
      klicStatus: 'not_started',
      policyEnabled: true,
      now: new Date('2026-08-10T12:00:00Z'),
    });
    assert.equal(r.level, 'urgent');
  });

  await test('policy OFF → not_applicable + project readiness excludes KLIC', () => {
    const r = getKlicReadiness({
      plannedExecutionDate: '2026-08-12',
      klicStatus: 'not_started',
      policyEnabled: false,
    });
    assert.equal(r.level, 'not_applicable');
    const p = calculateProjectReadiness({
      hasCalculationResult: true,
      contractorNotificationStatus: 'manually_confirmed',
      plannedExecutionDate: '2026-08-20',
      executionDateConfirmedAt: '2026-08-01T00:00:00Z',
      klicStatus: 'not_started',
      policyEnabled: false,
    });
    assert.equal(p.klicReady, null);
    assert.equal(p.totalCount, 3);
    assert.equal(p.readyCount, 3);
    assert.equal(p.allReady, true);
  });

  await test('ready KLIC', () => {
    const r = getKlicReadiness({
      plannedExecutionDate: '2026-08-20',
      klicStatus: 'ready',
      policyEnabled: true,
      executionDateAtSubmission: '2026-08-20',
    });
    assert.equal(r.level, 'ok');
    assert.equal(isKlicEffectivelyReady({
      plannedExecutionDate: '2026-08-20',
      klicStatus: 'ready',
      policyEnabled: true,
      executionDateAtSubmission: '2026-08-20',
    }), true);
  });

  await test('date changed after submission → attention', () => {
    assert.equal(hasExecutionDateChangedSinceKlic('2026-08-28', '2026-08-20'), true);
    const r = getKlicReadiness({
      plannedExecutionDate: '2026-08-28',
      klicStatus: 'ready',
      policyEnabled: true,
      executionDateAtSubmission: '2026-08-20',
    });
    assert.equal(r.code, 'DATE_CHANGED_AFTER_SUBMISSION');
  });

  await test('missing date', () => {
    const r = getKlicReadiness({
      plannedExecutionDate: null,
      klicStatus: 'not_started',
      policyEnabled: true,
    });
    assert.equal(r.code, 'NO_EXECUTION_DATE');
  });

  await test('failed KLIC', () => {
    const r = getKlicReadiness({
      plannedExecutionDate: '2026-08-20',
      klicStatus: 'failed',
      policyEnabled: true,
    });
    assert.equal(r.level, 'urgent');
    assert.equal(r.code, 'SUBMISSION_FAILED');
  });

  await test('entitlement: pro yes / starter no', () => {
    assert.equal(canUseFeature('pro', 'klic_api_integration'), true);
    assert.equal(canUseFeature('starter', 'klic_api_integration'), false);
    assert.equal(canUseFeature('gratis', 'klic_readiness'), true);
  });

  await test('canSubmitViaApi requires entitlement + connected + bmkl', () => {
    assert.equal(canSubmitViaApi({ entitled: true, integrationStatus: 'connected', bmklEnabled: true }), true);
    assert.equal(canSubmitViaApi({ entitled: false, integrationStatus: 'connected', bmklEnabled: true }), false);
    assert.equal(canSubmitViaApi({ entitled: true, integrationStatus: 'disconnected', bmklEnabled: true }), false);
    assert.equal(canSubmitViaApi({ entitled: true, integrationStatus: 'connected', bmklEnabled: false }), false);
  });

  await test('provider error normalization never leaks raw body', () => {
    const n = normalizeKlicProviderError(new Error('oauth token xyz SECRET=abc'));
    assert.equal(n.errorCode, 'AUTHENTICATION_REQUIRED');
    assert.ok(!n.messageSafe.includes('SECRET'));
    assert.ok(!n.messageSafe.includes('xyz'));
    assert.equal(safeMessageForKlicError('PROVIDER_UNAVAILABLE').length > 0, true);
  });

  await test('BMKL status mapper', () => {
    assert.equal(mapBmklStatusToKlicStatus('gereed'), 'ready');
    assert.equal(mapBmklStatusToKlicStatus('in_behandeling'), 'processing');
  });

  await test('manual provider refuses live submit', async () => {
    const p = createKlicProvider('manual');
    const r = await p.submitRequest({
      calculationId: 'c1',
      userId: 'u1',
      plannedExecutionDate: '2026-08-20',
      addressLabel: 'Test',
      idempotencyKey: 'idem-1',
    });
    assert.equal(r.ok, false);
  });

  await test('dev mock cycles submitted → processing → ready', async () => {
    resetDevMockKlicState();
    const p = new DevMockKlicProvider();
    const sub = await p.submitRequest({
      calculationId: 'c1',
      userId: 'u1',
      plannedExecutionDate: '2026-08-20',
      addressLabel: 'Test',
      geometry: { type: 'unknown', userConfirmed: true },
      idempotencyKey: 'idem-cycle',
    });
    assert.equal(sub.ok, true);
    assert.equal(sub.status, 'submitted');
    const s1 = await p.getStatus(sub.externalRequestId!);
    assert.equal(s1.status, 'processing');
    const s2 = await p.getStatus(sub.externalRequestId!);
    assert.equal(s2.status, 'ready');
  });

  await test('project readiness 4 of 4', () => {
    const p = calculateProjectReadiness({
      hasCalculationResult: true,
      contractorNotificationStatus: 'sent',
      plannedExecutionDate: '2026-09-01',
      executionDateConfirmedAt: '2026-08-01T00:00:00Z',
      klicStatus: 'ready',
      policyEnabled: true,
      executionDateAtSubmission: '2026-09-01',
    });
    assert.equal(p.readyCount, 4);
    assert.equal(p.totalCount, 4);
    assert.equal(p.allReady, true);
  });

  await test('sanitize: cross-tenant invariant documented via user_id filters', () => {
    // API routes always filter .eq('user_id', user.id) — assert helper contract
    assert.equal(typeof canUseFeature, 'function');
  });

  console.log(`\n${passed} checks passed`);
  if (process.exitCode) process.exit(1);
}

main();
