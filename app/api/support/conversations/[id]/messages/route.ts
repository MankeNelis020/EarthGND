import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { addUserMessage } from '@/lib/support/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AddMessageSchema = z.object({
  body:        z.string().min(1).max(5000),
  attachments: z.array(z.object({
    storage_path: z.string(),
    mime:         z.string(),
    size:         z.number().int().positive(),
  })).max(5).default([]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { id } = await params;
  const body   = await request.json().catch(() => null);
  const parsed = AddMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige invoer', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const message = await addUserMessage({
      conversationId: id,
      userId:         user.id,
      body:           parsed.data.body,
      attachments:    parsed.data.attachments,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    const status = msg.includes('niet gevonden') ? 404 : msg.includes('gesloten') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
