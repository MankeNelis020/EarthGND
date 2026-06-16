import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// Internal-only endpoint: called after signing to send the report to the recipient.
// Protected by a shared secret header (SUPABASE_SERVICE_ROLE_KEY).
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const secret = request.headers.get('x-internal');
  if (secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: report } = await admin
    .from('inspection_reports')
    .select('*, metingen(*)')
    .eq('id', id)
    .eq('status', 'ondertekend')
    .single();

  if (!report || !report.deel_ontvanger_email) {
    return NextResponse.json({ error: 'Geen ontvanger geconfigureerd' }, { status: 400 });
  }

  if (!report.consent_delen) {
    return NextResponse.json({ error: 'Geen toestemming voor delen' }, { status: 403 });
  }

  let pdfUrl = report.pdf_url;

  // Generate PDF if not yet done
  if (!pdfUrl) {
    const pdfRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/rapport/${id}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal': process.env.SUPABASE_SERVICE_ROLE_KEY! },
    });
    if (pdfRes.ok) {
      const pdfData = await pdfRes.json() as { pdfUrl?: string };
      pdfUrl = pdfData.pdfUrl ?? null;
    }
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const datum = report.datum_uitvoering
    ? new Date(report.datum_uitvoering).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('nl-NL');

  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@earthgnd.com',
    to: report.deel_ontvanger_email,
    subject: `Aarding opleverrapport — ${report.locatie ?? report.opdrachtgever ?? 'EarthGND'}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
        <div style="background:#1C1917;padding:24px">
          <h1 style="color:#E8761A;margin:0;font-size:22px">EarthGND</h1>
          <p style="color:#F5EFE6;margin:8px 0 0;font-size:14px">Aarding Opleverrapport — NEN 1010 deel 6</p>
        </div>
        <div style="padding:32px">
          <p style="color:#1C1917;font-size:15px;margin:0 0 16px">
            Geachte ${report.deel_ontvanger_naam ?? 'heer/mevrouw'},
          </p>
          <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 16px">
            Hierbij ontvangt u het ondertekende aarding opleverrapport voor:
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
            <tr>
              <td style="padding:8px 0;color:#666;width:40%">Locatie</td>
              <td style="padding:8px 0;font-weight:600;color:#1C1917">${report.locatie ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666">Opdrachtgever</td>
              <td style="padding:8px 0;font-weight:600;color:#1C1917">${report.opdrachtgever ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666">Systeemtype</td>
              <td style="padding:8px 0;font-weight:600;color:#1C1917">${report.systeemtype ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666">Datum uitvoering</td>
              <td style="padding:8px 0;font-weight:600;color:#1C1917">${datum}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666">Ondertekend door</td>
              <td style="padding:8px 0;font-weight:600;color:#1C1917">${report.conformiteit_naam ?? '—'}</td>
            </tr>
          </table>
          ${pdfUrl ? `
            <div style="text-align:center;margin-bottom:24px">
              <a href="${pdfUrl}" style="background:#E8761A;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
                PDF Downloaden
              </a>
            </div>
          ` : ''}
          ${report.deel_json ? `
            <p style="color:#666;font-size:12px;margin:0 0 8px">
              Gestructureerde data (JSON) is beschikbaar op aanvraag via <a href="mailto:info@earthgnd.com" style="color:#E8761A">info@earthgnd.com</a>.
            </p>
          ` : ''}
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#999;font-size:12px;line-height:1.5;margin:0">
            Dit rapport is opgesteld en ondertekend door de installateur conform NEN 1010 deel 6.
            EarthGND levert uitsluitend een digitale werkomgeving en rekenhulp; de verantwoordelijkheid
            voor juistheid en normconformiteit berust bij de ondertekenende installateur.
          </p>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;color:#999;font-size:12px">
          © ${new Date().getFullYear()} EarthGND · earthgnd.com
        </div>
      </div>
    `,
  });

  if (emailError) {
    await admin.from('inspection_reports').update({
      deel_status: 'error',
      deel_error: emailError.message,
    }).eq('id', id);
    return NextResponse.json({ error: emailError.message }, { status: 500 });
  }

  await admin.from('inspection_reports').update({
    deel_status:      'verzonden',
    deel_verzonden_op: new Date().toISOString(),
    deel_error:       null,
  }).eq('id', id);

  return NextResponse.json({ ok: true });
}
