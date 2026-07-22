/**
 * Eén resolver-functie per PrincipalKind. Elke resolver formaliseert een
 * mechanisme dat al ergens in de repo bestond en correct bleek te zijn —
 * dit bestand verzint geen nieuwe auth, het trekt bestaande, verspreide
 * checks samen op één plek zodat `AuthorizedContext.authorize()` (context.ts)
 * ze uniform kan aanroepen.
 *
 * Alleen `resolveUserPrincipal` wordt in deze slice daadwerkelijk door een
 * route gebruikt (`/api/bro`). De overige vier zijn nu al correct
 * geïmplementeerd omdat het endpoint-framework alle vijf principal-soorten
 * moet ondersteunen (vereiste #8) — een machine-endpoint mag nooit in een
 * user-sessie-vorm gedwongen worden zodra het gemigreerd wordt.
 */

import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { verifySlackSignature } from '@/lib/support/slack-verify';
import { getStripe } from '@/lib/stripe';
import { requireSecret, adminEmailAllowlist } from './config';

/** Constant-time string-vergelijking — voorkomt het timing-zijkanaal uit bevinding B8. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
import type {
  AdminPrincipal,
  AnonymousPrincipal,
  CronPrincipal,
  ServicePrincipal,
  Tier,
  UserPrincipal,
  WebhookPrincipal,
} from './principal';

// ─── anonymous ────────────────────────────────────────────────────────────────

export function resolveAnonymousPrincipal(): AnonymousPrincipal {
  return { kind: 'anonymous' };
}

// ─── user ──────────────────────────────────────────────────────────────────────

/**
 * Zuivere kern, apart van de Next.js-cookiecontext gehouden zodat hij
 * getest kan worden zonder een echte request (scripts/architecture/
 * test-authz-kernel.ts injecteert hier een fake Supabase-client).
 */
export async function buildUserPrincipal(
  supabase: Pick<SupabaseClient, 'auth' | 'from'>,
): Promise<UserPrincipal | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, credits_left')
    .eq('id', user.id)
    .single();

  return {
    kind: 'user',
    id: user.id,
    email: user.email,
    plan: (profile?.plan as Tier) ?? 'gratis',
  };
}

/**
 * RLS-scoped lookup (`profiles` heeft `auth.uid() = id`-policy) — bewust
 * geen service-role hier. De authz-kernel gebruikt de omzeilende client
 * alleen waar RLS het structureel niet kan (ownership nog niet gezet), niet
 * als gemakzuchtig alternatief.
 */
export async function resolveUserPrincipal(): Promise<UserPrincipal | null> {
  const supabase = createClient(await import('next/headers').then((m) => m.cookies()));
  return buildUserPrincipal(supabase);
}

/** Voor gebruik binnen use-cases die al een user-principal hebben en credits_left nodig hebben. */
export async function loadCreditsLeft(userId: string): Promise<number> {
  const { getCreditsLeft } = await import('@/lib/credits');
  return getCreditsLeft(userId);
}

// ─── admin ─────────────────────────────────────────────────────────────────────

/**
 * Fail-closed: een lege ADMIN_EMAILS betekent "niemand is admin", nooit
 * "iedereen is admin" (dat was bevinding B4). `adminEmailAllowlist()` komt
 * uit config.ts en gooit geen exception bij een lege lijst — de lege lijst
 * ís de correcte, veilige default.
 */
export async function resolveAdminPrincipal(): Promise<AdminPrincipal | null> {
  const user = await resolveUserPrincipal();
  if (!user) return null;
  const allowlist = adminEmailAllowlist();
  if (!allowlist.includes(user.email.toLowerCase())) return null;
  return { kind: 'admin', id: user.id, email: user.email };
}

// ─── webhook ───────────────────────────────────────────────────────────────────

/**
 * Vereist de raw body (vóór JSON.parse) — de aanroeper (defineEndpoint) leest
 * de body exact één keer en geeft hem door aan zowel deze resolver als aan
 * input-validatie, want een Request-stream kan maar één keer gelezen worden.
 */
export function resolveStripeWebhookPrincipal(rawBody: string, signatureHeader: string | null): WebhookPrincipal | null {
  if (!signatureHeader) return null;
  try {
    getStripe().webhooks.constructEvent(rawBody, signatureHeader, requireSecret('STRIPE_WEBHOOK_SECRET'));
    return { kind: 'webhook', source: 'stripe' };
  } catch {
    return null;
  }
}

export function resolveSlackWebhookPrincipal(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
): WebhookPrincipal | null {
  const valid = verifySlackSignature(rawBody, timestampHeader ?? '', signatureHeader ?? '');
  return valid ? { kind: 'webhook', source: 'slack' } : null;
}

// ─── cron ──────────────────────────────────────────────────────────────────────

/**
 * requireSecret() gooit als CRON_SECRET ontbreekt — er is geen "if
 * (cronSecret)"-pad meer dat de check kan overslaan (dat was bevinding B11).
 */
export function resolveCronPrincipal(request: NextRequest): CronPrincipal | null {
  const expected = `Bearer ${requireSecret('CRON_SECRET')}`;
  const actual = request.headers.get('authorization') ?? '';
  return safeEqual(actual, expected) ? { kind: 'cron' } : null;
}

// ─── service (interne server-naar-server-aanroepen) ────────────────────────────

/**
 * Vervangt het "vergelijk met SUPABASE_SERVICE_ROLE_KEY"-patroon (bevinding
 * B8) door een dedicated secret, zodat een lek van de database-credential
 * niet automatisch ook alle interne routes opent.
 */
export function resolveServicePrincipal(request: NextRequest, callerName: string): ServicePrincipal | null {
  const expected = requireSecret('INTERNAL_API_SECRET');
  const actual = request.headers.get('x-internal-secret') ?? '';
  return safeEqual(actual, expected) ? { kind: 'service', caller: callerName } : null;
}
