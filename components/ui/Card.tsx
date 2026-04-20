import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'highlight';
}

export function Card({ variant = 'default', className = '', children, ...props }: CardProps) {
  const base = 'rounded-xl border p-6';
  const variants = {
    default: 'bg-white/5 border-white/10',
    highlight: 'bg-[#E8761A]/10 border-[#E8761A]/40',
  };
  return (
    <div className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
