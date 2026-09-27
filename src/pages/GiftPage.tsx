import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import ArtworkCanvas from '@/components/ArtworkCanvas';
import { ThemeToggle } from '@/components/ThemeToggle';
import { decodeGiftParams } from '@/lib/giftParams';
import { designHash } from '@/lib/designHash';
import { formatPrice, type PosterVariant } from '@/lib/price';
import { generateArtworkBase64 } from '@/lib/download';
import { useRoadData } from '@/hooks/useRoadData';
import { useNoindex } from '@/hooks/useNoindex';
import { useTheme } from '@/hooks/useTheme';
import logoUrl from '@/assets/casanobg.png';

/**
 * A single design, presented rather than sold.
 *
 * The artwork in the URL is rendered by the same component, from the same roads, as the creator
 * saw — so this is the poster, not a mockup. Everything after the single call to action belongs
 * to Printify: variants, payment, tax, shipping. Sizes are listed as a caption and deliberately
 * not offered as controls, because there is no way to carry a variant choice through to their
 * checkout and a dead selector would be a small lie.
 */

type Phase = 'idle' | 'preparing';

const PREPARE_ATTEMPTS = 4;
const PREPARE_RETRY_MS = 2500;
/** The city name fades in at 0.6s and settles at 1.4s; wait it out so the export is complete. */
const ARTWORK_SETTLE_MS = 1600;

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.6, ease: 'easeOut' as const },
});

/**
 * Fill the pre-opened tab while Printify creates the product.
 *
 * `about:blank` inherits the opener's origin, so this document is ours to write to. Without it the
 * buyer stares at a blank white tab for the 5-15s the upload, create, publish and poll take, which
 * reads as a crash rather than a wait.
 */
function showPreparing(tab: Window) {
  const doc = tab.document;
  doc.title = 'Preparing your poster…';
  doc.body.style.cssText =
    'margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#f4f4f5;' +
    'font:15px/1.6 "DM Sans",system-ui,sans-serif;text-align:center;padding:2rem';
  doc.body.innerHTML =
    '<div><p style="font-family:Georgia,serif;font-size:30px;margin:0 0 10px">Preparing your poster…</p>' +
    '<p style="opacity:.6;margin:0">Creating your print on Printify</p></div>';
}

const GiftPage = () => {
  const [params] = useSearchParams();
  useNoindex();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const decoded = useMemo(() => decodeGiftParams(params), [params]);
  const { city, settings } = decoded.ok ? decoded.design : { city: null, settings: null };

  const { roads, isLoading, loadRoads } = useRoadData();
  const svgRef = useRef<SVGSVGElement>(null);

  const [variants, setVariants] = useState<PosterVariant[] | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [settled, setSettled] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);

  // Roads, then the artwork's own fade-in. Gating the CTA on `settled` keeps the export from
  // capturing a half-faded city name.
  useEffect(() => {
    if (!city) return;
    void loadRoads(city);
  }, [city, loadRoads]);

  useEffect(() => {
    if (!city || isLoading || roads.length === 0) return;
    const t = setTimeout(() => setSettled(true), ARTWORK_SETTLE_MS);
    return () => clearTimeout(t);
  }, [city, isLoading, roads.length]);

  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    fetch('/api/printify-pricing')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { currency?: string; variants?: PosterVariant[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.variants) && data.variants.length > 0) {
          setVariants(data.variants);
          setCurrency(data.currency ?? 'USD');
        }
      })
      .catch((err) => console.error('pricing unavailable:', err));
    return () => {
      cancelled = true;
    };
  }, [city]);

  // Mobile sticky bar appears only once the in-flow button has left the viewport.
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setShowSticky(!entry.isIntersecting), {
      rootMargin: '-72px 0px 0px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const openPurchase = useCallback(async () => {
    if (!city || !settings || !svgRef.current || phase !== 'idle') return;

    /**
     * Opened as the first statement, while the click is still the gesture. A `window.open` after
     * the awaits below would be blocked as a popup and the button would appear to do nothing.
     * The tab is written to and navigated only once Printify has answered.
     */
    const tab = window.open('', '_blank');
    const closeTab = () => tab?.close();
    if (tab) showPreparing(tab);

    setPhase('preparing');
    setError(null);
    const fail = (message: string) => {
      closeTab();
      setError(message);
      setPhase('idle');
    };

    try {
      const payload = {
        image_base64: await generateArtworkBase64(svgRef.current, 5),
        city_name: city.name,
        design_hash: designHash(city.name, settings),
      };

      let url: string | null = null;
      for (let attempt = 0; attempt < PREPARE_ATTEMPTS && !url; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, PREPARE_RETRY_MS));
        const res = await fetch('/api/create-printify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          url = data?.product_url ?? null;
          // The create path re-derives prices from the same harvested costs as this page, so
          // prefer them: never show a figure Printify's checkout is about to contradict.
          if (Array.isArray(data?.variants) && data.variants.length > 0) {
            setVariants(data.variants);
            if (data.currency) setCurrency(data.currency);
          }
          if (!url) {
            fail('We could not open the Printify page for this poster. Please try again.');
            return;
          }
        } else if (res.status === 202) {
          // The storefront has not returned a URL yet. Keyed on the design hash, so a retry
          // only re-polls the product it already made.
          continue;
        } else if (res.status === 429) {
          const data = await res.json().catch(() => null);
          const mins = data?.retry_after ? Math.ceil(data.retry_after / 60) : null;
          fail(
            mins
              ? `You have made a few posters already. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
              : 'Too many posters requested. Please try again later.',
          );
          return;
        } else if (res.status === 404) {
          fail('Printing is unavailable right now. Please try again later.');
          return;
        } else {
          fail('Something went wrong preparing your poster. Please try again.');
          return;
        }
      }

      if (!url) {
        fail('Your poster is still being prepared. Please try again in a moment.');
        return;
      }

      if (tab) {
        tab.location.href = url;
      } else {
        // No tab means the popup was blocked; fall back so the click still completes the sale.
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      console.error('gift purchase failed:', e);
      closeTab();
      setError('Something went wrong. Please try again.');
      setPhase('idle');
    }
  }, [city, settings, phase]);

  // A rejected link cannot be repaired, so never render a page of the wrong poster.
  if (!decoded.ok || !city || !settings) return <Navigate to="/" replace />;

  const posterLabel = `Road network map of ${settings.showCustomName && settings.customName ? settings.customName : city.name}, ${settings.preset.name} palette`;
  const ready = settled && phase !== 'preparing';

  const sizes = variants;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a
          href="/"
          className="flex items-center gap-2 shrink-0"
          aria-label="City Lines — design your own city map"
        >
          <div
            className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl overflow-hidden flex items-center justify-center border shrink-0 ${
              isDark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200 bg-zinc-100'
            }`}
          >
            <img
              src={logoUrl}
              alt=""
              className="h-full w-full object-contain scale-[2.2]"
              style={{ filter: isDark ? 'brightness(0) invert(1)' : 'none' }}
            />
          </div>
          <span className="hidden sm:block font-display text-base sm:text-lg font-bold tracking-tight">
            City Lines
          </span>
        </a>
        <ThemeToggle />
      </header>

      <main className="flex flex-col items-center px-4 sm:px-6 text-center">
        <motion.p
          {...fade(0.15)}
          className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] font-medium text-muted-foreground"
        >
          A City Lines Art poster
        </motion.p>

        <motion.div {...fade(0.3)} className="gift-art mt-6 sm:mt-8 w-screen sm:w-auto">
          <ArtworkCanvas
            ref={svgRef}
            city={city}
            roads={roads}
            settings={settings}
            isLoading={isLoading}
            size="var(--gift-art-size)"
            frame
            label={posterLabel}
          />
        </motion.div>

        <motion.h1 {...fade(0.5)} className="mt-10 sm:mt-16 font-display text-4xl sm:text-[3.5rem] leading-none">
          {city.name}
        </motion.h1>

        <motion.p {...fade(0.6)} className="mt-2 text-sm sm:text-[15px] text-muted-foreground">
          {settings.preset.name} · Matte poster paper
        </motion.p>

        <motion.div {...fade(0.75)} className="mt-10 sm:mt-16 w-full max-w-3xl">
          <div className="border-y border-border" />

          {sizes === null ? (
            // Two bars mirroring the loaded row's dt + dd stack, so the placeholder is the same
            // height as the real content and prices arriving moves nothing below it.
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {[0, 1, 2].map((i) => (
                <div key={i} className="py-4 sm:px-6">
                  <div className="h-[1.25rem] w-20 mx-auto rounded bg-muted animate-pulse-soft" />
                  <div className="mt-0.5 h-[1.25rem] w-14 mx-auto rounded bg-muted/70 animate-pulse-soft" />
                </div>
              ))}
            </div>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {sizes.map((v) => (
                <div key={v.id} className="py-4 sm:px-6">
                  <dt className="text-sm text-foreground">
                    {v.inches} × {v.inches}″
                  </dt>
                  <dd className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                    {formatPrice(v.priceCents, currency)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="border-y border-border" />
        </motion.div>

        <motion.div ref={ctaRef} {...fade(0.9)} className="mt-8 sm:mt-12">
          <button
            type="button"
            onClick={() => void openPurchase()}
            disabled={!ready}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {phase === 'preparing' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing your poster…
              </>
            ) : (
              <>
                Complete purchase on Printify
                <ArrowUpRight className="h-4 w-4" />
              </>
            )}
          </button>
        </motion.div>

        <motion.p {...fade(1)} className="mt-4 text-[13px] text-muted-foreground max-w-sm">
          Opens on Printify, where checkout, printing and shipping are handled.
        </motion.p>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="alert"
            className="mt-4 text-[13px] text-destructive max-w-sm"
          >
            {error}
          </motion.p>
        )}
      </main>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-24 pb-10">
        <div className="border-t border-border" />
      </div>

      {/* Mobile: keep the action reachable once the in-flow button has scrolled away. */}
      {showSticky && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-md px-4 py-3 sm:hidden">
          <button
            type="button"
            onClick={() => void openPurchase()}
            disabled={!ready}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {phase === 'preparing' ? 'Preparing…' : 'Complete purchase'}
            {phase !== 'preparing' && <ArrowUpRight className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default GiftPage;
