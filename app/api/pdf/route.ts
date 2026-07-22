/**
 * Migratie van bevinding B2 (auditrapport): deze route nam `results` en
 * `inputValues` letterlijk van de client aan en rendered ze ongezien in een
 * PDF met het EarthGND-merk — zonder login, zonder herberekening. Iedereen
 * kon een "officieel" ogend Diepte-rapport met verzonnen cijfers genereren.
 *
 * Nu: twee gescheiden capabilities, elk via defineEndpoint.
 *  - 'report:generate-ohm': gratis, altijd server-side herberekend uit
 *    lib/calculations.ts calcOhmWizard() — geen "results"-veld bestaat als
 *    invoeroptie meer.
 *  - 'report:generate-diepte': vereist login + ownership van een reeds
 *    bestaande, credit-betaalde `calculations`-rij; het rapport wordt
 *    uitsluitend uit die rij opgebouwd.
 *
 * Eén URL bedient hier bewust twee capabilities (de oude route deed
 * hetzelfde via een `tool`-veld) — dit bestand bevat zelf geen
 * businesslogica: het leest alleen het `tool`-discriminatorveld om te
 * bepalen welke defineEndpoint-handler de aanvraag mag verwerken, en elke
 * tak is een normale, losstaande defineEndpoint-aanroep die de
 * route-manifestcontrole (scripts/architecture/check-route-manifest.ts)
 * net zo goed kan detecteren als een 1-op-1 route.
 */

import type { NextRequest } from 'next/server';
import { defineEndpoint } from '@/lib/edge/define-endpoint';
import { jsonError } from '@/lib/edge/responses';
import {
  OhmReportInput,
  DiepteReportInput,
  generateOhmReport,
  generateDiepteReport,
  findDiepteCalculationOwner,
} from '@/lib/application/report-generate';

export const runtime = 'nodejs';

function pdfResponse(outcome: { pdfBuffer: Buffer; pdfUrl: string | null }, filename: string): Response {
  if (outcome.pdfUrl) return Response.json({ pdfUrl: outcome.pdfUrl });
  return new Response(outcome.pdfBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

const ohmEndpoint = defineEndpoint({
  capability: 'report:generate-ohm',
  source: 'json',
  input: OhmReportInput,
  handler: async (ctx, input) => {
    try {
      const outcome = await generateOhmReport(ctx, input);
      return pdfResponse(outcome, 'ohm-report.pdf');
    } catch (err) {
      return jsonError(500, err instanceof Error ? err.message : 'Onbekende fout');
    }
  },
});

const dieptePdfEndpoint = defineEndpoint({
  capability: 'report:generate-diepte',
  source: 'json',
  input: DiepteReportInput,
  resourceOwner: findDiepteCalculationOwner,
  handler: async (ctx, input) => {
    try {
      const outcome = await generateDiepteReport(ctx, input);
      return pdfResponse(outcome, 'diepte-report.pdf');
    } catch (err) {
      return jsonError(500, err instanceof Error ? err.message : 'Onbekende fout');
    }
  },
});

export async function POST(request: NextRequest, routeCtx: { params: Promise<Record<string, string>> }): Promise<Response> {
  const peek = await request.clone().json().catch(() => null);
  if (peek?.tool === 'diepte') return dieptePdfEndpoint(request, routeCtx);
  return ohmEndpoint(request, routeCtx);
}
