import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, email, result, postcode } = body as {
      tool: string;
      email?: string;
      result: Record<string, unknown>;
      postcode?: string;
    };

    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const payload = {
      timestamp: new Date().toISOString(),
      tool,
      email: email ?? '',
      postcode: postcode ?? '',
      result: JSON.stringify(result),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    return NextResponse.json({ ok: res.ok });
  } catch (err) {
    // CRM logging is non-critical — don't fail the request
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message });
  }
}
