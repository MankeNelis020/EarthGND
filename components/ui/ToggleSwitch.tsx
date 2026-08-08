'use client';

type ToggleSwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

/**
 * iOS / Apple Settings-style switch.
 * Capsule track + white knob; system green when on.
 */
export function ToggleSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={[
        'relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px]',
        'transition-colors duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8761A]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        checked ? 'bg-[#34C759]' : 'bg-[#39393D]',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'pointer-events-none block h-[27px] w-[27px] rounded-full bg-white',
          'shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.06)]',
          'transition-transform duration-200 ease-out',
          checked ? 'translate-x-[20px]' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}
