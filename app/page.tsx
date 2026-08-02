import Link from "next/link";
import { Suspense } from "react";
import ProductResults from "@/components/ProductResults";
import ScrollToResults from "@/components/ScrollToResults";
import BrowseFilters from "@/components/BrowseFilters";
import BannerCarousel from "@/components/BannerCarousel";
import type { BannerSlide } from "@/components/BannerCarousel";
import SortSelect from "@/components/SortSelect";
import MobileFilterDrawer from "@/components/MobileFilterDrawer";
import ResultsBarLocation from "@/components/ResultsBarLocation";
import { OccasionTile } from "@/components/ProductArt";
import {
  listDesigners,
  listProducts,
  listOccasions,
  listSponsorShops,
  listShops,
} from "@/lib/products";
import { getCurrentUser } from "@/lib/auth";
import { getActiveBanners } from "@/lib/banners";
import { getTagGroupsForProductTypeKey } from "@/lib/tag-groups";
import {
  type OccasionKey,
  SIZES,
} from "@/lib/types";
import { t } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://doprent.com";
const PRICE_BOUNDS = { min: 0, max: 10000 };

type SearchParams = {
  color?: string;
  occasion?: string;
  size?: string;
  designer?: string;
  q?: string;
  sort?: string;
  dateFrom?: string;
  dateTo?: string;
  priceMin?: string;
  priceMax?: string;
  type?: string;
  [key: string]: string | undefined;
};

/** Active product type keys. */
const KNOWN_TYPE_KEYS = ["dress", "suit"] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Determine active product type (validate; default "dress")
  const rawType = searchParams?.type?.trim();
  const activeTypeKey: string = rawType && (KNOWN_TYPE_KEYS as readonly string[]).includes(rawType) ? rawType : "dress";

  const activeOcc = searchParams?.occasion as OccasionKey | undefined;
  const activeSize = searchParams?.size;
  const activeDesigner = searchParams?.designer?.trim() || undefined;
  const search = searchParams?.q?.trim() ?? "";
  const activeDateFrom = searchParams?.dateFrom?.trim() || undefined;
  const activeDateTo = searchParams?.dateTo?.trim() || undefined;
  const activePriceMin = Number(searchParams?.priceMin) || PRICE_BOUNDS.min;
  const activePriceMax = Number(searchParams?.priceMax) || PRICE_BOUNDS.max;
  const activeBustMin = Number(searchParams?.bustMin) || undefined;
  const activeBustMax = Number(searchParams?.bustMax) || undefined;
  const activeWaistMin = Number(searchParams?.waistMin) || undefined;
  const activeWaistMax = Number(searchParams?.waistMax) || undefined;
  const activeLengthMin = Number(searchParams?.lengthMin) || undefined;
  const activeLengthMax = Number(searchParams?.lengthMax) || undefined;
  const sort = (searchParams?.sort ?? "featured") as
    | "featured"
    | "price-asc"
    | "price-desc"
    | "name"
    | "rating-desc";

  const activeOpenOnly = searchParams?.openOnly === "1";

  const KNOWN_FILTER_PARAMS = new Set([
    "occasion", "size", "designer", "q", "sort",
    "dateFrom", "dateTo", "priceMin", "priceMax", "page", "type",
    "bustMin", "bustMax", "waistMin", "waistMax", "lengthMin", "lengthMax",
    "openOnly",
  ]);

  // Build tagsByGroup from URL params (all params not in the known list)
  const tagsByGroup: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(searchParams ?? {})) {
    if (!KNOWN_FILTER_PARAMS.has(key) && val) {
      tagsByGroup[key] = val.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  // Backward compat: occasion URL param → tagsByGroup.occasion
  if (activeOcc) {
    const prev = tagsByGroup.occasion ?? [];
    tagsByGroup.occasion = [...new Set([...prev, activeOcc])];
  }

  const locale = getServerLocale();

  const [{ items: products, total, hasMore }, occasions, designers, user, sponsors, shops, dbBanners, { groups: tagGroups }] = await Promise.all([
    listProducts({
      tagsByGroup: Object.keys(tagsByGroup).length > 0 ? tagsByGroup : undefined,
      sizes: activeSize ? [activeSize] : undefined,
      designers: activeDesigner ? [activeDesigner] : undefined,
      priceMin: activePriceMin > PRICE_BOUNDS.min ? activePriceMin : undefined,
      priceMax: activePriceMax < PRICE_BOUNDS.max ? activePriceMax : undefined,
      bustMin: activeBustMin,
      bustMax: activeBustMax,
      waistMin: activeWaistMin,
      waistMax: activeWaistMax,
      lengthMin: activeLengthMin,
      lengthMax: activeLengthMax,
      search: search || undefined,
      sort,
      dateFrom: activeDateFrom,
      dateTo: activeDateTo,
      productTypeKey: activeTypeKey,
      openOnly: activeOpenOnly || undefined,
    }),
    listOccasions(),
    listDesigners(),
    getCurrentUser().catch(() => null),
    listSponsorShops(8),
    listShops({ featuredFirst: true, limit: 6 }),
    getActiveBanners(),
    getTagGroupsForProductTypeKey(activeTypeKey),
  ]);

  // Build activeTags from bound tag groups (for filter UI)
  const activeTags: Record<string, string[]> = {};
  for (const group of tagGroups) {
    const raw = (searchParams ?? {})[group.groupKey];
    if (raw) {
      const vals = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (vals.length > 0) activeTags[group.groupKey] = vals;
    }
  }
  // Merge in occasion backward-compat
  if (activeOcc) {
    activeTags.occasion = [...new Set([...(activeTags.occasion ?? []), activeOcc])];
  }

  // Serialize active tag groups back to string params for ProductResults infinite scroll
  const tagParamsForResults: Record<string, string | undefined> = {};
  for (const [groupKey, tagKeys] of Object.entries(tagsByGroup)) {
    if (tagKeys.length > 0) tagParamsForResults[groupKey] = tagKeys.join(",");
  }

  const savedSet = new Set<string>(user?.savedProductIds ?? []);
  const isLoggedIn = !!user;
  const bannerShops = sponsors.length > 0 ? sponsors : shops;
  const bannerSlides: BannerSlide[] = dbBanners.map((b) => ({
    id: b.id,
    title: b.title,
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl,
  }));

  // Locale-aware labels for filter chips
  const occasionOptions = occasions.map((o) => ({
    value: o.key,
    label: locale === "en" ? t(`occasion.${o.key}`, "en") : o.th,
  }));
  const sizeOptions = SIZES.map((sz) => ({ value: sz, label: sz }));
  const designerOptions = designers.map((d) => ({ value: d, label: d }));

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "DopRent",
    url: SITE,
    description:
      "Boutique dress rental marketplace in Bangkok. Browse curated designer pieces and book directly via LINE.",
    areaServed: { "@type": "City", name: "Bangkok" },
  };

  return (
    <div className="home-revamp">
      <Suspense fallback={null}>
        <ScrollToResults />
      </Suspense>

      {/* ======== BANNER CAROUSEL ======== */}
      {/* แสดงเมื่อมี DB banner หรือมีร้านให้ทำสไลด์ fallback (BannerCarousel จัดการ fallback เอง) */}
      {(dbBanners.length > 0 || bannerShops.length > 0) && (
        <section className="bg-bg pt-6">
          <div className="container">
            <BannerCarousel shops={bannerShops} slides={bannerSlides} locale={locale} />
          </div>
        </section>
      )}

      {/* ======== OCCASIONS ROW ======== */}
      {occasions.length > 0 && (
        <section className="hr-occasions">
          <div className="container">
            <div className="hr-occ-head">
              <h2 className="hr-occ-title">{t("browse.byOccasion", locale)}</h2>
              <Link
                href={activeTypeKey !== "dress" ? `/?type=${activeTypeKey}` : "/"}
                className="hr-occ-more"
              >
                {t("browse.viewAll", locale)}
              </Link>
            </div>
            <div className="hr-occ-row">
              {/* "ทั้งหมด" — default-active when no occasion is selected. The
                  #results hash makes it scroll to the product zone (it clears all
                  query params, so ScrollToResults relies on the hash here). */}
              <Link
                href={activeTypeKey !== "dress" ? `/?type=${activeTypeKey}#results` : "/#results"}
                className="hr-occ-chip media-zoom"
                data-active={!activeOcc ? "true" : undefined}
              >
                <span className="hr-occ-tile">
                  <OccasionTile color="green" />
                </span>
                <span className="hr-occ-label">{locale === "en" ? "All" : "ทั้งหมด"}</span>
              </Link>
              {occasions.map((o) => {
                const label = locale === "en" ? t(`occasion.${o.key}`, "en") : o.th;
                const occasionHref = activeTypeKey !== "dress"
                  ? `/?occasion=${o.key}&type=${activeTypeKey}`
                  : `/?occasion=${o.key}`;
                return (
                  <Link
                    key={o.key}
                    href={occasionHref}
                    className="hr-occ-chip media-zoom"
                    data-active={activeOcc === o.key ? "true" : undefined}
                  >
                    <span className="hr-occ-tile">
                      {o.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={o.image_url}
                          alt={label}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "inherit" }}
                        />
                      ) : (
                        <OccasionTile color={o.color_token} />
                      )}
                    </span>
                    <span className="hr-occ-label">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ======== BROWSE (FILTERS + RESULTS) ======== */}
      <section id="results" className="hr-browse" style={{ scrollMarginTop: 0 }}>
        <div className="container">
          <div className="browse-grid">
            {/* SIDEBAR — hidden on mobile, sticky on desktop */}
            <aside className="hidden md:block sticky top-[15px] self-start max-h-[calc(100vh-135px)] overflow-y-auto overscroll-contain text-sm filter-sidebar pl-1.5 pr-[15px] py-1">
              <BrowseFilters
                q={search}
                occasion={activeOcc ?? null}
                size={activeSize ?? null}
                designer={activeDesigner ?? null}
                priceMin={activePriceMin}
                priceMax={activePriceMax}
                priceBounds={PRICE_BOUNDS}
                occasions={occasionOptions}
                sizes={sizeOptions}
                designers={designerOptions}
                locale={locale}
                tagGroups={tagGroups}
                activeTags={activeTags}
                bustMin={activeBustMin}
                bustMax={activeBustMax}
                waistMin={activeWaistMin}
                waistMax={activeWaistMax}
                lengthMin={activeLengthMin}
                lengthMax={activeLengthMax}
                openOnly={activeOpenOnly}
              />
            </aside>

            {/* MAIN */}
            <main>
              <div className="hr-results-bar">
                {/* Location — desktop: inline controls; mobile: pin toggle + expandable panel */}
                <ResultsBarLocation locale={locale} />

                {/* Count + sort group, pinned to the right */}
                <div className="hr-results-bar__right">
                  {/* Mobile filter trigger + count */}
                  <div className="flex items-center gap-2">
                    <MobileFilterDrawer
                      q={search}
                      occasion={activeOcc ?? null}
                      size={activeSize ?? null}
                      designer={activeDesigner ?? null}
                      priceMin={activePriceMin}
                      priceMax={activePriceMax}
                      priceBounds={PRICE_BOUNDS}
                      occasions={occasionOptions}
                      sizes={sizeOptions}
                      designers={designerOptions}
                      locale={locale}
                      tagGroups={tagGroups}
                      activeTags={activeTags}
                      bustMin={activeBustMin}
                      bustMax={activeBustMax}
                      waistMin={activeWaistMin}
                      waistMax={activeWaistMax}
                      lengthMin={activeLengthMin}
                      lengthMax={activeLengthMax}
                      openOnly={activeOpenOnly}
                    />
                    <div className="text-sm text-[var(--ink-2)] whitespace-nowrap">
                      {t("results.found", locale)}{" "}
                      <b className="text-[var(--ink)]">{total}</b>{" "}
                      {t("results.items", locale)}
                    </div>
                  </div>
                  <SortSelect locale={locale} />
                </div>
              </div>

              {products.length === 0 ? (
                <div className="hr-empty">
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                    {t("empty.title", locale)}
                  </h3>
                  <p style={{ fontSize: 14, marginBottom: 18 }}>
                    {t("empty.description", locale)}
                  </p>
                  <Link href="/" className="btn btn-outline">
                    {t("empty.clearAll", locale)}
                  </Link>
                </div>
              ) : (
                <ProductResults
                  key={JSON.stringify(searchParams)}
                  products={products}
                  savedIds={[...savedSet]}
                  isLoggedIn={isLoggedIn}
                  total={total}
                  hasMore={hasMore}
                  locale={locale}
                  searchParams={{
                    q: search || undefined,
                    size: activeSize,
                    designer: activeDesigner,
                    sort: sort === "featured" ? undefined : sort,
                    dateFrom: activeDateFrom,
                    dateTo: activeDateTo,
                    priceMin: activePriceMin > PRICE_BOUNDS.min ? String(activePriceMin) : undefined,
                    priceMax: activePriceMax < PRICE_BOUNDS.max ? String(activePriceMax) : undefined,
                    bustMin: activeBustMin !== undefined ? String(activeBustMin) : undefined,
                    bustMax: activeBustMax !== undefined ? String(activeBustMax) : undefined,
                    waistMin: activeWaistMin !== undefined ? String(activeWaistMin) : undefined,
                    waistMax: activeWaistMax !== undefined ? String(activeWaistMax) : undefined,
                    lengthMin: activeLengthMin !== undefined ? String(activeLengthMin) : undefined,
                    lengthMax: activeLengthMax !== undefined ? String(activeLengthMax) : undefined,
                    // Preserve type for infinite scroll (omit when default dress to keep URLs clean)
                    type: activeTypeKey !== "dress" ? activeTypeKey : undefined,
                    openOnly: activeOpenOnly ? "1" : undefined,
                    ...tagParamsForResults,
                  }}
                />
              )}
            </main>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: HR_CSS }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />
    </div>
  );
}

const HR_CSS = `
/* ---- Occasions row ---- */
.hr-occasions{
  padding:22px 0 8px;
  border-bottom:1px solid var(--line);
  background:var(--bg);
}
.hr-occ-head{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:14px;gap:12px;
}
.hr-occ-title{font-size:16px;font-weight:600;margin:0;letter-spacing:-0.01em}
.hr-occ-more{font-size:13px;color:var(--cobalt);white-space:nowrap;text-decoration:none}
.hr-occ-more:hover{text-decoration:underline}

.hr-occ-row{
  display:flex;gap:10px;
  overflow-x:auto;scrollbar-width:none;
  /* horizontal + top padding so the active chip outline (offset 2px) isn't
     clipped by the scroll container's edges */
  padding:5px 6px 14px;
}
.hr-occ-row::-webkit-scrollbar{display:none}

.hr-occ-chip{
  display:flex;flex-direction:column;align-items:center;gap:7px;
  flex-shrink:0;cursor:pointer;text-decoration:none;
  transition:opacity .18s var(--ease);
  outline:none;
}
.hr-occ-chip:hover{opacity:.85}
.hr-occ-chip[data-active="true"] .hr-occ-tile{
  outline:2.5px solid var(--accent);outline-offset:2px;
}
.hr-occ-tile{
  width:68px;height:54px;border-radius:10px;overflow:hidden;flex-shrink:0;
  box-shadow:var(--shadow-1);
}
@media(min-width:480px){.hr-occ-tile{width:80px;height:64px}}
.hr-occ-label{
  font-size:12px;font-weight:500;color:var(--ink-2);
  text-align:center;white-space:nowrap;max-width:80px;
  overflow:hidden;text-overflow:ellipsis;
}

/* ---- Browse section ---- */
.hr-browse{
  padding:28px 0 80px;
  background:var(--bg);
}

/* Results bar — sticky to the top of the #main scroll container.
   Scrolling happens inside #main (layout.tsx: overflowY:auto) and the navbar is
   a flex SIBLING above #main — not a window-fixed bar. So the correct sticky
   offset is 0 (top of the scrollport = directly under the navbar). Using
   --header-h here pushed it that many px DOWN into the content = floated
   mid-screen and covered products. */
.hr-results-bar{
  display:flex;align-items:center;
  margin-bottom:16px;flex-wrap:wrap;gap:8px 12px;
  position:sticky;top:0;z-index:20;
  background:var(--bg);
  padding:10px 0;
  border-bottom:1px solid var(--line);
}
/* Right cluster: count + sort — shrinks but won't break */
.hr-results-bar__right{
  display:flex;align-items:center;gap:8px;
  margin-left:auto;flex-shrink:0;flex-wrap:wrap;
}

/* Location: desktop = inline controls (wrapper is transparent), toggle hidden.
   Mobile rules live in the max-width:767px block below. */
.loc-toggle{display:none}
.loc-panel{display:contents}

/* Empty state */
.hr-empty{
  padding:60px 20px;text-align:center;
  color:var(--ink-3);
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:8px;
}

/* ---- Filter sidebar scrollbar ---- */
.filter-sidebar{
  scrollbar-width:thin;
  scrollbar-color:var(--line) transparent;
}
.filter-sidebar::-webkit-scrollbar{width:4px}
.filter-sidebar::-webkit-scrollbar-track{background:transparent}
.filter-sidebar::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.filter-sidebar::-webkit-scrollbar-thumb:hover{background:var(--ink-3)}


/* ---- Responsive ---- */
@media(max-width:600px){
  .hr-occasions{padding:18px 0 0}
}
/* Mobile: tighten the gap above the results bar, and when it wraps into
   2 rows make EACH row span the full width with space-between within itself
   (host directive). */
@media(max-width:767px){
  .hr-browse{padding-top:12px}
  .hr-results-bar{padding:8px 0;gap:8px;margin-bottom:12px;align-items:center}
  /* Single row: [pin] + [Filter · count · sort]. Location panel expands full-width below. */
  .loc-toggle{
    display:inline-flex;align-items:center;gap:3px;order:0;flex:0 0 auto;
    height:34px;padding:0 8px;border:1px solid var(--line);border-radius:8px;
    background:var(--bg);color:var(--accent-2);cursor:pointer;
  }
  /* icon-only on mobile to guarantee the single row fits; label shows once expanded */
  .loc-toggle__text{display:none}
  .hr-results-bar__right{
    order:1;flex:1 1 auto;width:auto;margin-left:0;justify-content:space-between;
    flex-wrap:nowrap;gap:6px;min-width:0;
  }
  /* Expandable location panel — hidden until toggled, then full-width row below */
  .loc-panel{display:none;order:2;width:100%}
  .loc-panel.is-open{display:block}
  .loc-panel .loc-controls{width:100%;justify-content:space-between}
}

/* Squeezed desktop zone: the 240px filter sidebar is shown but the main column
   is too narrow to fit the full inline location controls + count + sort on one
   row, so they used to wrap and look misaligned. Collapse the location into the
   compact pin toggle (same pattern as mobile) so the bar stays a clean single
   row: [📍 label ▾] ............ [พบ X ชุด] [เรียงลำดับ]. */
@media (min-width:901px) and (max-width:1080px){
  .hr-results-bar{flex-wrap:nowrap;gap:10px}
  .loc-toggle{
    display:inline-flex;align-items:center;gap:5px;order:0;flex:0 1 auto;min-width:0;
    height:34px;padding:0 12px;border:1px solid var(--line);border-radius:8px;
    background:var(--bg);color:var(--accent-2);cursor:pointer;font-size:13px;
  }
  .loc-toggle__text{
    display:inline;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  }
  .hr-results-bar__right{order:1;margin-left:auto;flex:0 0 auto;flex-wrap:nowrap}
  /* Expandable panel drops full-width below the bar when the toggle is open */
  .loc-panel{display:none;order:2;width:100%}
  .loc-panel.is-open{display:block}
  .loc-panel .loc-controls{width:100%;justify-content:flex-start;flex-wrap:wrap}
}
`;
