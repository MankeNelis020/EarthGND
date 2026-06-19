import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'E-mail niet geconfigureerd op deze server' }, { status: 503 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const body = await request.json();
    const { to, subject, pdfUrl, tool, result } = body as {
      to: string;
      subject: string;
      pdfUrl: string;
      tool: string;
      result: Record<string, unknown>;
    };

    if (!to || !subject) {
      return NextResponse.json({ error: 'to and subject required' }, { status: 400 });
    }

    const toolLabel = tool === 'ohm' ? 'Ohm Calculator' : 'Diepte Calculator';
    const resultLines = Object.entries(result)
      .map(([k, v]) => `<tr><td style="padding:4px 12px;color:#666">${k}</td><td style="padding:4px 12px;font-weight:600">${v}</td></tr>`)
      .join('');

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@earthgnd.com',
      to,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
          <div style="background:#1C1917;padding:24px;text-align:center">
            <h1 style="color:#E8761A;margin:0;font-size:24px">EarthGND</h1>
            <p style="color:#F5EFE6;margin:8px 0 0">Aardingsrapport</p>
          </div>
          <div style="padding:32px">
            <h2 style="color:#1C1917">${toolLabel} resultaten</h2>
            <table style="width:100%;border-collapse:collapse;margin-top:16px">
              ${resultLines}
            </table>
            ${pdfUrl ? `<div style="margin-top:32px;text-align:center"><a href="${pdfUrl}" style="background:#E8761A;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">PDF Downloaden</a></div>` : ''}
          </div>
          <div style="background:#f5f5f5;padding:16px;text-align:center;color:#999;font-size:12px">
            © ${new Date().getFullYear()} EarthGND · Professionele aardingsberekeningen
          </div>
        </div>
      `,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
