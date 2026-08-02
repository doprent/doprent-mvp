/**
 * Canonical product URL helpers.
 *
 * The hybrid slug format is: `<slug>-<tagCode>` e.g. `/product/rose-gown-DR1234`.
 * - `productPath` generates the canonical hybrid path from a product object.
 * - `parseProductParam` decodes the raw route segment (may be percent-encoded
 *   and may be legacy slug-only or the hybrid `slug-DR####` form).
 */

/**
 * Build the canonical product path for a product.
 * Result: `/product/<slug>-<tag_code>` e.g. `/product/rose-gown-DR1234`.
 */
export function productPath(p: { slug: string; tag_code: string }): string {
  return `/product/${p.slug}-${p.tag_code}`;
}

/**
 * Parse a raw product route param (the `[id]` segment from Next.js).
 *
 * Steps:
 * 1. Percent-decode (mirrors the decodeSlug pattern in shop/[slug]/page.tsx).
 * 2. Match a trailing tagCode suffix with regex `/-DR\d+$/i`.
 * 3. If matched: return `{ slug, tagCode }` where slug is the prefix before the
 *    suffix and tagCode is the captured code (uppercased for consistency).
 * 4. If no match: return `{ slug: decoded, tagCode: null }` (legacy slug-only
 *    links; the page component 301-redirects after resolving the product).
 */
export function parseProductParam(raw: string): { slug: string; tagCode: string | null } {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  const match = decoded.match(/-(?<code>DR\d+)$/i);
  if (match?.groups?.code) {
    const tagCode = match.groups.code.toUpperCase();
    const slug = decoded.slice(0, decoded.length - match[0].length);
    return { slug, tagCode };
  }

  return { slug: decoded, tagCode: null };
}
