type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const toneBorder: Record<Tone, string> = {
  neutral: "border-white/25 text-white/55",
  brand:   "border-brand/50 text-brand",
  success: "border-emerald-500/40 text-emerald-400",
  warning: "border-amber-500/40 text-amber-400",
  danger:  "border-red-500/40 text-red-400",
};

/** Compact status tag — left accent bar, not a SaaS pill. */
export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center border-l-2 pl-2 text-[11px] font-medium leading-tight ${toneBorder[tone]}`}
    >
      {label}
    </span>
  );
}
