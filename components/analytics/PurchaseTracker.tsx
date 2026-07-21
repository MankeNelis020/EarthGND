'use client';

import { useEffect } from 'react';
import { pushEvent } from '@/lib/analytics/gtm';
import { useLocale } from 'next-intl';

interface Props {
  type:   'credits' | 'plan' | string;
  plan?:  string;
  qty?:   string;
  amount: string;
}

export function PurchaseTracker({ type, plan, qty, amount }: Props) {
  const locale = useLocale() as 'nl' | 'en';

  useEffect(() => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;

    pushEvent(
      'purchase',
      {
        transaction_id: `stripe-${Date.now()}`,
        value,
        currency: 'EUR',
        purchase_type: type,
        ...(plan  ? { plan_key: plan }           : {}),
        ...(qty   ? { credit_qty: Number(qty) }  : {}),
      },
      locale,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // fire once on mount only

  return null;
}
