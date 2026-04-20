'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import {
  calcOhmAls,
  calcOhmNoAls,
  OhmAlsResult,
  OhmNoAlsResult,
} from '@/lib/calculations';

type Mode = 'als' | 'no-als';

function ResultRow({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-3 last:border-0">
      <span className="text-sm text-[#F5EFE6]/70">{label}</span>
      <span className="font-mono text-lg font-bold text-[#E8761A]">
        {value.toFixed(2)} {unit}
      </span>
    </div>
  );
}

export function OhmCalculator() {
  const t = useTranslations('ohm');

  const [mode, setMode] = useState<Mode>('als');

  // ALS inputs
  const [voltage, setVoltage] = useState('50');
  const [leakageCurrent, setLeakageCurrent] = useState('0.03');

  // No-ALS inputs
  const [nominalCurrent, setNominalCurrent] = useState('16');
  const [breakerType, setBreakerType] = useState<'B' | 'C'>('B');
  const [cableLength, setCableLength] = useState('25');
  const [crossSection, setCrossSection] = useState('2.5');

  // Report fields
  const [postcode, setPostcode] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const [alsResult, setAlsResult] = useState<OhmAlsResult | null>(null);
  const [noAlsResult, setNoAlsResult] = useState<OhmNoAlsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (mode === 'als') {
      if (!voltage || isNaN(Number(voltage))) newErrors.voltage = t('../../errors.required');
      if (!leakageCurrent || isNaN(Number(leakageCurrent)) || Number(leakageCurrent) <= 0)
        newErrors.leakageCurrent = t('../../errors.required');
    } else {
      if (!nominalCurrent || isNaN(Number(nominalCurrent))) newErrors.nominalCurrent = t('../../errors.required');
      if (!cableLength || isNaN(Number(cableLength))) newErrors.cableLength = t('../../errors.required');
      if (!crossSection || isNaN(Number(crossSection))) newErrors.crossSection = t('../../errors.required');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleCalculate() {
    if (!validate()) return;
    setLoading(true);

    try {
      if (mode === 'als') {
        setAlsResult(
          calcOhmAls({
            voltage: Number(voltage),
            leakageCurrent: Number(leakageCurrent),
          })
        );
        setNoAlsResult(null);
      } else {
        setNoAlsResult(
          calcOhmNoAls({
            nominalCurrent: Number(nominalCurrent),
            breakerType,
            cableLength: Number(cableLength),
            crossSection: Number(crossSection),
          })
        );
        setAlsResult(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReport() {
    if (!email || !(alsResult || noAlsResult)) return;
    setSending(true);
    try {
      const inputValues =
        mode === 'als'
          ? { [t('voltage')]: `${voltage} V`, [t('leakageCurrent')]: `${leakageCurrent} A` }
          : {
              [t('nominalCurrent')]: `${nominalCurrent} A`,
              [t('breakerType')]: breakerType,
              [t('cableLength')]: `${cableLength} m`,
              [t('crossSection')]: `${crossSection} mm²`,
            };

      const results =
        alsResult
          ? {
              [t('rTheoretical')]: `${alsResult.r_theoretical.toFixed(2)} Ω`,
              [t('rPractical')]: `${alsResult.r_practical.toFixed(2)} Ω`,
              [t('rRecommended')]: `${alsResult.r_recommended.toFixed(2)} Ω`,
            }
          : {
              [t('rPenMax')]: `${noAlsResult!.r_pen_max.toFixed(2)} Ω`,
              'Zs max': `${noAlsResult!.zs_max.toFixed(2)} Ω`,
              'R cable': `${noAlsResult!.r_cable.toFixed(4)} Ω`,
            };

      const pdfRes = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'ohm', inputValues, results }),
      });
      const { pdfUrl } = await pdfRes.json();

      await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: 'EarthGND — Ohm Calculator Rapport',
          pdfUrl: pdfUrl ?? '',
          tool: 'ohm',
          result: results,
        }),
      });

      await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'ohm', email, result: results, postcode }),
      });

      setReportSent(true);
    } finally {
      setSending(false);
    }
  }

  const hasResult = alsResult !== null || noAlsResult !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Input panel */}
      <Card>
        <div className="mb-6 flex rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => { setMode('als'); setAlsResult(null); setNoAlsResult(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'als' ? 'bg-[#E8761A] text-white' : 'text-[#F5EFE6]/60 hover:text-[#F5EFE6]'
            }`}
          >
            {t('hasAls')}
          </button>
          <button
            onClick={() => { setMode('no-als'); setAlsResult(null); setNoAlsResult(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'no-als' ? 'bg-[#E8761A] text-white' : 'text-[#F5EFE6]/60 hover:text-[#F5EFE6]'
            }`}
          >
            {t('noAls')}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {mode === 'als' ? (
            <>
              <Input
                label={t('voltage')}
                type="number"
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
                error={errors.voltage}
                placeholder="50"
              />
              <Input
                label={t('leakageCurrent')}
                type="number"
                step="0.001"
                value={leakageCurrent}
                onChange={(e) => setLeakageCurrent(e.target.value)}
                error={errors.leakageCurrent}
                placeholder="0.03"
              />
            </>
          ) : (
            <>
              <Input
                label={t('nominalCurrent')}
                type="number"
                value={nominalCurrent}
                onChange={(e) => setNominalCurrent(e.target.value)}
                error={errors.nominalCurrent}
                placeholder="16"
              />
              <Select
                label={t('breakerType')}
                value={breakerType}
                onChange={(e) => setBreakerType(e.target.value as 'B' | 'C')}
                options={[
                  { value: 'B', label: 'B (×5)' },
                  { value: 'C', label: 'C (×10)' },
                ]}
              />
              <Input
                label={t('cableLength')}
                type="number"
                value={cableLength}
                onChange={(e) => setCableLength(e.target.value)}
                error={errors.cableLength}
                placeholder="25"
              />
              <Input
                label={t('crossSection')}
                type="number"
                step="0.5"
                value={crossSection}
                onChange={(e) => setCrossSection(e.target.value)}
                error={errors.crossSection}
                placeholder="2.5"
              />
            </>
          )}

          <Button onClick={handleCalculate} loading={loading} className="mt-2 w-full">
            {loading ? t('calculating') : t('calculate')}
          </Button>
        </div>
      </Card>

      {/* Results panel */}
      <div className="flex flex-col gap-4">
        {hasResult ? (
          <Card variant="highlight">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#E8761A]">
              {t('result')}
            </h3>

            {alsResult && (
              <>
                <ResultRow label={t('rTheoretical')} value={alsResult.r_theoretical} unit="Ω" />
                <ResultRow label={t('rPractical')} value={alsResult.r_practical} unit="Ω" />
                <ResultRow label={t('rRecommended')} value={alsResult.r_recommended} unit="Ω" />
              </>
            )}

            {noAlsResult && (
              <>
                <ResultRow label="Zs max" value={noAlsResult.zs_max} unit="Ω" />
                <ResultRow label="Ia" value={noAlsResult.ia} unit="A" />
                <ResultRow label="R cable" value={noAlsResult.r_cable} unit="Ω" />
                <ResultRow label={t('rPenMax')} value={noAlsResult.r_pen_max} unit="Ω" />
                {noAlsResult.warning && (
                  <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                    <p className="text-sm text-amber-400">⚠ {t('warning')}</p>
                  </div>
                )}
              </>
            )}
          </Card>
        ) : (
          <Card className="flex items-center justify-center min-h-[200px]">
            <p className="text-[#F5EFE6]/30 text-sm">{t('result')} →</p>
          </Card>
        )}

        {/* Send report */}
        <Card>
          <div className="flex flex-col gap-3">
            <Input
              label={t('postcode')}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="1234AB"
            />
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
              disabled={!hasResult || !email || reportSent}
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
