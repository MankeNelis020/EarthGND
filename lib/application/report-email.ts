/**
 * Use-case voor 'report:email' — migratie van bevinding B3.
 *
 * De oude `/api/mail/route.ts` was een volledig open relay: `to` (vrije
 * ontvanger), `pdfUrl` (vrije link, getoond als vertrouwde "PDF
 * downloaden"-knop), en `result` (ongesaneerde HTML-interpolatie) kwamen
 * allemaal letterlijk uit de request-body, zonder login.
 *
 * Nieuw contract: de ontvanger is ALTIJD `ctx.principal.email` — er is geen
 * `to`-veld in het inputschema, dus er is niets om te smokkelen. De inhoud
 * komt uit een reeds opgeslagen, eigendomsgecontroleerde `calculations`-rij
 * (dezelfde repository als 'report:generate-diepte') en wordt als bijlage
 * meegestuurd — geen vrije `pdfUrl`-link meer in de e-mail.
 */

import { z } from 'zod';
import { cookies } from 'next/headers';
import { Resend } from 'resend';
import { createClient } from '@/utils/supabase/server';
import { getOwnedCalculation, findCalculationOwnerId } from '@/lib/domain/calculation-repository';
import { renderStoredCalculationPdf } from '@/lib/domain/report-rendering';
import { UseCaseRejection, jsonError } from '@/lib/edge/responses';
import type { AuthorizedContext } from '@/lib/authz/context';

export const ReportEmailInput = z.object({
  calculationId: z.string().uuid(),
  locale: z.enum(['nl', 'en', 'de']).default('nl'),
});

export type ReportEmailInput = z.infer<typeof ReportEmailInput>;

/** resourceOwner voor defineEndpoint. */
export async function findReportEmailOwner(input: ReportEmailInput): Promise<string | null> {
  const supabase = createClient(await cookies());
  return findCalculationOwnerId(supabase, input.calculationId);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function emailOwnedReport(
  ctx: AuthorizedContext<'report:email'>,
  input: ReportEmailInput,
): Promise<void> {
  if (ctx.principal.kind !== 'user') throw new Error('Onverwacht principal-type voor report:email');

  if (!process.env.RESEND_API_KEY) {
    throw new UseCaseRejection(jsonError(503, 'E-mail niet geconfigureerd op deze server'));
  }

  const supabase = createClient(await cookies());
  const calc = await getOwnedCalculation(supabase, input.calculationId, ctx.principal.id);
  if (!calc) throw new UseCaseRejection(jsonError(404, 'Berekening niet gevonden'));

  const pdfBuffer = await renderStoredCalculationPdf(calc, input.locale);

  const toolLabel = calc.tool === 'ohm' ? 'Ohm Calculator' : 'Diepte Calculator';
  const resultRows = Object.entries(calc.result)
    .map(([k, v]) => `<tr><td style="padding:4px 12px;color:#666">${escapeHtml(k)}</td><td style="padding:4px 12px;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join('');

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@earthgnd.com',
    // Nooit een `to` uit de client — de enige geldige ontvanger is de
    // geauthenticeerde aanvrager zelf.
    to: ctx.principal.email,
    subject: `EarthGND — ${toolLabel} rapport`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
        <div style="background:#1C1917;padding:24px;text-align:center">
          <h1 style="color:#E8761A;margin:0;font-size:24px">EarthGND</h1>
          <p style="color:#F5EFE6;margin:8px 0 0">Aardingsrapport</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#1C1917">${escapeHtml(toolLabel)} resultaten</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            ${resultRows}
          </table>
          <p style="margin-top:24px;color:#666;font-size:13px">Het volledige rapport is als PDF bijgevoegd.</p>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;color:#999;font-size:12px">
          © ${new Date().getFullYear()} EarthGND · Professionele aardingsberekeningen
        </div>
      </div>
    `,
    attachments: [
      { filename: `earthgnd-${calc.tool}-rapport.pdf`, content: pdfBuffer.toString('base64') },
    ],
  });

  if (error) throw new UseCaseRejection(jsonError(500, error.message));
}
