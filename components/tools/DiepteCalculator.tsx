'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';
import { PostcodeInput } from './PostcodeInput';
import { useCalculator } from '@/lib/context/CalculatorContext';
import type { DiepteResult, RiskClassResult } from '@/lib/calculations';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Scenarios {
  gunstig:   DiepteResult;
  gemiddeld: DiepteResult;
  ongunstig: DiepteResult;
}

interface ParallelAdvice {
  aantalPennen: number;
  minAfstand: number;
}

interface CalcResult {
  scenarios: Scenarios;
  riskClass: RiskClassResult;
  parallelAdvice: ParallelAdvice | null;
  creditsRemaining: number;
}

interface Profile {
  plan: string;
  credits_left: number;
  credits_reset: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TARGET_PRESETS = [
  { label: 'Bliksem',    value: 10,  norm: 'NEN 62305' },
  { label: 'TT-woning',  value: 30,  norm: 'NEN 1010' },
  { label: 'TT-aardlek', value: 166, norm: 'NEN 1010' },
  { label: 'Utiliteit',  value: 5,   norm: 'NEN 50522' },
];

const riskBorder: Record<string, string> = {
  green:  'border-green-500/30 bg-green-500/5',
  yellow: 'border-yellow-500/30 bg-yellow-500/5',
  orange: 'border-orange-500/30 bg-orange-500/5',
  red:    'border-red-500/30 bg-red-500/5',
};

const riskText: Record<string, string> = {
  green: 'text-green-400', yellow: 'text-yellow-400', orange: 'text-orange-400', red: 'text-red-400',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">
      {children}
    </p>
  );
}

function ScenarioCard({
  label,
  sublabel,
  depth,
  resistance,
  correction,
  dimmed,
}: {
  label: string;
  sublabel: string;
  depth: number;
  resistance: number;
  correction: number;
  dimmed?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-opacity ${dimmed ? 'border-white/5 opacity-50' : 'border-white/10'}`}>
      <p className="mb-0.5 text-xs font-semibold text-white/60">{label}</p>
      <p className="mb-3 text-[11px] text-white/30">{sublabel}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-condensed text-3xl font-black text-white">{depth.toFixed(2)}</span>
        <span className="text-sm text-white/40">m</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/40">
        <span>{resistance.toFixed(2)} Ω berekend</span>
        <span className="text-white/20">·</span>
        <span>correctie ×{correction}</span>
      </div>
    </div>
  );
}

function LoginGate() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <svg className="h-5 w-5 text-white/40" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 10h-1V7A5 5 0 0 0 7 7v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-7H9V7a3 3 0 0 1 6 0v3z"/>
        </svg>
      </div>
      <h3 className="mb-2 font-condensed text-xl font-bold text-white">Inloggen vereist</h3>
      <p className="mb-5 text-sm text-white/50">
        De Pendiepte Calculator is beschikbaar voor abonnees. Meld je aan om door te gaan.
      </p>
      <div className="flex flex-col items-center gap-2">
        <Link
          href="/login"
          className="rounded-lg bg-[#E8761A] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
        >
          Inloggen of registreren
        </Link>
        <Link href="/pricing" className="text-xs text-white/40 hover:text-white/70 transition-colors">
          Bekijk tarieven en plannen
        </Link>
      </div>
    </div>
  );
}

function CreditsGate({ plan }: { plan: string }) {
  return (
    <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-8 text-center">
      <h3 className="mb-2 font-condensed text-xl font-bold text-white">Geen credits</h3>
      <p className="mb-5 text-sm text-white/50">
        {plan === 'gratis'
          ? 'De Pendiepte Calculator vereist een abonnement of losse credits.'
          : 'Je credits zijn op. Koop credits bij of upgrade je plan.'}
      </p>
      <div className="flex flex-col items-center gap-2">
        <Link
          href="/pricing"
          className="rounded-lg bg-[#E8761A] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
        >
          {plan === 'gratis' ? 'Bekijk tarieven' : 'Credits bijkopen'}
        </Link>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiepteCalculator() {
  const { soilData, postcode } = useCalculator();

  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  const [rho, setRho] = useState(125);
  const [targetResistance, setTargetResistance] = useState(10);
  const [groundwaterDepth, setGroundwaterDepth] = useState(3);
  const [ph, setPh] = useState(6.5);

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      setUser(data.user);
      if (data.user) {
        supabase.from('profiles').select('plan, credits_left, credits_reset').eq('id', data.user.id).single()
          .then(({ data: p }: { data: Profile | null }) => { if (p) setProfile(p); });
      }
    });
  }, []);

  // Sync rho from BRO data
  useEffect(() => {
    if (soilData?.dominantRho) setRho(soilData.dominantRho);
  }, [soilData]);

  useEffect(() => {
    if (soilData?.groundwaterDepth != null) setGroundwaterDepth(soilData.groundwaterDepth);
  }, [soilData]);

  if (user === 'loading') {
    return <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/3" />;
  }

  if (!user) return <LoginGate />;
  if (profile && profile.credits_left <= 0) return <CreditsGate plan={profile.plan} />;

  async function handleCalculate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/diepte/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rho, targetResistance, groundwaterDepth, ph, postcode: postcode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Berekening mislukt');
        return;
      }
      setCalcResult(data);
      if (profile) setProfile((p) => p ? { ...p, credits_left: data.creditsRemaining } : p);
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  const activeRho = soilData?.dominantRho ?? rho;

  return (
    <div className="flex flex-col gap-4">
      {/* Soil / postcode lookup */}
      <PostcodeInput onRhoChange={setRho} onGroundwaterChange={(d) => d != null && setGroundwaterDepth(d)} />

      {/* Credits indicator */}
      {profile && (
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[#E8761A]" />
          <span className="text-xs text-white/60">
            <strong className="text-white">{profile.credits_left} credits</strong> beschikbaar — {profile.plan} plan
          </span>
          <Link href="/pricing" className="ml-auto text-xs text-[#E8761A] hover:underline">Bijkopen</Link>
        </div>
      )}

      {/* Parameters */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <SectionLabel>Parameters</SectionLabel>

        {/* Target resistance presets */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-white/50">Doelweerstand</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 mb-3">
            {TARGET_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setTargetResistance(p.value); setCalcResult(null); }}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                  targetResistance === p.value
                    ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                    : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
                }`}
              >
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-white/30 mt-0.5">≤ {p.value} Ω · {p.norm}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.1"
              step="0.5"
              value={targetResistance}
              onChange={(e) => { setTargetResistance(Number(e.target.value)); setCalcResult(null); }}
              className="w-28 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
            <span className="text-sm text-white/40">Ω — handmatig</span>
          </div>
        </div>

        {/* Rho */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-white/50">
            Bodemweerstand ρ
            {soilData && <span className="ml-2 text-green-400">← BRO: {soilData.dominantRho} Ω·m</span>}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="5000"
              step="10"
              value={activeRho}
              onChange={(e) => { setRho(Number(e.target.value)); setCalcResult(null); }}
              className="flex-1 accent-[#E8761A]"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={activeRho}
                onChange={(e) => { setRho(Number(e.target.value)); setCalcResult(null); }}
                className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
              />
              <span className="text-xs text-white/40">Ω·m</span>
            </div>
          </div>
        </div>

        {/* Groundwater + pH */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-2 text-xs text-white/50">
              Grondwater diepte
              {soilData?.groundwaterDepth != null && <span className="ml-1 text-green-400">← BRO</span>}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="20"
                step="0.5"
                value={groundwaterDepth}
                onChange={(e) => { setGroundwaterDepth(Number(e.target.value)); setCalcResult(null); }}
                className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
              />
              <span className="text-xs text-white/40">m</span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-white/50">Bodem pH</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="14"
                step="0.1"
                value={ph}
                onChange={(e) => { setPh(Number(e.target.value)); setCalcResult(null); }}
                className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
              />
              <span className="text-xs text-white/40">pH</span>
            </div>
          </div>
        </div>
      </div>

      {/* Calculate */}
      <button
        onClick={handleCalculate}
        disabled={loading}
        className="rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white transition-opacity hover:bg-[#d06510] disabled:opacity-50"
      >
        {loading ? 'Berekening...' : `Bereken pendiepte  — 1 credit`}
      </button>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Result */}
      {calcResult && (
        <div className="flex flex-col gap-3">
          {/* Three scenarios */}
          <div className="rounded-2xl border border-white/10 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
                Drie scenario&apos;s
              </span>
              <span className="text-xs text-white/30">ρ = {activeRho} Ω·m  ·  doelweerstand ≤ {targetResistance} Ω</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <ScenarioCard
                label="Gunstig"
                sublabel={`ρ = ${Math.round(activeRho * 0.7)} Ω·m — natte winter`}
                depth={calcResult.scenarios.gunstig.depth}
                resistance={calcResult.scenarios.gunstig.achievedResistance}
                correction={calcResult.scenarios.gunstig.correctionGroundwater}
              />
              <ScenarioCard
                label="Gemiddeld"
                sublabel={`ρ = ${activeRho} Ω·m — norm situatie`}
                depth={calcResult.scenarios.gemiddeld.depth}
                resistance={calcResult.scenarios.gemiddeld.achievedResistance}
                correction={calcResult.scenarios.gemiddeld.correctionGroundwater}
              />
              <ScenarioCard
                label="Ongunstig"
                sublabel={`ρ = ${Math.round(activeRho * 1.5)} Ω·m — droge zomer`}
                depth={calcResult.scenarios.ongunstig.depth}
                resistance={calcResult.scenarios.ongunstig.achievedResistance}
                correction={calcResult.scenarios.ongunstig.correctionGroundwater}
                dimmed
              />
            </div>
          </div>

          {/* Correction factors */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/8 bg-white/3 p-3">
              <p className="text-xs text-white/40 mb-1">Grondwatercorrectie</p>
              <p className="font-mono text-lg font-bold text-white">
                ×{calcResult.scenarios.gemiddeld.correctionGroundwater}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">
                {groundwaterDepth < 2 ? 'Hoog GW — gunstig' : groundwaterDepth > 5 ? 'Diep GW — ongunstig' : 'Normaal'}
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/3 p-3">
              <p className="text-xs text-white/40 mb-1">pH-correctie</p>
              <p className="font-mono text-lg font-bold text-white">
                ×{calcResult.scenarios.gemiddeld.correctionPh}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">
                {ph < 5 ? 'Zuur — corrosief' : ph > 8.5 ? 'Basisch — gunstig' : 'Neutraal'}
              </p>
            </div>
          </div>

          {/* Parallel rod advice */}
          {calcResult.parallelAdvice && (
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
              <p className="mb-1 text-sm font-semibold text-orange-400">Parallelschakeling aanbevolen</p>
              <p className="text-xs text-white/60">
                Pendiepte exceeds 12 m. Gebruik {calcResult.parallelAdvice.aantalPennen} aardpennen parallel
                met een minimale onderlinge afstand van {calcResult.parallelAdvice.minAfstand} m.
              </p>
            </div>
          )}

          {/* Risk class */}
          <div className={`rounded-2xl border p-5 ${riskBorder[calcResult.riskClass.color]}`}>
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${riskBorder[calcResult.riskClass.color]}`}>
                <span className={`font-condensed text-2xl font-black ${riskText[calcResult.riskClass.color]}`}>
                  {calcResult.riskClass.riskClass}
                </span>
              </div>
              <div>
                <p className={`font-condensed text-lg font-bold ${riskText[calcResult.riskClass.color]}`}>
                  {calcResult.riskClass.label}
                </p>
                <p className="mt-1 text-sm text-white/60">{calcResult.riskClass.description}</p>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[11px] leading-relaxed text-white/25">
            Indicatieve schatting op basis van de Dwight-formule en BRO bodemdata. Meet altijd ter plaatse na installatie conform NEN 3140.
          </p>
        </div>
      )}
    </div>
  );
}
