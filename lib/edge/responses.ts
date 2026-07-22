/** Consistente JSON-responsvorm voor endpoints gebouwd op defineEndpoint. */

export function jsonError(status: number, error: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error, ...extra }, { status });
}

/**
 * Gooi dit vanuit een use-case-handler om de aanroep bewust af te breken
 * (bv. domeinvalidatie die pas na het laden van server-side data duidelijk
 * wordt) mét een specifieke clientrespons. `defineEndpoint` vangt dit op,
 * geeft `response` terug aan de client, én behandelt het net als elke
 * andere fout: de credit-reservering (indien aanwezig) wordt gereleased,
 * nooit gecaptured.
 */
export class UseCaseRejection extends Error {
  constructor(public readonly response: Response) {
    super(`UseCaseRejection: ${response.status}`);
  }
}
