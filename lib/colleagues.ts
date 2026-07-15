export interface SavedColleague {
  id: string;
  name: string;
  email: string;
  erkenning: string | null;
  created_at: string;
  last_used_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeColleagueEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidColleagueEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeColleagueEmail(email));
}

export function colleagueDisplayLabel(c: Pick<SavedColleague, 'name' | 'email' | 'erkenning'>): string {
  const name = c.name.trim();
  const base = name ? `${name} (${c.email})` : c.email;
  const erk = c.erkenning?.trim();
  return erk ? `${base} · ${erk}` : base;
}
