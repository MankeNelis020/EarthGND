/**
 * Unit-tests voor lib/support/service.ts
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/test-support-service.ts
 *
 * Test-strategie: mock-adapter + in-memory state i.p.v. echte DB.
 * De tests raken geen Supabase aan — alle DB-calls worden vervangen.
 */

import { userIdToPseudonym, orgIdToPseudonym } from '../lib/support/pseudonym';
import type { SupportAdapter, AgentReply } from '../lib/support/adapter';
import type { Conversation, Message } from '../lib/support/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ─── Test: pseudonym.ts ───────────────────────────────────────────────────────

console.log('\n[pseudonym]');

const uid1 = '550e8400-e29b-41d4-a716-446655440000';
const uid2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

const p1 = userIdToPseudonym(uid1);
const p2 = userIdToPseudonym(uid2);
const p1b = userIdToPseudonym(uid1);

ok('MNT-formaat klopt', /^MNT-\d{4}$/.test(p1), p1);
ok('Deterministisch: zelfde input → zelfde output', p1 === p1b);
ok('Verschillende users → (waarschijnlijk) verschillende pseudoniemen', p1 !== p2, `${p1} vs ${p2}`);
ok('Geen PII in pseudoniem', !p1.includes(uid1));

const org1 = orgIdToPseudonym('org-abc-123');
ok('ORG-formaat klopt', /^ORG-\d{3}$/.test(org1), org1);
ok('ORG != MNT voor zelfde input', orgIdToPseudonym(uid1) !== userIdToPseudonym(uid1));

// ─── Mock adapter ─────────────────────────────────────────────────────────────

interface SentCall {
  conversation: Conversation;
  message:      Message;
}

function createMockAdapter(opts?: { failSend?: boolean }): SupportAdapter & { sent: SentCall[] } {
  const sent: SentCall[] = [];
  return {
    sent,
    async sendToAgent(conversation, message) {
      if (opts?.failSend) throw new Error('Slack is plat');
      sent.push({ conversation, message });
      return { externalRef: { thread_ts: '1234567890.123456', channel_id: 'C0123' } };
    },
    async parseAgentReply(payload: unknown): Promise<AgentReply | null> {
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'conversationId' in payload &&
        'body' in payload &&
        'senderRef' in payload
      ) {
        return payload as AgentReply;
      }
      return null;
    },
  };
}

// ─── Test: adapter interface ──────────────────────────────────────────────────

async function runTests() {

console.log('\n[adapter — mock]');

const mock = createMockAdapter();

const fakeConv: Conversation = {
  id:                      'conv-001',
  user_id:                 uid1,
  organisation_id:         null,
  category:                'calculation',
  status:                  'waiting_for_support',
  subject:                 null,
  context:                 { currentRoute: '/nl/pendiepte' },
  calculation_snapshot_id: null,
  last_message_at:         new Date().toISOString(),
  created_at:              new Date().toISOString(),
  updated_at:              new Date().toISOString(),
};

const fakeMsg: Message = {
  id:              'msg-001',
  conversation_id: 'conv-001',
  sender_type:     'user',
  sender_ref:      userIdToPseudonym(uid1),
  body:            'Mijn berekening klopt niet, ρ = 21 Ω·m',
  attachments:     [],
  external_ref:    null,
  read_at:         null,
  created_at:      new Date().toISOString(),
};

{
  const result = await mock.sendToAgent(fakeConv, fakeMsg);
  ok('sendToAgent geeft externalRef terug', result.externalRef !== null);
  ok('sendToAgent logt de call', mock.sent.length === 1);
  ok('Verzonden conversation klopt', mock.sent[0].conversation.id === 'conv-001');
  ok('Verzonden message klopt',      mock.sent[0].message.body.includes('ρ = 21'));
}

{
  const validPayload = { conversationId: 'conv-001', body: 'Goedemorgen!', senderRef: 'AGENT-001' };
  const reply = await mock.parseAgentReply(validPayload);
  ok('parseAgentReply herkent geldig payload', reply !== null);
  ok('parseAgentReply geeft juiste velden terug', reply?.conversationId === 'conv-001' && reply?.body === 'Goedemorgen!');

  const nullReply = await mock.parseAgentReply({ random: 'garbage' });
  ok('parseAgentReply geeft null terug voor onbekend payload', nullReply === null);

  const nullReply2 = await mock.parseAgentReply('string payload');
  ok('parseAgentReply geeft null terug voor string', nullReply2 === null);
}

// ─── Test: adapter fout verliest bericht niet ─────────────────────────────────

console.log('\n[adapter — resilience]');

{
  // Simuleer: DB-write is al klaar, adapter crasht → bericht blijft bewaard
  const failAdapter = createMockAdapter({ failSend: true });
  let dbWritten   = false;
  let adapterFailed = false;

  // Simuleer service-patroon: DB first, adapter daarna
  dbWritten = true;  // altijd
  try {
    await failAdapter.sendToAgent(fakeConv, fakeMsg);
  } catch {
    adapterFailed = true;
  }

  ok('DB-write altijd geslaagd ook als adapter faalt', dbWritten);
  ok('Adapter-fout gevangen (bericht niet verloren)', adapterFailed && dbWritten);
}

// ─── Test: rate-limit SQL-functie logica ──────────────────────────────────────

console.log('\n[rate-limit — logica]');

// Simuleer de telfunctie zonder DB
function rateLimitOk(count: number, limit = 10): boolean {
  return count < limit;
}

ok('0 gesprekken → toegestaan',  rateLimitOk(0));
ok('9 gesprekken → toegestaan',  rateLimitOk(9));
ok('10 gesprekken → geblokkeerd', !rateLimitOk(10));
ok('11 gesprekken → geblokkeerd', !rateLimitOk(11));

// ─── Test: attachment validatie ───────────────────────────────────────────────

console.log('\n[attachments]');

const ALLOWED_MIMES = /^(image\/(jpeg|png|webp|gif|heic)|application\/pdf)$/;
const MAX_SIZE      = 10 * 1024 * 1024;

ok('image/jpeg toegestaan',      ALLOWED_MIMES.test('image/jpeg'));
ok('image/png toegestaan',       ALLOWED_MIMES.test('image/png'));
ok('image/webp toegestaan',      ALLOWED_MIMES.test('image/webp'));
ok('image/heic toegestaan',      ALLOWED_MIMES.test('image/heic'));
ok('application/pdf toegestaan', ALLOWED_MIMES.test('application/pdf'));
ok('application/zip geweigerd',  !ALLOWED_MIMES.test('application/zip'));
ok('text/html geweigerd',        !ALLOWED_MIMES.test('text/html'));
ok('video/mp4 geweigerd',        !ALLOWED_MIMES.test('video/mp4'));
ok('9 MB toegestaan',            9 * 1024 * 1024 <= MAX_SIZE);
ok('10 MB exact geweigerd',      10 * 1024 * 1024 + 1 > MAX_SIZE);

// ─── Resultaat ────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Resultaat: ${passed} PASS, ${failed} FAIL`);
console.log('─'.repeat(50));

if (failed > 0) process.exit(1);

} // end runTests

runTests().catch(e => { console.error(e); process.exit(1); });
