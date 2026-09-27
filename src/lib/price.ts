/**
 * Pricing shape shared by `api/printify-pricing.ts` and the gift page.
 *
 * Prices are cents in the shop's own currency. The currency is carried alongside the numbers
 * rather than assumed, because nothing in the repo previously pinned it and a hardcoded symbol
 * would silently misprice the storefront.
 */
export interface PosterVariant {
  id: number;
  /** Raw Printify variant title, e.g. `16″ x 16″ / Matte`. */
  title: string;
  /** Square side length in inches. The artwork is 1:1, so only square sizes are sold. */
  inches: number;
  priceCents: number;
}

export interface PosterPricing {
  currency: string;
  variants: PosterVariant[];
}

/**
 * Format cents for display, degrading rather than throwing.
 *
 * The currency arrives over the API, and `Intl` throws a RangeError on a malformed code — which
 * would take down the one element the gift page exists to show.
 */
export function formatPrice(cents: number, currency = 'USD'): string {
  if (!Number.isFinite(cents)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}
