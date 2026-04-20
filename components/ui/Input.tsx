'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[#F5EFE6]/80"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`rounded-lg border bg-white/5 px-4 py-3 text-[#F5EFE6] placeholder-[#F5EFE6]/30 text-base transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8761A] ${
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-white/10 hover:border-white/20'
          } ${className}`}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-[#F5EFE6]/40">{hint}</p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
