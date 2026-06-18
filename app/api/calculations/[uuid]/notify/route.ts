import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { monteurEmail } = await request.json() as { monteurEmail: string };
  if (!monteurEmail || !monteurEmail.includes('@')) {
    return NextResponse.json({ error: 'Geldig e-mailadres vereist' }, { status: 400 });
  }

  // Verify calculation belongs to this user
  const { data: calc } = await supabase
    .from('calculations')
    .select('id, tool, result, input_values, postcode')
    .eq('id', uuid)
    .eq('user_id', user.id)
    .eq('tool', 'diepte')
    .single();

  if (!calc) return NextResponse.json({ error: 'Berekening niet gevonden' }, { status: 404 });

  // Admin client bypasses RLS — needed for upsert on pendiepte_metingen
  // (UPDATE policy requires monteur_user_id, but here the calculator is acting)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Upsert pendiepte_metingen record (one per calculation)
  const { error: upsertError } = await adminClient
    .from('pendiepte_metingen')
    .upsert({
      calculation_id:     uuid,
      calculator_user_id: user.id,
      monteur_email:      monteurEmail,
      status:             'invited',
    }, { onConflict: 'calculation_id' });

  if (upsertError) {
    return NextResponse.json({ error: 'Database fout: ' + upsertError.message }, { status: 500 });
  }

  // Store monteur email + invite timestamp on calculation row
  await supabase.from('calculations').update({
    monteur_email:       monteurEmail,
    monteur_invited_at:  new Date().toISOString(),
  }).eq('id', uuid);

  // Normalise to lowercase — Supabase allowlist matching is case-sensitive
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get('origin') ?? 'https://earthgnd.com')
    .toLowerCase()
    .replace(/\/$/, '');
  const redirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(`/nl/meting/${uuid}`)}`;
  console.log('[notify] redirectTo sent to Supabase:', redirectTo);

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: monteurEmail,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: 'Magic link genereren mislukt: ' + linkError?.message }, { status: 500 });
  }

  const magicLink = linkData.properties.action_link;

  // Extract expected metrics from calculation result
  const resultaat = calc.result        as { dimension?: number; achievedResistance?: number } | null;
  const input     = calc.input_values  as { electrodeType?: string; targetResistance?: number } | null;
  const gemiddeldDepth     = resultaat?.dimension ?? 0;
  const achievedResistance = resultaat?.achievedResistance ?? 0;
  const targetResistance   = input?.targetResistance ?? 0;
  const electrodeType      = input?.electrodeType === 'lint' ? 'Horizontaal lint' : 'Verticale pen';
  const postcode           = typeof calc.postcode === 'string' ? calc.postcode : '—';

  // Send invite email via Resend
  const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder');
  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@earthgnd.com',
    to: monteurEmail,
    subject: `EarthGND — Veldmeting aanvraag (${postcode})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
        <div style="background:#1C1917;padding:24px;text-align:center">
          <h1 style="color:#E8761A;margin:0;font-size:24px">EarthGND</h1>
          <p style="color:#F5EFE6;margin:8px 0 0">Voorbereidend rapport — veldmeting verzoek</p>
        </div>
        <div style="padding:32px">
          <p style="color:#1C1917;font-size:15px">Goedendag,</p>
          <p style="color:#444;font-size:14px;line-height:1.6">
            Een collega heeft een pendiepte-berekening uitgevoerd en verzoekt u de veldmeting te verrichten.
            Hieronder vindt u de verwachte specificaties voor uw locatie.
          </p>

          <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#f9f9f9;border-radius:6px">
            <tr><td style="padding:10px 16px;color:#666;font-size:13px">Postcode</td>
                <td style="padding:10px 16px;font-weight:600;font-size:13px">${postcode}</td></tr>
            <tr style="background:#f0f0f0"><td style="padding:10px 16px;color:#666;font-size:13px">Elektrode type</td>
                <td style="padding:10px 16px;font-weight:600;font-size:13px">${electrodeType}</td></tr>
            <tr><td style="padding:10px 16px;color:#666;font-size:13px">Doelweerstand</td>
                <td style="padding:10px 16px;font-weight:600;font-size:13px">≤ ${targetResistance} Ω</td></tr>
            <tr style="background:#f0f0f0"><td style="padding:10px 16px;color:#666;font-size:13px">Verwachte diepte (gemiddeld)</td>
                <td style="padding:10px 16px;font-weight:600;font-size:13px">${gemiddeldDepth.toFixed(2)} m</td></tr>
            <tr><td style="padding:10px 16px;color:#666;font-size:13px">Berekend Ra (gemiddeld)</td>
                <td style="padding:10px 16px;font-weight:600;font-size:13px">${achievedResistance.toFixed(2)} Ω</td></tr>
          </table>

          <p style="color:#444;font-size:14px;line-height:1.6">
            Klik op de knop hieronder om in te loggen en het reallife meetformulier te openen.
            De knop is 24 uur geldig.
          </p>

          <div style="margin:32px 0;text-align:center">
            <a href="${magicLink}"
               style="background:#E8761A;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
              Open meetformulier →
            </a>
          </div>

          <p style="color:#999;font-size:12px">
            Als u deze mail niet verwachtte, kunt u hem veilig negeren.<br>
            De link geeft uitsluitend toegang tot dit specifieke meetformulier.
          </p>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;color:#999;font-size:12px">
          © ${new Date().getFullYear()} EarthGND · Professionele aardingsberekeningen
        </div>
      </div>
    `,
  });

  if (emailError) {
    return NextResponse.json({ error: 'E-mail verzenden mislukt: ' + emailError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
