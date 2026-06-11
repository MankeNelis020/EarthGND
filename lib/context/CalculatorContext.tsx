'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { BroResult } from '@/lib/bro';
import type { InstallationType, GridSystem } from '@/lib/calculations';

interface CalculatorContextValue {
  postcode: string;
  huisnummer: string;
  installationType: InstallationType | null;
  gridSystem: GridSystem | null;
  soilData: BroResult | null;
  soilLoading: boolean;
  soilError: string;
  setPostcode: (v: string) => void;
  setHuisnummer: (v: string) => void;
  setInstallationType: (v: InstallationType | null) => void;
  setGridSystem: (v: GridSystem | null) => void;
  setSoilData: (v: BroResult | null) => void;
  setSoilLoading: (v: boolean) => void;
  setSoilError: (v: string) => void;
  fetchSoilData: (postcode: string, huisnummer?: string) => Promise<void>;
}

const CalculatorContext = createContext<CalculatorContextValue | null>(null);

const STORAGE_KEY = 'earthgnd:calc';

interface PersistedState {
  postcode: string;
  huisnummer: string;
  installationType: InstallationType | null;
  gridSystem: GridSystem | null;
  soilData: BroResult | null;
}

function loadState(): PersistedState {
  if (typeof window === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {}
  return defaults();
}

function defaults(): PersistedState {
  return { postcode: '', huisnummer: '', installationType: null, gridSystem: null, soilData: null };
}

export function CalculatorProvider({ children }: { children: ReactNode }) {
  const [postcode, setPostcodeRaw] = useState('');
  const [huisnummer, setHuisnummerRaw] = useState('');
  const [installationType, setInstallationTypeRaw] = useState<InstallationType | null>(null);
  const [gridSystem, setGridSystemRaw] = useState<GridSystem | null>(null);
  const [soilData, setSoilDataRaw] = useState<BroResult | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadState();
    setPostcodeRaw(saved.postcode);
    setHuisnummerRaw(saved.huisnummer);
    setInstallationTypeRaw(saved.installationType);
    setGridSystemRaw(saved.gridSystem);
    setSoilDataRaw(saved.soilData);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const toSave: PersistedState = { postcode, huisnummer, installationType, gridSystem, soilData };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  }, [hydrated, postcode, huisnummer, installationType, gridSystem, soilData]);

  async function fetchSoilData(pc: string, hn?: string) {
    setSoilLoading(true);
    setSoilError('');
    try {
      const params = new URLSearchParams({ postcode: pc });
      if (hn) params.set('huisnummer', hn);
      const res = await fetch(`/api/bro?${params}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setSoilError(data.error ?? 'BRO ophalen mislukt');
        return;
      }
      setSoilDataRaw(data as BroResult);
    } catch {
      setSoilError('BRO ophalen mislukt');
    } finally {
      setSoilLoading(false);
    }
  }

  return (
    <CalculatorContext.Provider
      value={{
        postcode,
        huisnummer,
        installationType,
        gridSystem,
        soilData,
        soilLoading,
        soilError,
        setPostcode: setPostcodeRaw,
        setHuisnummer: setHuisnummerRaw,
        setInstallationType: setInstallationTypeRaw,
        setGridSystem: setGridSystemRaw,
        setSoilData: setSoilDataRaw,
        setSoilLoading,
        setSoilError,
        fetchSoilData,
      }}
    >
      {children}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  const ctx = useContext(CalculatorContext);
  if (!ctx) throw new Error('useCalculator must be used within CalculatorProvider');
  return ctx;
}
