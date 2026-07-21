import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the Slack request signature (HMAC-SHA256).
 * Rejects replays older than 5 minutes.
 */
export function verifySlackSignature(
  rawBody:   string,
  timestamp: string,
  signature: string,
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET ?? '';
  if (!secret || !timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) return false;

  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
