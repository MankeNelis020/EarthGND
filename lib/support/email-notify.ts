import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface PendingNotification {
  messageId:      string;
  conversationId: string;
  userId:         string;
  externalRef:    Record<string, unknown> | null;
}

/**
 * Sends email notifications for agent replies that have been unread for
 * more than 15 minutes. Marks each message so it is only notified once.
 * Called by the cron endpoint every 15 minutes.
 */
export async function sendPendingEmailNotifications(): Promise<{ sent: number; errors: number }> {
  const db      = getDb();
  const resend  = new Resend(process.env.RESEND_API_KEY);
  const from    = process.env.RESEND_FROM_EMAIL ?? 'noreply@earthgnd.com';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://earthgnd.com';
  const cutoff  = new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString();

  // Find unread agent messages older than 15 minutes
  const { data: msgs, error } = await db
    .from('messages')
    .select('id, conversation_id, external_ref, conversations!inner(user_id, status)')
    .eq('sender_type', 'agent')
    .is('read_at', null)
    .lt('created_at', cutoff)
    .neq('conversations.status', 'closed');

  if (error) {
    console.error('[email-notify] query mislukt:', error);
    return { sent: 0, errors: 1 };
  }

  // Filter out already-notified messages (JS-side, avoids JSONB filter complexity)
  const pending: PendingNotification[] = (msgs ?? [])
    .filter(m => {
      const ref = m.external_ref as Record<string, unknown> | null;
      return !ref?.email_notified_at;
    })
    .map(m => {
      const conv = m.conversations as unknown as { user_id: string };
      return {
        messageId:      m.id as string,
        conversationId: m.conversation_id as string,
        userId:         conv.user_id,
        externalRef:    m.external_ref as Record<string, unknown> | null,
      };
    });

  // Deduplicate by userId — one email per user, not per message
  const byUser: Record<string, PendingNotification[]> = {};
  for (const p of pending) {
    if (!byUser[p.userId]) byUser[p.userId] = [];
    byUser[p.userId].push(p);
  }

  let sent   = 0;
  let errors = 0;

  for (const [userId, notifications] of Object.entries(byUser)) {
    try {
      // Look up the user's email via Supabase auth admin API
      const { data: authUser } = await db.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (!email) continue;

      const count = notifications.length;
      const subject = count === 1
        ? 'Nieuw bericht — EarthGND Ondersteuning'
        : `${count} nieuwe berichten — EarthGND Ondersteuning`;

      await resend.emails.send({
        from,
        to:      email,
        subject,
        text:
          `Hoi,\n\n` +
          `Er ${count === 1 ? 'is een nieuw bericht' : `zijn ${count} nieuwe berichten`} ` +
          `voor je klaar in EarthGND Ondersteuning.\n\n` +
          `Open de EarthGND app en klik op de chat-knop rechtsonder om te antwoorden.\n\n` +
          `${siteUrl}\n\n` +
          `— EarthGND`,
        html:
          `<p>Hoi,</p>` +
          `<p>Er ${count === 1 ? 'is een nieuw bericht' : `zijn ${count} nieuwe berichten`} ` +
          `voor je klaar in EarthGND Ondersteuning.</p>` +
          `<p><a href="${siteUrl}" style="background:#E8761A;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open EarthGND</a></p>` +
          `<p style="color:#888;font-size:12px">Klik op de chat-knop rechtsonder om te antwoorden.</p>`,
      });

      // Mark each message as email-notified
      const notifiedAt = new Date().toISOString();
      await Promise.allSettled(
        notifications.map((n: PendingNotification) =>
          db.from('messages').update({
            external_ref: { ...(n.externalRef ?? {}), email_notified_at: notifiedAt },
          }).eq('id', n.messageId),
        ),
      );

      sent++;
    } catch (err) {
      console.error(`[email-notify] fout voor user ${userId}:`, err);
      errors++;
    }
  }

  return { sent, errors };
}
