import type { AdviceResult } from '@/api/types';

type Verdict = NonNullable<AdviceResult['plan']>['verdict'];

export const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  go: { label: 'Launch it', tone: 'bg-support-soft text-support' },
  go_with_changes: { label: 'Launch after a few changes', tone: 'bg-[#fbf0dc] text-[#8a5a12]' },
  rethink: { label: 'Not yet: rethink first', tone: 'bg-brand-soft text-brand' },
};

export const EFFORT: Record<'small' | 'medium' | 'large', string> = { small: 'A day or two', medium: 'About a week', large: 'A few weeks' };

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };
export function money(n: number | null | undefined, currency: string): string {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'Free';
  const s = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
  return `${SYMBOL[currency] ?? `${currency} `}${s}`;
}
