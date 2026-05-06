import React from 'react';

const FASE_KLEUREN = {
  'Pre-op': { bg: '#1e293b', color: '#94a3b8', border: '#334155' },
  'Fase 1': { bg: '#451a03', color: '#fb923c', border: '#78350f' },
  'Fase 2': { bg: '#431407', color: '#f97316', border: '#7c2d12' },
  'Fase 3': { bg: '#1e3a5f', color: '#3b82f6', border: '#1d4ed8' },
  'Fase 4': { bg: '#2e1065', color: '#8b5cf6', border: '#5b21b6' },
  'Teruggekeerd': { bg: '#064e3b', color: '#00d4aa', border: '#065f46' }
};

export default function PhaseBadge({ fase, size = 'md' }) {
  const kleuren = FASE_KLEUREN[fase] || FASE_KLEUREN['Pre-op'];
  const padding = size === 'lg' ? '6px 14px' : '3px 10px';
  const fontSize = size === 'lg' ? '0.85rem' : '0.75rem';

  return (
    <span style={{
      display: 'inline-block',
      padding,
      borderRadius: '20px',
      fontSize,
      fontWeight: 600,
      letterSpacing: '0.3px',
      background: kleuren.bg,
      color: kleuren.color,
      border: `1px solid ${kleuren.border}`
    }}>
      {fase || 'Onbekend'}
    </span>
  );
}
