'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

interface KlicUtiliteiten {
  elektriciteit: boolean;
  gas: boolean;
  water: boolean;
  telecom: boolean;
  riolering: boolean;
  warmte: boolean;
  overig: boolean;
}

const UTILITEIT_LABELS: { key: keyof KlicUtiliteiten; label: string; icon: string }[] = [
  { key: 'elektriciteit', label: 'Elektriciteit', icon: '⚡' },
  { key: 'gas',           label: 'Gas',           icon: '🔥' },
  { key: 'water',         label: 'Water',          icon: '💧' },
  { key: 'telecom',       label: 'Telecom',        icon: '📡' },
  { key: 'riolering',     label: 'Riolering',      icon: '🪣' },
  { key: 'warmte',        label: 'Warmte',         icon: '♨️' },
  { key: 'overig',        label: 'Overig',         icon: '📦' },
];

const COMMON_NETBEHEERDERS = [
  'Liander', 'Stedin', 'Enexis', 'Coteq', 'DNWG', 'Rendo',
  'Waternet', 'Oasen', 'Evides', 'Dunea', 'Vitens',
  'KPN', 'Ziggo', 'Reggefiber',
];

const STEPS = ['Melding', 'Locatie', 'Netbeheerders', 'Kabels', 'Afronden'] as const;
type Step = (typeof STEPS)[number];

interface KlicFormProps {
  rapportId?: string;
  onSaved?: (klicId: string) => void;
  onCancel?: () => void;
}

export function KlicForm({ rapportId, onSaved, onCancel }: KlicFormProps) {
  const [step, setStep] = useState<Step>('Melding');
  const stepIndex = STEPS.indexOf(step);

  // Form state
  const [meldingsnummer, setMeldingsnummer] = useState('');
  const [melddatum, setMelddatum]           = useState(new Date().toISOString().slice(0, 10));
  const [geldigTot, setGeldigTot]           = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 8);
    return d.toISOString().slice(0, 10);
  });
  const [graafAdres, setGraafAdres]         = useState('');
  const [graafPostcode, setGraafPostcode]   = useState('');
  const [netbeheerders, setNetbeheerders]   = useState<string[]>([]);
  const [customNb, setCustomNb]             = useState('');
  const [utiliteiten, setUtiliteiten]       = useState<KlicUtiliteiten>({
    elektriciteit: false, gas: false, water: false, telecom: false,
    riolering: false, warmte: false, overig: false,
  });
  const [diepsteKabel, setDiepsteKabel]     = useState('');
  const [veiligGraven, setVeiligGraven]     = useState(true);
  const [opmerkingen, setOpmerkingen]       = useState('');
  const [fotoPath, setFotoPath]             = useState<string | null>(null);
  const [fotoPreview, setFotoPreview]       = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');
  const fileRef                             = useRef<HTMLInputElement>(null);

  function toggleNetbeheerder(nb: string) {
    setNetbeheerders(prev =>
      prev.includes(nb) ? prev.filter(n => n !== nb) : [...prev, nb]
    );
  }

  function addCustomNb() {
    const trimmed = customNb.trim();
    if (trimmed && !netbeheerders.includes(trimmed)) {
      setNetbeheerders(prev => [...prev, trimmed]);
    }
    setCustomNb('');
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setFotoPreview(preview);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${user.id}/klic-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('rapport-fotos')
      .upload(path, file, { upsert: true });

    if (!uploadErr) setFotoPath(path);
  }

  async function handleSave() {
    if (!meldingsnummer.trim()) { setError('Vul het meldingsnummer in'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/klic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rapport_id: rapportId,
          meldingsnummer: meldingsnummer.trim(),
          melddatum,
          geldig_tot: geldigTot,
          graaf_adres: graafAdres || null,
          graaf_postcode: graafPostcode || null,
          utiliteiten,
          netbeheerders,
          diepste_kabel_m: diepsteKabel ? parseFloat(diepsteKabel) : null,
          veilig_graven: veiligGraven,
          opmerkingen: opmerkingen || null,
          foto_path: fotoPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Opslaan mislukt'); return; }
      onSaved?.(data.id);
    } catch {
      setError('Verbindingsfout — probeer opnieuw');
    } finally {
      setSaving(false);
    }
  }

  const isGeldigTotWarning = (() => {
    if (!geldigTot) return false;
    const diff = (new Date(geldigTot).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 2;
  })();

  return (
    <div className="flex flex-col min-h-0">
      {/* Step indicator */}
      <div className="flex items-center gap-1 px-4 py-3 border-b border-white/8 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => i < stepIndex && setStep(s)}
              disabled={i > stepIndex}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < stepIndex  ? 'bg-[#E8761A] text-white cursor-pointer' :
                i === stepIndex ? 'bg-[#E8761A]/20 border border-[#E8761A] text-[#E8761A]' :
                                   'bg-white/5 text-white/70'
              }`}
            >
              {i < stepIndex ? '✓' : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${i < stepIndex ? 'bg-[#E8761A]/40' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-white/60 shrink-0">{step}</span>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5">

        {/* ── Stap 1: Melding ── */}
        {step === 'Melding' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60">
                Meldingsnummer <span className="text-[#E8761A]">*</span>
              </label>
              <input
                type="text"
                value={meldingsnummer}
                onChange={e => setMeldingsnummer(e.target.value)}
                placeholder="bijv. 20240614001"
                autoFocus
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-[#E8761A] focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-white/70">
                Staat op de KLIC-tekening of de bevestigingsmail van het Kadaster
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/60">Melddatum</label>
                <input
                  type="date"
                  value={melddatum}
                  onChange={e => setMelddatum(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/60">
                  Geldig tot
                </label>
                <input
                  type="date"
                  value={geldigTot}
                  onChange={e => setGeldigTot(e.target.value)}
                  className={`w-full rounded-xl border bg-zinc-900 px-3 py-3 text-sm text-white focus:outline-none ${
                    isGeldigTotWarning ? 'border-orange-500/60 focus:border-orange-500' : 'border-zinc-700 focus:border-[#E8761A]'
                  }`}
                />
              </div>
            </div>
            {isGeldigTotWarning && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/8 px-4 py-3 text-xs text-orange-400">
                ⚠ KLIC-melding verloopt binnenkort — controleer of graafwerkzaamheden tijdig plaatsvinden.
              </div>
            )}
          </>
        )}

        {/* ── Stap 2: Locatie ── */}
        {step === 'Locatie' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60">Graafadres</label>
              <input
                type="text"
                value={graafAdres}
                onChange={e => setGraafAdres(e.target.value)}
                placeholder="Straatnaam + huisnummer"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-[#E8761A] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60">Postcode</label>
              <input
                type="text"
                value={graafPostcode}
                onChange={e => setGraafPostcode(e.target.value)}
                placeholder="1234 AB"
                maxLength={7}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-[#E8761A] focus:outline-none"
              />
            </div>
          </>
        )}

        {/* ── Stap 3: Netbeheerders ── */}
        {step === 'Netbeheerders' && (
          <>
            <p className="text-xs text-white/60">Welke netbeheerders zijn aanwezig?</p>
            <div className="grid grid-cols-2 gap-2">
              {COMMON_NETBEHEERDERS.map(nb => (
                <button
                  key={nb}
                  onClick={() => toggleNetbeheerder(nb)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium text-left transition-all ${
                    netbeheerders.includes(nb)
                      ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                      : 'border-zinc-700 bg-zinc-900 text-white/60 hover:border-zinc-500'
                  }`}
                >
                  {nb}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customNb}
                onChange={e => setCustomNb(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomNb()}
                placeholder="Andere netbeheerder..."
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-[#E8761A] focus:outline-none"
              />
              <button
                onClick={addCustomNb}
                className="rounded-xl bg-[#E8761A]/10 border border-[#E8761A]/30 px-4 py-3 text-sm font-semibold text-[#E8761A]"
              >
                +
              </button>
            </div>
            {netbeheerders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {netbeheerders.map(nb => (
                  <span key={nb} className="flex items-center gap-1 rounded-lg bg-[#E8761A]/15 px-3 py-1 text-sm text-[#E8761A]">
                    {nb}
                    <button onClick={() => toggleNetbeheerder(nb)} className="text-[#E8761A]/60 hover:text-[#E8761A]">×</button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Stap 4: Kabels & leidingen ── */}
        {step === 'Kabels' && (
          <>
            <p className="text-xs text-white/60">Welke kabels/leidingen zijn aanwezig?</p>
            <div className="grid grid-cols-2 gap-3">
              {UTILITEIT_LABELS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setUtiliteiten(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-medium transition-all ${
                    utiliteiten[key]
                      ? 'border-[#E8761A] bg-[#E8761A]/10 text-white'
                      : 'border-zinc-700 bg-zinc-900 text-white/70'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60">
                Diepste kabel/leiding (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={diepsteKabel}
                onChange={e => setDiepsteKabel(e.target.value)}
                placeholder="bijv. 0.60"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-[#E8761A] focus:outline-none"
              />
              {diepsteKabel && parseFloat(diepsteKabel) < 0.5 && (
                <p className="mt-1.5 text-xs text-orange-400">
                  Let op: kabel ondieper dan 0,5 m — extra voorzichtigheid bij grondbewerking.
                </p>
              )}
            </div>

            {/* Veilig graven toggle */}
            <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Veilig graven mogelijk</p>
                  <p className="text-xs text-white/60 mt-0.5">Is grondbewerking veilig uitvoerbaar op deze locatie?</p>
                </div>
                <button
                  onClick={() => setVeiligGraven(v => !v)}
                  className={`flex h-7 w-12 items-center rounded-full transition-colors ${veiligGraven ? 'bg-green-500' : 'bg-red-500/70'}`}
                >
                  <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform mx-1 ${veiligGraven ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {!veiligGraven && (
                <p className="mt-3 text-xs text-red-400">
                  Markeer de reden in de opmerkingen. Consulteer de netbeheerder(s) voor toestemming.
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Stap 5: Afronden ── */}
        {step === 'Afronden' && (
          <>
            {/* Photo capture */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60">
                Foto KLIC-tekening (optioneel)
              </label>
              {fotoPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoPreview} alt="KLIC foto" className="w-full max-h-56 object-cover" />
                  <button
                    onClick={() => { setFotoPreview(null); setFotoPath(null); }}
                    className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5 text-xs text-white hover:bg-black"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-600 bg-zinc-900 py-8 text-sm text-white/60 hover:border-[#E8761A]/40 hover:text-[#E8761A]/60 transition-colors"
                >
                  <span className="text-3xl">📷</span>
                  <span>Foto maken of uploaden</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFoto}
                className="hidden"
              />
            </div>

            {/* Opmerkingen */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60">
                Opmerkingen
              </label>
              <textarea
                value={opmerkingen}
                onChange={e => setOpmerkingen(e.target.value)}
                rows={3}
                placeholder="Bijzonderheden, voorbehouden, te nemen maatregelen..."
                className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-[#E8761A] focus:outline-none"
              />
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-2 text-xs">
              <p className="font-semibold text-white/70">Samenvatting</p>
              <div className="space-y-1 text-white/70">
                <p>Meldingsnummer: <span className="text-white font-mono">{meldingsnummer || '–'}</span></p>
                <p>Geldig tot: <span className="text-white">{geldigTot || '–'}</span></p>
                {graafAdres && <p>Adres: <span className="text-white">{graafAdres}</span></p>}
                {netbeheerders.length > 0 && (
                  <p>Netbeheerders: <span className="text-white">{netbeheerders.join(', ')}</span></p>
                )}
                {Object.entries(utiliteiten).filter(([, v]) => v).length > 0 && (
                  <p>Kabels: <span className="text-white">
                    {Object.entries(utiliteiten).filter(([, v]) => v).map(([k]) => k).join(', ')}
                  </span></p>
                )}
                {diepsteKabel && <p>Diepste kabel: <span className="text-white">{diepsteKabel} m</span></p>}
                <p>Veilig graven: <span className={veiligGraven ? 'text-green-400' : 'text-red-400'}>{veiligGraven ? 'Ja' : 'Nee'}</span></p>
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="border-t border-white/8 px-4 py-4 flex gap-3">
        <button
          onClick={stepIndex === 0 ? onCancel : () => setStep(STEPS[stepIndex - 1])}
          className="flex-1 rounded-xl border border-zinc-700 py-3.5 text-sm font-semibold text-white/60 hover:border-zinc-500 transition-colors"
        >
          {stepIndex === 0 ? 'Annuleren' : '← Terug'}
        </button>
        {step !== 'Afronden' ? (
          <button
            onClick={() => {
              if (step === 'Melding' && !meldingsnummer.trim()) {
                setError('Vul het meldingsnummer in');
                return;
              }
              setError('');
              setStep(STEPS[stepIndex + 1]);
            }}
            className="flex-1 rounded-xl bg-[#E8761A] py-3.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
          >
            Volgende →
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-[#E8761A] py-3.5 text-sm font-semibold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        )}
      </div>
    </div>
  );
}
