/**
 * Migratie van bevinding B3 (auditrapport): deze route was een volledig
 * open e-mail-relay — elke ontvanger, elke inhoud, geen login, verzonden
 * vanaf het earthgnd.com-domein. Nu via defineEndpoint + capability
 * 'report:email': vereist login, stuurt uitsluitend naar het eigen,
 * geverifieerde e-mailadres, en de inhoud komt uit een reeds
 * eigendomsgecontroleerde `calculations`-rij — nooit uit de request-body.
 */

import { defineEndpoint } from '@/lib/edge/define-endpoint';
import { ReportEmailInput, emailOwnedReport, findReportEmailOwner } from '@/lib/application/report-email';

export const runtime = 'nodejs';

export const POST = defineEndpoint({
  capability: 'report:email',
  source: 'json',
  input: ReportEmailInput,
  resourceOwner: findReportEmailOwner,
  handler: async (ctx, input) => {
    await emailOwnedReport(ctx, input);
    return Response.json({ ok: true });
  },
});
