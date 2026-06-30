'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { isProPlan, PROFILE_LOGO_BUCKET, profileLogoPath, type UserProfileSettings } from '@/lib/profile';

export function SettingsForm() {
  const [profile, setProfile] = useState<UserProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [companyName, setCompanyName] = useState('');
  const [installateurNaam, setInstallateurNaam] = useState('');
  const [installateurErkenning, setInstallateurErkenning] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Laden mislukt');
      const p = data.profile as UserProfileSettings;
      setProfile(p);
      setCompanyName(p.company_name ?? '');
      setInstallateurNaam(p.installateur_naam ?? '');
      setInstallateurErkenning(p.installateur_erkenning ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          installateur_naam: installateurNaam,
          installateur_erkenning: installateurErkenning,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt');
      setProfile(data.profile);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!isProPlan(profile.plan)) {
      setError('Bedrijfslogo uploaden is beschikbaar vanaf het Pro plan.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Alleen afbeeldingen (PNG, JPG, SVG) zijn toegestaan.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo mag maximaal 2 MB zijn.');
      return;
    }

    setLogoUploading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = profileLogoPath(user.id, ext);

      const { error: uploadErr } = await supabase.storage
        .from(PROFILE_LOGO_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from(PROFILE_LOGO_BUCKET).getPublicUrl(path);
      const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: logoUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Logo opslaan mislukt');
      setProfile(data.profile);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload mislukt');
    } finally {
      setLogoUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    if (!profile?.logo_url) return;
    setLogoUploading(true);
    setError('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Verwijderen mislukt');
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt');
    } finally {
      setLogoUploading(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-white/40">Instellingen laden…</p>;
  }

  const proPlan = profile ? isProPlan(profile.plan) : false;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Bedrijfslogo — Pro only */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-6">
        <h2 className="mb-1 text-sm font-semibold text-white">Bedrijfslogo</h2>
        <p className="mb-4 text-xs text-white/45 leading-relaxed">
          {proPlan
            ? 'Wordt getoond op opleverrapporten (PNG/JPG/SVG, max. 2 MB).'
            : 'Beschikbaar vanaf het Pro plan — upgrade om uw logo op rapporten te tonen.'}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {profile?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo_url} alt="Bedrijfslogo" className="h-14 max-w-[180px] rounded-lg border border-white/10 bg-white/5 object-contain p-2" />
          ) : (
            <div className="flex h-14 w-28 items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-white/30">
              Geen logo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={!proPlan || logoUploading} />
            <button
              type="button"
              disabled={!proPlan || logoUploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:border-[#E8761A]/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {logoUploading ? 'Uploaden…' : proPlan ? 'Logo kiezen' : 'Pro vereist'}
            </button>
            {profile?.logo_url && proPlan && (
              <button type="button" onClick={handleRemoveLogo} disabled={logoUploading} className="text-xs text-white/35 hover:text-red-400">
                Logo verwijderen
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Installateur gegevens */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-6">
        <h2 className="mb-1 text-sm font-semibold text-white">Installateur</h2>
        <p className="mb-4 text-xs text-white/45 leading-relaxed">
          Deze gegevens worden automatisch ingevuld op opleverrapporten en NEN 1010-rapporten.
          Certificaatnummer is optioneel.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-white/50">Bedrijfsnaam (optioneel)</label>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Bijv. Elektro Jansen BV"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">Naam installateur</label>
            <input
              value={installateurNaam}
              onChange={e => setInstallateurNaam(e.target.value)}
              placeholder="Bijv. J. Jansen"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-white/50">Certificaatnummer / erkenning (optioneel)</label>
            <input
              value={installateurErkenning}
              onChange={e => setInstallateurErkenning(e.target.value)}
              placeholder="Bijv. E-12345"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Data gebruik — account consent */}
      <section className="rounded-2xl border border-white/8 bg-white/3 px-5 py-4">
        <p className="text-xs text-white/50 leading-relaxed">
          Geanonimiseerde meetgegevens worden gebruikt ter verbetering van het EarthGND-model.
          Dit is onderdeel van uw acceptatie bij accountaanmaak (zie{' '}
          <a href="/privacy" className="text-[#E8761A] underline underline-offset-2">privacyverklaring</a>).
          {profile?.terms_accepted_at && (
            <span className="mt-1 block text-white/35">
              Geaccepteerd op {new Date(profile.terms_accepted_at).toLocaleDateString('nl-NL')}.
            </span>
          )}
        </p>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-green-400">Instellingen opgeslagen.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
      >
        {saving ? 'Opslaan…' : 'Opslaan'}
      </button>
    </form>
  );
}
