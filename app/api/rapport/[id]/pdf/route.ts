import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { InspectionReport } from '@/lib/types/rapport';
import React from 'react';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;

  // Allow internal (share route) or authenticated user
  const internal = request.headers.get('x-internal') === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let userId: string | undefined;
  let supabase: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>;

  if (internal) {
    supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  } else {
    const cookieStore = await cookies();
    supabase = createClient(cookieStore);
    const { data: { user } } = await (supabase as ReturnType<typeof createClient>).auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    userId = user.id;
  }

  const db = supabase as ReturnType<typeof createAdminClient>;
  const baseQ = db.from('inspection_reports').select('*').eq('id', id);
  const { data: reportRaw } = await (userId ? baseQ.eq('user_id', userId) : baseQ).single();
  const report = reportRaw as InspectionReport | null;

  if (!report) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

  const { data: metingen } = await (supabase as ReturnType<typeof createAdminClient>)
    .from('metingen')
    .select('*')
    .eq('rapport_id', id)
    .order('volgorde');

  const { renderToBuffer } = await import('@react-pdf/renderer');
  const { OplevRapportTemplate } = await import('@/components/pdf/OplevRapportTemplate');

  const element = React.createElement(OplevRapportTemplate, {
    report,
    metingen: metingen ?? [],
  });

  const pdfBuffer: Buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);

  // Store PDF in Supabase Storage
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const ownerId = userId ?? report.user_id;
  const fileName = `${ownerId}/rapport-${id}-v${report.versie}.pdf`;

  await admin.storage.from('reports').upload(fileName, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

  const { data: signed } = await admin.storage
    .from('reports')
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  const pdfUrl = signed?.signedUrl ?? null;

  if (pdfUrl) {
    await admin.from('inspection_reports').update({ pdf_url: pdfUrl }).eq('id', id);
  }

  if (pdfUrl) return NextResponse.json({ pdfUrl });

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="opleverrapport-${id}.pdf"`,
    },
  });
}
