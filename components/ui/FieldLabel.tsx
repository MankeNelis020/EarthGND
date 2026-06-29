/** Section / field label — typographic role `label`. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="type-label mb-2">{children}</p>;
}

/** Page-level norm / context line. */
export function PageMeta({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-caption mb-3 border-l-2 border-brand/35 pl-3 leading-relaxed">
      {children}
    </p>
  );
}
