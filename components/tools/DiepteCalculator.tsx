'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { calcDiepte, DiepteResult } from '@/lib/calculations';

interface BroSample {
  depth: number;
  lithoClass: number;
  rho: number;
}

function ResultRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-3 last:border-0">
      <span className="text-sm text-[#F5EFE6]/70">{label}</span>
      <span className="font-mono text-lg font-bold text-[#E8761A]">
        {value} {unit}
      </span>
    </div>
  );
}

export function DiepteCalculator() {
  const t = useTranslations('diepte');

  const [targetResistance, setTargetResistance] = useState('10');
  const [rodDiameter, setRodDiameter] = useState('0.016');
  const [groundwaterDepth, setGroundwaterDepth] = useState('3');
  const [ph, setPh] = useState('6.5');
  const [rho, setRho] = useState('125');
  const [postcode, setPostcode] = useState('');
  const [email, setEmail] = useState('');

  const [result, setResult] = useState<DiepteResult | null>(null);
  const [broSamples, setBroSamples] = useState<BroSample[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [broLoading, setBroLoading] = useState(false);
  const [broError, setBroError] = useState('');
  const [sending, setSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!targetResistance || isNaN(Number(targetResistance)) || Number(targetResistance) <= 0)
      newErrors.targetResistance = 'Required';
    if (!rodDiameter || isNaN(Number(rodDiameter)) || Number(rodDiameter) <= 0)
      newErrors.rodDiameter = 'Required';
    if (!groundwaterDepth || isNaN(Number(groundwaterDepth)))
      newErrors.groundwaterDepth = 'Required';
    if (!ph || isNaN(Number(ph))) newErrors.ph = 'Required';
    if (!rho || isNaN(Number(rho)) || Number(rho) <= 0) newErrors.rho = 'Required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleCalculate() {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = calcDiepte({
        rho: Number(rho),
        targetResistance: Number(targetResistance),
        rodDiameter: Number(rodDiameter),
        groundwaterDepth: Number(groundwaterDepth),
        ph: Number(ph),
      });
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadBro() {
    if (!postcode) return;
    setBroLoading(true);
    setBroError('');
    try {
      const res = await fetch(`/api/bro?postcode=${encodeURIComponent(postcode)}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setBroError(data.error ?? t('../../errors.broFailed'));
        return;
      }
      setBroSamples(data.samples);
      setRho(String(data.dominantRho));
    } catch {
      setBroError(t('../../errors.broFailed'));
    } finally {
      setBroLoading(false);
    }
  }

  async function handleSendReport() {
    if (!email || !result) return;
    setSending(true);
    try {
      const inputValues = {
        [t('targetResistance')]: `${targetResistance} Ω`,
        [t('rodDiameter')]: `${rodDiameter} m`,
        [t('groundwaterDepth')]: `${groundwaterDepth} m`,
        [t('ph')]: ph,
        [t('rho')]: `${rho} Ω·m`,
      };
      const results = {
        [t('result')]: `${result.depth} m`,
        [t('achievedResistance')]: `${result.achievedResistance} Ω`,
        [t('corrGroundwater')]: `×${result.correctionGroundwater}`,
        [t('corrPh')]: `×${result.correctionPh}`,
      };

      const pdfRes = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'diepte', inputValues, results }),
      });
      const { pdfUrl } = await pdfRes.json();

      await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: 'EarthGND — Diepte Calculator Rapport',
          pdfUrl: pdfUrl ?? '',
          tool: 'diepte',
          result: results,
        }),
      });

      await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'diepte', email, result: results, postcode }),
      });

      setReportSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Input panel */}
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-col gap-4">
            <Input
              label={t('targetResistance')}
              type="number"
              value={targetResistance}
              onChange={(e) => setTargetResistance(e.target.value)}
              error={errors.targetResistance}
              placeholder="10"
            />
            <Input
              label={t('rodDiameter')}
              type="number"
              step="0.001"
              value={rodDiameter}
              onChange={(e) => setRodDiameter(e.target.value)}
              error={errors.rodDiameter}
              placeholder="0.016"
            />
            <Input
              label={t('groundwaterDepth')}
              type="number"
              step="0.5"
              value={groundwaterDepth}
              onChange={(e) => setGroundwaterDepth(e.target.value)}
              error={errors.groundwaterDepth}
              placeholder="3"
            />
            <Input
              label={t('ph')}
              type="number"
              step="0.1"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              error={errors.ph}
              placeholder="6.5"
            />

            {/* BRO postcode lookup */}
            <div className="rounded-lg border border-white/10 p-4 flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-[#F5EFE6]/40">
                {t('broData')}
              </p>
              <div className="flex gap-2">
                <Input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder={t('postcode')}
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={handleLoadBro}
                  loading={broLoading}
                  className="shrink-0"
                >
                  {broLoading ? t('loading') : t('loadFromBro')}
                </Button>
              </div>
              {broError && <p className="text-xs text-red-400">{broError}</p>}
              {broSamples && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#F5EFE6]/40">
                        <th className="pb-1 text-left">{t('depth')}</th>
                        <th className="pb-1 text-left">{t('lithoClass')}</th>
                        <th className="pb-1 text-left">{t('rhoValue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {broSamples.map((s) => (
                        <tr key={s.depth} className="border-t border-white/5">
                          <td className="py-1 text-[#F5EFE6]/70">{s.depth} m</td>
                          <td className="py-1 text-[#F5EFE6]/70">{s.lithoClass}</td>
                          <td className="py-1 text-[#E8761A] font-mono">{s.rho} Ω·m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Input
              label={t('rho')}
              type="number"
              value={rho}
              onChange={(e) => setRho(e.target.value)}
              error={errors.rho}
              placeholder="125"
            />

            <Button onClick={handleCalculate} loading={loading} className="w-full">
              {loading ? t('calculating') : t('calculate')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Results + report */}
      <div className="flex flex-col gap-4">
        {result ? (
          <Card variant="highlight">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#E8761A]">
              {t('result')}
            </h3>
            <div className="mb-4 text-center">
              <span className="text-5xl font-black text-[#E8761A]">{result.depth}</span>
              <span className="ml-2 text-xl text-[#F5EFE6]/70">{t('meters')}</span>
            </div>
            <ResultRow label={t('achievedResistance')} value={result.achievedResistance} unit="Ω" />
            <div className="mt-2">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#F5EFE6]/40">
                {t('corrections')}
              </p>
              <ResultRow label={t('corrGroundwater')} value={`×${result.correctionGroundwater}`} />
              <ResultRow label={t('corrPh')} value={`×${result.correctionPh}`} />
            </div>
          </Card>
        ) : (
          <Card className="flex items-center justify-center min-h-[200px]">
            <p className="text-[#F5EFE6]/30 text-sm">{t('result')} →</p>
          </Card>
        )}

        <Card>
          <div className="flex flex-col gap-3">
            <Input
              label={t('email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@bedrijf.nl"
            />
            <Button
              variant="secondary"
              onClick={handleSendReport}
              loading={sending}
              disabled={!result || !email || reportSent}
              className="w-full"
            >
              {reportSent ? t('reportSent') : t('sendReport')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
