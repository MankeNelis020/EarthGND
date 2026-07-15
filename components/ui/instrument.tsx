import { IconCheck } from '@/components/ui/icons';

/** Hero measurement — one primary number per result screen. */
export function HeroMetric({
  label,
  value,
  unit,
  context,
  pulseKey,
}: {
  label: string;
  value: string;
  unit: string;
  context?: string;
  /** Change to re-trigger value pulse animation */
  pulseKey?: string | number;
}) {
  return (
    <div className="surface-elevated p-gutter result-block">
      <p className="type-label mb-3">{label}</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          key={pulseKey}
          className="type-display text-brand animate-value-pulse motion-reduce:animate-none"
        >
          {value}
        </span>
        <span className="type-title text-muted">{unit}</span>
        {context && (
          <span className="type-value text-muted-faint">· {context}</span>
        )}
      </div>
    </div>
  );
}

/** Group related fields — whitespace, not heavy borders. */
export function InstrumentSection({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-section ${className}`}>
      {label && <p className="type-label mb-3">{label}</p>}
      {children}
    </section>
  );
}

export function InstrumentPanel({
  children,
  className = '',
  elevated = false,
}: {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return (
    <div className={`${elevated ? 'surface-elevated' : 'surface-panel'} p-gutter ${className}`}>
      {children}
    </div>
  );
}

/** Status with icon + label (colorblind-safe). */
export function StatusBanner({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'success' | 'warning' | 'danger';
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  const toneClass =
    tone === 'success' ? 'status-success' :
    tone === 'warning' ? 'status-warning' :
    'status-danger';

  return (
    <div className={`rounded-panel border p-4 ${toneClass}`}>
      <div className="mb-1 flex items-center gap-2">
        {icon ?? (tone === 'success' ? <IconCheck className="h-4 w-4" /> : null)}
        <p className="type-title">{title}</p>
      </div>
      {children && <div className="type-caption text-muted">{children}</div>}
    </div>
  );
}

export function ScenarioMetric({
  label,
  sublabel,
  value,
  unit,
  secondary,
  dimmed,
  highlight,
}: {
  label: string;
  sublabel: string;
  value: string;
  unit: string;
  secondary?: string;
  dimmed?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-panel border p-4 transition-opacity duration-normal ${
        dimmed
          ? 'border-border-subtle opacity-50'
          : highlight
          ? 'border-brand/30 bg-brand-subtle'
          : 'border-border bg-surface-1'
      }`}
    >
      <p className="type-label">{label}</p>
      <p className="type-caption mb-3">{sublabel}</p>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`font-condensed text-2xl font-bold tabular-nums ${highlight ? 'text-brand' : 'text-foreground'}`}>
          {value}
        </span>
        <span className="type-value text-muted">{unit}</span>
      </div>
      {secondary && (
        <p className="type-caption mt-2 tabular-nums">{secondary}</p>
      )}
    </div>
  );
}
