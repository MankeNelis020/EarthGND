export interface UserProfileSettings {
  plan: string;
  email: string | null;
  company_name: string | null;
  logo_url: string | null;
  installateur_naam: string | null;
  installateur_erkenning: string | null;
  terms_accepted_at: string | null;
}

export function isProPlan(plan: string): boolean {
  return plan === 'pro';
}

export const PROFILE_LOGO_BUCKET = 'profile-logos';

export function profileLogoPath(userId: string, ext: string): string {
  return `${userId}/logo.${ext}`;
}
