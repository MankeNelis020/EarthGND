import { createHash } from 'crypto';

/**
 * Deterministische, niet-inverteerbare mapping van UUIDs naar pseudoniemen.
 * Dezelfde input geeft altijd hetzelfde pseudoniem terug — geen DB nodig.
 * Er gaan nooit namen, e-mailadressen of andere PII naar de adapter.
 */

export function userIdToPseudonym(userId: string): string {
  const hash = createHash('sha256').update(`usr:${userId}`).digest('hex');
  const num  = parseInt(hash.slice(0, 8), 16) % 10000;
  return `MNT-${num.toString().padStart(4, '0')}`;
}

export function orgIdToPseudonym(orgId: string): string {
  const hash = createHash('sha256').update(`org:${orgId}`).digest('hex');
  const num  = parseInt(hash.slice(0, 8), 16) % 1000;
  return `ORG-${num.toString().padStart(3, '0')}`;
}
