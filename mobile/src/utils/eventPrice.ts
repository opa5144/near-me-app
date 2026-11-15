import type { EventItem } from '../data/events';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Amounts used in calculations come from the API's numeric field, never a label.
export function eventPriceAmount(event: Pick<EventItem, 'priceAmount'>): number | null {
  return typeof event.priceAmount === 'number' && Number.isFinite(event.priceAmount) && event.priceAmount >= 0
    ? event.priceAmount : null;
}

export function formatCurrency(amount: number): string {
  return dollars.format(amount);
}

export function formatEventPrice(event: Pick<EventItem, 'price' | 'priceAmount'>): string {
  const amount = eventPriceAmount(event);
  // Older copies can still display the server's complete currency label.
  if (amount === null) return event.price || 'Unavailable';
  return amount === 0 ? 'Free' : formatCurrency(amount);
}

// Keep arithmetic in cents. A registration count is only an estimate of revenue,
// not a payment record; an unavailable amount must not be silently treated as free.
export function estimatedRevenueCents(event: Pick<EventItem, 'priceAmount'>, attending: number): number | null {
  const amount = eventPriceAmount(event);
  if (amount === null || !Number.isSafeInteger(attending) || attending < 0) return null;
  const cents = Math.round(amount * 100) * attending;
  return Number.isSafeInteger(cents) ? cents : null;
}
