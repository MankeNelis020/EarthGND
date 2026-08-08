import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { statusFromCode, type AppErrorCode } from '@/lib/errors/codes';

export const runtime = 'nodejs';

const schema = z.object({
  code: z.string().min(1).max(64),
  digest: z.string().max(128).optional().nullable(),
  path: z.string().max(500).optional().nullable(),
  message: z.string().max(500).optional().nullable(),
  status: z.number().int().min(400).max(599).optional(),
});

/**
 * Operational error beacon from error.tsx.
 * Not marketing analytics — used to correlate Next.js digests with coded failures.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { ok: false, code: 'E_INVALID_PAYLOAD', status: 400 },
      { status: 400 },
    );
  }

  const code = body.code as AppErrorCode;
  const status = body.status ?? statusFromCode(code);

  console.error(
    JSON.stringify({
      event: 'app_error',
      code,
      status,
      digest: body.digest ?? null,
      path: body.path ?? null,
      message: body.message ?? null,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ ok: true, code, status }, { status: 200 });
}
