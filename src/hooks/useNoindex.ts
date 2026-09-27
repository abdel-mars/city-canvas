import { useEffect } from 'react';

const SELECTOR = 'meta[name="robots"]';
const NOINDEX = 'noindex, nofollow';

/**
 * Keep gift pages out of search results while leaving them shareable.
 *
 * Every distinct design produces a new `/gift` URL, so an indexable route would accumulate a large
 * population of near-identical pages sharing a template with one another.
 *
 * This meta tag is the only mechanism that actually prevents indexing. The `Disallow: /gift` in
 * `public/robots.txt` is a second layer, but it merely stops crawling — a blocked URL can still
 * surface from an external link, and a `noindex` is what keeps it out of the results.
 */
export function useNoindex() {
  useEffect(() => {
    let meta = document.head.querySelector<HTMLMetaElement>(SELECTOR);
    let created = false;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
      created = true;
    }
    const previous = meta.content;
    meta.content = NOINDEX;
    return () => {
      // Leave a tag we did not add alone, so this cannot clobber a real site's directives.
      if (created) meta?.remove();
      else if (meta) meta.content = previous;
    };
  }, []);
}
