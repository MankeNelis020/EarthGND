/**
 * Weekly moat ops digest — email ADMIN_EMAILS via Resend.
 * Intended for Monday cron; no new tables (schedule = dedupe).
 */

import { Resend } from 'resend';
import { moatServiceClient } from '@/lib/moat/admin-auth';
import { fetchOpsFunnel, fetchOpsRegionHealth, fetchOpsWeekly } from '@/lib/moat/ops-metrics';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

const WEEKLY_TARGET = 6;

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
}

export type DigestResult = {
  sent: number;
  skipped: boolean;
  reason?: string;
  preview: {
    thisWeek: number;
    weeklyTarget: number;
    predictionLinkPct: number;
    knowledgePct: number;
    claimReadyRegions: number;
    blockers: string[];
  };
};

export async function buildAndSendWeeklyMoatDigest(
  opts: { dryRun?: boolean } = {},
): Promise<DigestResult> {
  const db = moatServiceClient();
  const [funnel, weekly, regions] = await Promise.all([
    fetchOpsFunnel(db),
    fetchOpsWeekly(db, 4),
    fetchOpsRegionHealth(db),
  ]);

  const thisWeek = weekly[0]?.count ?? 0;
  const predictionLinkPct = funnel.totalOutcomes
    ? Math.round((funnel.withPredictionLink / funnel.totalOutcomes) * 100)
    : 0;
  const knowledgePct = funnel.totalOutcomes
    ? Math.round((funnel.knowledgeProcessed / funnel.totalOutcomes) * 100)
    : 0;
  const claimReadyRegions = regions.filter(
    r => (r.confidence_score ?? 0) >= 0.7,
  ).length;

  const blockers: string[] = [];
  if (predictionLinkPct < 50 && funnel.totalOutcomes > 0) {
    blockers.push(
      `${100 - predictionLinkPct}% outcomes zonder prediction-link — dieptefout blijft NULL.`,
    );
  }
  if (thisWeek < WEEKLY_TARGET) {
    blockers.push(
      `Deze week ${thisWeek}/${WEEKLY_TARGET} outcomes — onder richttempo.`,
    );
  }
  if (funnel.outliers > 0) {
    blockers.push(`${funnel.outliers} outlier(s) gemarkeerd.`);
  }

  const preview = {
    thisWeek,
    weeklyTarget: WEEKLY_TARGET,
    predictionLinkPct,
    knowledgePct,
    claimReadyRegions,
    blockers,
  };

  const emails = adminEmails();
  if (!emails.length) {
    return { sent: 0, skipped: true, reason: 'ADMIN_EMAILS leeg', preview };
  }

  if (!process.env.RESEND_API_KEY) {
    return { sent: 0, skipped: true, reason: 'RESEND_API_KEY ontbreekt', preview };
  }

  if (opts.dryRun) {
    return { sent: 0, skipped: true, reason: 'dryRun', preview };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://earthgnd.com';
  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@earthgnd.com';
  const weekLabel = weekly[0]?.weekStart
    ? new Date(weekly[0].weekStart).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'deze week';

  const topRegions = regions
    .slice(0, 5)
    .map(
      r =>
        `• ${r.region_name} (${r.soil_type}): n=${r.measurement_count}, conf ${
          r.confidence_score != null ? `${Math.round(r.confidence_score * 100)}%` : '—'
        }, ${r.moat_status}`,
    )
    .join('\n');

  const blockerText = blockers.length
    ? blockers.map(b => `⚠ ${b}`).join('\n')
    : 'Geen blockers.';

  const text =
    `EarthGND Moat — wekelijkse ops digest\n\n` +
    `Week van ${weekLabel}\n` +
    `Outcomes: ${thisWeek}/${WEEKLY_TARGET}\n` +
    `Prediction-link: ${predictionLinkPct}% · Knowledge: ${knowledgePct}%\n` +
    `Regio’s claim-ready (≥70%): ${claimReadyRegions}\n` +
    `Totaal outcomes in funnel: ${funnel.totalOutcomes}\n\n` +
    `Blockers:\n${blockerText}\n\n` +
    `Top regio’s:\n${topRegions || '—'}\n\n` +
    `${PRODUCT_AVAILABILITY_LINE}\n\n` +
    `Ops: ${siteUrl}/nl/admin/moat/ops\n` +
    `Directeur: ${siteUrl}/nl/admin/moat\n` +
    `Shadow: ${siteUrl}/nl/admin/moat/shadow\n`;

  const html =
    `<h2 style="font-family:system-ui,sans-serif">EarthGND Moat — wekelijkse ops</h2>` +
    `<p style="color:#555">Week van ${weekLabel}</p>` +
    `<ul style="font-family:system-ui,sans-serif;line-height:1.6">` +
    `<li><strong>Outcomes:</strong> ${thisWeek}/${WEEKLY_TARGET}</li>` +
    `<li><strong>Prediction-link:</strong> ${predictionLinkPct}%</li>` +
    `<li><strong>Knowledge processed:</strong> ${knowledgePct}%</li>` +
    `<li><strong>Claim-ready regio’s:</strong> ${claimReadyRegions}</li>` +
    `<li><strong>Funnel totaal:</strong> ${funnel.totalOutcomes}</li>` +
    `</ul>` +
    `<p style="font-family:system-ui,sans-serif"><strong>Blockers</strong><br/>${
      blockers.length ? blockers.map(b => `⚠ ${b}`).join('<br/>') : 'Geen blockers.'
    }</p>` +
    `<p style="font-family:system-ui,sans-serif;white-space:pre-line">${topRegions || '—'}</p>` +
    `<p style="font-size:12px;color:#888">${PRODUCT_AVAILABILITY_LINE}</p>` +
    `<p>` +
    `<a href="${siteUrl}/nl/admin/moat/ops" style="background:#E8761A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open Ops</a>` +
    `</p>`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  for (const to of emails) {
    await resend.emails.send({
      from,
      to,
      subject: `Moat ops · ${thisWeek}/${WEEKLY_TARGET} outcomes · week ${weekLabel}`,
      text,
      html,
    });
    sent += 1;
  }

  return { sent, skipped: false, preview };
}
