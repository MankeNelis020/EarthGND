import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import {
  createConversation,
  listConversations,
  checkRateLimit,
} from '@/lib/support/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateConversationSchema = z.object({
  category:        z.enum(['calculation', 'technical', 'other']),
  body:            z.string().min(1).max(5000),
  context:         z.object({
    projectId:       z.string().optional(),
    calculationId:   z.string().uuid().optional(),
    appVersion:      z.string().optional(),
    currentRoute:    z.string().optional(),
    userAgent:       z.string().optional(),
  }).default({}),
  attachments:     z.array(z.object({
    storage_path: z.string(),
    mime:         z.string(),
    size:         z.number().int().positive(),
  })).max(5).default([]),
  calculationId:   z.string().uuid().optional(),
});

export async function GET() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  try {
    const conversations = await listConversations(user.id);
    return NextResponse.json({ conversations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  // Rate limit: max 10 conversations per uur
  const allowed = await checkRateLimit(user.id).catch(() => true);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Te veel vragen in korte tijd. Probeer het later opnieuw.' },
      { status: 429 },
    );
  }

  const body    = await request.json().catch(() => null);
  const parsed  = CreateConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige invoer', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { conversation, message } = await createConversation({
      userId:        user.id,
      category:      parsed.data.category,
      body:          parsed.data.body,
      context:       parsed.data.context,
      attachments:   parsed.data.attachments,
      calculationId: parsed.data.calculationId,
    });
    return NextResponse.json({ conversation, message }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
