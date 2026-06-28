/** Section / field label — sentence case, no shouty uppercase tracking. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium text-white/50">
      {children}
    </p>
  );
}

/** Page-level norm / context line (replaces hero pill badges). */
export function PageMeta({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 border-l-2 border-brand/35 pl-3 text-xs font-medium leading-relaxed text-white/45">
      {children}
    </p>
  );
}
