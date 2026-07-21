/**
 * POST /api/support/attachments/sign
 *
 * Geeft een signed upload-URL terug voor de private bucket 'support-attachments'.
 * De client upload direct naar Supabase Storage — de inhoud passeert deze server niet.
 *
 * Beperkingen: max 10 MB, alleen image/* en application/pdf.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const BUCKET         = 'support-attachments';
const MAX_SIZE_BYTES = 10 * 1024 * 1024;  // 10 MB
const ALLOWED_MIMES  = /^(image\/(jpeg|png|webp|gif|heic)|application\/pdf)$/;

const SignSchema = z.object({
  filename: z.string().min(1).max(200),
  mime:     z.string().regex(ALLOWED_MIMES, 'Alleen afbeeldingen en PDF toegestaan'),
  size:     z.number().int().positive().max(MAX_SIZE_BYTES, 'Bestand te groot (max 10 MB)'),
});

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body   = await request.json().catch(() => null);
  const parsed = SignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige invoer', details: parsed.error.flatten() }, { status: 400 });
  }

  const { filename, mime } = parsed.data;

  // Pad: {userId}/{timestamp}-{filename}  — uniek per user per upload
  const ext         = filename.includes('.') ? filename.split('.').pop() : '';
  const storagePath = `${user.id}/${Date.now()}${ext ? `.${ext}` : ''}`;

  const svc = getServiceClient();
  const { data, error } = await svc.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error('[support/sign] createSignedUploadUrl mislukt:', error);
    return NextResponse.json({ error: 'Upload-URL aanmaken mislukt' }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl:   data.signedUrl,
    storage_path: storagePath,
    mime,
    token:       data.token,
  });
}
