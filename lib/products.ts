import { db } from "@/lib/db";
import type { Prisma, BookingStatus } from "@prisma/client";
import type { Blackout, Color, Occasion, OccasionKey, PriceTier, Product, ProductCard, AdsTier, Shop, Status, KycStatus, Size } from "./types";

/**
 * Curated occasion presentation metadata (UI-side constant).
 * rev 3: occasions live in the tag system (tag_groups.key = "occasion") which
 * has no color/en/sort columns — those stay here, keyed by tag key. Also the
 * fallback list when the tag system has no occasion tags yet.
 */
const FALLBACK_OCCASIONS: Occasion[] = [
  { key: "engagement", th: "งานหมั้น", en: "Engagement", color_token: "rose",   sort_order: 1,  image_url: null },
  { key: "wedding",    th: "งานแต่ง",  en: "Wedding",    color_token: "ivory",  sort_order: 2,  image_url: null },
  { key: "cocktail",   th: "ค็อกเทล",  en: "Cocktail",   color_token: "green",  sort_order: 3,  image_url: null },
  { key: "evening",    th: "ราตรี",    en: "Evening",    color_token: "navy",   sort_order: 4,  image_url: null },
  { key: "gala",       th: "กาล่า",   en: "Gala",       color_token: "red",    sort_order: 5,  image_url: null },
  { key: "party",      th: "ปาร์ตี้",  en: "Party",      color_token: "purple", sort_order: 6,  image_url: null },
  { key: "work",       th: "ทำงาน",   en: "Work",       color_token: "black",  sort_order: 7,  image_url: null },
  { key: "casual",     th: "ลำลอง",   en: "Casual",     color_token: "blue",   sort_order: 8,  image_url: null },
  { key: "thai",       th: "ชุดไทย",  en: "Thai",       color_token: "rose",   sort_order: 9,  image_url: null },
  { key: "graduation", th: "รับปริญญา", en: "Graduation", color_token: "navy",  sort_order: 10, image_url: null },
  { key: "costume",    th: "คอสตูม/แฟนซี", en: "Costume", color_token: "purple", sort_order: 11, image_url: null },
];

/** Default catalog product type — preserves today's dress-only browse behavior. */
const DEFAULT_PRODUCT_TYPE_KEY = "dress";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductFilters = {
  color?: Color | "all";
  sizes?: string[];
  occasions?: OccasionKey[];
  /** Generic tag filter: keys = tag-group keys, values = tag keys (OR within group, AND across groups). */
  tagsByGroup?: Record<string, string[]>;
  shopSlugs?: string[];
  designers?: string[];
  /** Category business key — additive optional filter (rev 3 taxonomy). */
  category?: string;
  priceMin?: number;
  priceMax?: number;
  /** Body-measurement filters — a product matches if ANY available variant satisfies ALL active bounds. */
  bustMin?: number;
  bustMax?: number;
  waistMin?: number;
  waistMax?: number;
  lengthMin?: number;
  lengthMax?: number;
  search?: string;
  sort?: "featured" | "price-asc" | "price-desc" | "name" | "rating-desc";
  /** Filter by product type key (e.g. "suit"). Defaults to "dress" when absent. */
  productTypeKey?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  openOnly?: boolean;
  page?: number;
};

// ---------------------------------------------------------------------------
// Mappers  (Prisma camelCase + child relations → flat TypeScript snake_case)
// ---------------------------------------------------------------------------

/** Standard include that hydrates everything mapProduct needs. */
const PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: "asc" }, select: { url: true } },
  priceTiers: { orderBy: { minDays: "asc" }, select: { minDays: true, pricePerDay: true } },
  productTags: { select: { tag: { select: { key: true, tagGroup: { select: { key: true } } } } } },
  productType: { select: { key: true } },
  category: { select: { key: true } },
  shop: { select: { name: true, verified: true, ratingAvg: true, ratingCount: true, isOpen: true, area: { select: { key: true } } } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

type PrismaShop = Prisma.ShopGetPayload<{ include: { area: { select: { key: true } } } }>;

/** Normalized price tier rows (min_days + price_per_day) → public PriceTier shape
 *  ({min, max, per_day}: contiguous ranges; last tier max = null = open-ended). */
function mapPriceTiers(tiers: Array<{ minDays: number; pricePerDay: number }>): PriceTier[] {
  return tiers.map((t, i) => ({
    min: t.minDays,
    max: i < tiers.length - 1 ? tiers[i + 1].minDays - 1 : null,
    per_day: t.pricePerDay,
  }));
}

function mapProduct(d: ProductRow): Product {
  return {
    id: d.id,
    slug: d.slug,
    tag_code: d.tagCode,
    name: d.name,
    designer: d.designer,
    shop_id: d.shopId,
    shop_name: d.shop.name,
    shop_verified: d.shop.verified,
    shop_rating_avg: d.shop.ratingAvg !== null && d.shop.ratingAvg !== undefined ? Number(d.shop.ratingAvg) : null,
    shop_rating_count: d.shop.ratingCount,
    area_key: d.shop.area?.key ?? null,
    shop_is_open: d.shop.isOpen,
    product_type_key: d.productType.key,
    category_key: d.category?.key ?? null,
    size: d.size as Size,
    color: (d.productTags.find(pt => pt.tag.tagGroup.key === 'color')?.tag.key ?? d.color ?? null) as Color | null,
    price_per_day: d.pricePerDay,
    deposit: d.deposit,
    price_tiers: mapPriceTiers(d.priceTiers),
    description: d.description,
    images: d.images.map((img) => img.url),
    occasions: d.productTags
      .filter((pt) => pt.tag.tagGroup.key === "occasion")
      .map((pt) => pt.tag.key as OccasionKey),
    line_url: d.lineUrl,
    ads_tier: d.adsTier as AdsTier,
    featured: d.featured,
    sponsored: d.sponsored,
    status: d.status as Status,
    reject_reason: d.rejectReason,
    available: d.available,
    views: d.views,
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}

function mapShop(b: PrismaShop, coverImage?: string | null): Shop {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    owner_id: b.ownerId,
    owner_name: b.ownerName,
    area_key: b.area?.key ?? null,
    area_label: b.areaLabel,
    address: b.address,
    house_no: b.houseNo,
    street: b.street,
    subdistrict: b.subdistrict,
    district: b.district,
    province: b.province,
    postal_code: b.postalCode,
    lat: b.lat !== null ? Number(b.lat) : null,
    lng: b.lng !== null ? Number(b.lng) : null,
    hours: b.hours,
    line_url: b.lineUrl,
    instagram: b.instagram,
    facebook: b.facebook,
    twitter: b.twitter,
    tiktok: b.tiktok,
    since_year: b.sinceYear,
    cover_color: b.coverColor as Color,
    cover_image: coverImage ?? null,
    logo_url: b.logoUrl ?? null,
    tag: b.tag,
    story: b.story,
    delivery_info: b.deliveryInfo,
    featured: b.featured,
    ads_tier: b.adsTier as AdsTier,
    verified: b.verified,
    status: b.status as Status,
    reject_reason: b.rejectReason,
    kyc_status: b.kycStatus as KycStatus,
    rating_avg: b.ratingAvg !== null && b.ratingAvg !== undefined ? Number(b.ratingAvg) : null,
    rating_count: b.ratingCount ?? 0,
    is_open: b.isOpen,
    created_at: b.createdAt.toISOString(),
    updated_at: b.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Banner fallbacks — rotating set assigned to shops with no product images
// ---------------------------------------------------------------------------

const FALLBACK_BANNERS = [
  '/banners/banner-1.png',
  '/banners/banner-2.png',
  '/banners/banner-3.png',
  '/banners/banner-4.png',
  '/banners/banner-5.png',
  '/banners/banner-6.png',
] as const;

/** Shop-card product preview include (first image only, sorted). */
const SHOP_PRODUCT_PREVIEW = {
  take: 5,
  where: { status: "live", available: true },
  select: {
    id: true,
    name: true,
    pricePerDay: true,
    images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
  },
  orderBy: { featured: "desc" },
} satisfies Prisma.Shop$productsArgs;

type ShopWithPreviews = PrismaShop & {
  products: Array<{
    id: string;
    name: string;
    pricePerDay: number;
    images: Array<{ url: string }>;
  }>;
};

function mapShopWithCards(r: ShopWithPreviews, index: number): Shop {
  const coverImage = r.products?.[0]?.images?.[0]?.url
    ?? FALLBACK_BANNERS[index % FALLBACK_BANNERS.length];
  const shop = mapShop(r, coverImage);
  shop.product_cards = r.products.map((p) => ({
    id: p.id,
    name: p.name,
    price_per_day: p.pricePerDay,
    image: p.images?.[0]?.url ?? null,
  } satisfies ProductCard));
  return shop;
}

// ---------------------------------------------------------------------------
// Trigram search helper
// ---------------------------------------------------------------------------

/**
 * Fetch up to 200 product IDs ranked by pg_trgm similarity score.
 *
 * Similarity score = GREATEST(
 *   similarity(products.name,        query),
 *   similarity(products.designer,    query),   -- NULLs coalesced to 0
 *   similarity(products.description, query),   -- NULLs coalesced to 0
 *   similarity(shops.name,           query)
 * )
 *
 * Threshold: 0.15 (tune via pg_trgm.similarity_threshold if needed).
 * Trigrams work on raw UTF-8 substrings, so Thai partial words and minor
 * typos improve automatically without word segmentation.
 *
 * Returns null when no candidates exceed the threshold — caller falls back
 * to the existing substring AND search so nothing regresses.
 */
async function getTrigamRankedIds(
  q: string,
  productTypeKey: string = DEFAULT_PRODUCT_TYPE_KEY,
): Promise<string[] | null> {
  type Row = { id: string; score: number };

  // All params are positional placeholders via Prisma tagged template —
  // q is NEVER interpolated into the SQL string itself (no injection risk).
  const rows = await db.$queryRaw<Row[]>`
    SELECT sub.id::text AS id, sub.score
    FROM (
      SELECT
        p.id,
        GREATEST(
          MAX(similarity(p.name,        ${q})),
          MAX(COALESCE(similarity(p.designer,    ${q}), 0::real)),
          MAX(COALESCE(similarity(p.description, ${q}), 0::real)),
          MAX(similarity(s.name,        ${q})),
          COALESCE(MAX(similarity(t.label, ${q})), 0::real),
          COALESCE(MAX(similarity(t.key,   ${q})), 0::real)
        ) AS score
      FROM products p
      JOIN shops s           ON s.id  = p.shop_id
      JOIN product_types pt  ON pt.id = p.product_type_id
      LEFT JOIN product_tags ptg ON ptg.product_id = p.id
      LEFT JOIN tags t           ON t.id = ptg.tag_id
      WHERE p.status    = 'live'
        AND p.available = true
        AND pt.key      = ${productTypeKey}
      GROUP BY p.id
    ) sub
    WHERE sub.score > 0.15
    ORDER BY sub.score DESC
    LIMIT 200
  `;

  if (rows.length === 0) return null;
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export async function listProducts(
  opts: ProductFilters & { limit?: number } = {}
): Promise<{ items: Product[]; total: number; hasMore: boolean }> {
  const PAGE_SIZE = 25;
  const page = Math.max(1, opts.page ?? 1);

  // Build where clause — default to dress when no productTypeKey provided.
  const effectiveTypeKey = opts.productTypeKey ?? DEFAULT_PRODUCT_TYPE_KEY;
  const where: Prisma.ProductWhereInput = {
    status: "live",
    available: true,
    productType: { key: effectiveTypeKey },
  };

  if (opts.sizes?.length) where.size = { in: opts.sizes as unknown as Prisma.EnumSizeFilter<"Product">["in"] };

  // priceMin + priceMax
  if (typeof opts.priceMin === "number" || typeof opts.priceMax === "number") {
    where.pricePerDay = {
      ...(typeof opts.priceMin === "number" ? { gte: opts.priceMin } : {}),
      ...(typeof opts.priceMax === "number" ? { lte: opts.priceMax } : {}),
    };
  }

  // Generalized tag-group filter — one AND clause per group, OR within a group.
  // occasions is a backward-compat alias that maps to tagsByGroup.occasion.
  const effectiveTagsByGroup: Record<string, string[]> = { ...(opts.tagsByGroup ?? {}) };
  if (opts.occasions?.length) {
    const prev = effectiveTagsByGroup.occasion ?? [];
    effectiveTagsByGroup.occasion = [...new Set([...prev, ...opts.occasions])];
  }
  if (opts.color && opts.color !== "all") {
    const prev = effectiveTagsByGroup.color ?? [];
    effectiveTagsByGroup.color = [...new Set([...prev, opts.color])];
  }
  const tagGroupClauses = Object.entries(effectiveTagsByGroup)
    .filter(([, tagKeys]) => tagKeys.length > 0)
    .map(([groupKey, tagKeys]): Prisma.ProductWhereInput => ({
      productTags: {
        some: { tag: { key: { in: tagKeys }, tagGroup: { key: groupKey } } },
      },
    }));
  if (tagGroupClauses.length > 0) {
    where.AND = tagGroupClauses;
  }

  // Category filter (additive, key-based)
  if (opts.category) {
    where.category = { key: opts.category };
  }

  // Designers filter (DB level)
  if (opts.designers?.length) {
    where.designer = { in: opts.designers };
  }

  // Shop slugs filter (DB level via relation)
  if (opts.shopSlugs?.length) {
    where.shop = { slug: { in: opts.shopSlugs } };
  }

  // Open shops only (optional filter)
  if (opts.openOnly) {
    where.shop = { ...where.shop as Prisma.ShopWhereInput, isOpen: true };
  }

  // Body-measurement filter — one variant must satisfy ALL active bounds simultaneously.
  // Placed on the Prisma `where` object so it applies to both the standard path and the
  // trigram path (both call db.product.findMany({ where, ... }) with the same object).
  const hasMeasurementFilter = [
    opts.bustMin, opts.bustMax, opts.waistMin, opts.waistMax, opts.lengthMin, opts.lengthMax,
  ].some((v) => v !== undefined);
  if (hasMeasurementFilter) {
    const variantFilter: Prisma.ProductVariantWhereInput = { available: true };
    if (opts.bustMin !== undefined || opts.bustMax !== undefined) {
      variantFilter.bustCm = {
        ...(opts.bustMin !== undefined ? { gte: opts.bustMin } : {}),
        ...(opts.bustMax !== undefined ? { lte: opts.bustMax } : {}),
      };
    }
    if (opts.waistMin !== undefined || opts.waistMax !== undefined) {
      variantFilter.waistCm = {
        ...(opts.waistMin !== undefined ? { gte: opts.waistMin } : {}),
        ...(opts.waistMax !== undefined ? { lte: opts.waistMax } : {}),
      };
    }
    if (opts.lengthMin !== undefined || opts.lengthMax !== undefined) {
      variantFilter.lengthCm = {
        ...(opts.lengthMin !== undefined ? { gte: opts.lengthMin } : {}),
        ...(opts.lengthMax !== undefined ? { lte: opts.lengthMax } : {}),
      };
    }
    where.variants = { some: variantFilter };
  }

  // Date range: compute blocked product IDs first — needed before the search
  // section so the trigram path can pre-filter the ranked candidate list.
  //
  // Two sources of blocked IDs:
  //   1. ProductBlackoutDate rows falling in the requested date range.
  //   2. Products FULLY BOOKED for the range: the total count of overlapping
  //      active bookings meets or exceeds total variant capacity.
  //
  // Active statuses — mirrors ACTIVE_BOOKING_STATUSES in app/actions/bookings.ts:183
  // and ACTIVE_STATUSES in lib/bookings.ts. Must stay in sync with both.
  // Typed as BookingStatus[] so Prisma's Exact<> enum filter accepts it.
  const ACTIVE_BOOKING_STATUSES_CATALOG: BookingStatus[] = [
    "booking_pending",
    "waiting_for_payment",
    "payment_review",
    "confirmed",
  ];
  //
  // Capacity approximation: we compare the TOTAL count of overlapping active
  // bookings (across the whole requested range) against total unit capacity
  // (sum of available ProductVariant.quantity; 1 for products with no variants).
  // This is conservative — it may over-block products whose bookings don't all
  // occupy the same day — but it NEVER surfaces a genuinely fully-booked product
  // as available.  Tradeoff: a product with N units where N separate bookings
  // each cover a different non-overlapping sub-range inside [dateFrom,dateTo]
  // will appear blocked even though it has spare units every day.  Acceptable
  // for a list-page pre-filter; the product detail page runs the exact per-day
  // check via computeUnavailableDates().
  let blockedIds: string[] = [];
  if (opts.dateFrom || opts.dateTo) {
    // Open-ended queries get sentinel dates so the overlap predicate is correct.
    const dateFromDate = opts.dateFrom ? new Date(opts.dateFrom) : new Date("2000-01-01");
    const dateToDate   = opts.dateTo   ? new Date(opts.dateTo)   : new Date("2100-12-31");

    // Run both pre-filter queries in parallel.
    // Overlap predicate: booking.startDate ≤ dateTo AND booking.endDate ≥ dateFrom.
    // Using findMany+select (not groupBy) for stable Prisma type inference;
    // in-memory grouping is trivial at list-page volumes.
    const [blackoutRows, overlappingBookings] = await Promise.all([
      db.productBlackoutDate.findMany({
        where: {
          date: {
            gte: opts.dateFrom ? new Date(opts.dateFrom) : undefined,
            lte: opts.dateTo   ? new Date(opts.dateTo)   : undefined,
          },
        },
        select: { productId: true },
      }),
      db.bookingItem.findMany({
        where: {
          booking: {
            status: { in: ACTIVE_BOOKING_STATUSES_CATALOG },
            startDate: { lte: dateToDate },
            endDate:   { gte: dateFromDate },
          },
        },
        select: { productId: true },
      }),
    ]);

    const blockedSet = new Set(blackoutRows.map((b) => b.productId));

    if (overlappingBookings.length > 0) {
      // Count overlapping active bookings per product (in memory, no N+1).
      const bookingCountMap = new Map<string, number>();
      for (const b of overlappingBookings) {
        bookingCountMap.set(b.productId, (bookingCountMap.get(b.productId) ?? 0) + 1);
      }

      // Fetch total available capacity: sum of variant quantities per product.
      // Products with no variants default to capacity = 1 (single-unit product).
      const affectedIds = [...bookingCountMap.keys()];
      const variantRows = await db.productVariant.findMany({
        where: { productId: { in: affectedIds }, available: true },
        select: { productId: true, quantity: true },
      });
      const capacityMap = new Map<string, number>();
      for (const v of variantRows) {
        capacityMap.set(v.productId, (capacityMap.get(v.productId) ?? 0) + v.quantity);
      }

      for (const [productId, count] of bookingCountMap) {
        const capacity = capacityMap.get(productId) ?? 1; // no variants → single-unit
        if (count >= capacity) {
          blockedSet.add(productId);
        }
      }
    }

    blockedIds = [...blockedSet];
  }

  // Search — try trigram similarity first; fall back to substring AND when no
  // trigram matches (e.g. very short query, novel word with 0 overlap).
  // Empty query = current default listing unchanged.
  let trigramRankedIds: string[] | null = null;
  if (opts.search) {
    const q = opts.search.trim();
    // pg_trgm requires at least 2 characters to form meaningful trigrams.
    if (q.length >= 2) {
      trigramRankedIds = await getTrigamRankedIds(q, effectiveTypeKey);
    }

    if (trigramRankedIds !== null) {
      // Trigram path: restrict Prisma query to the similarity-ranked candidates.
      // Pre-filter date-blocked products out of the ranked list so the JS
      // re-sort step below reflects only available items.
      if (blockedIds.length > 0) {
        const blockedSet = new Set(blockedIds);
        trigramRankedIds = trigramRankedIds.filter((id) => !blockedSet.has(id));
      }
      where.id = { in: trigramRankedIds };
    } else {
      // Substring fallback: each whitespace-split term must match at least one field.
      // Shop name is matched via the relation (products no longer carry the
      // denormalized boutique_name column — so the shop-name match is ORed in here).
      const terms = q.split(/\s+/).filter(Boolean);
      if (terms.length > 0) {
        const existingAnd: Prisma.ProductWhereInput[] = Array.isArray(where.AND) ? where.AND : [];
        where.AND = [
          ...existingAnd,
          ...terms.map((term): Prisma.ProductWhereInput => ({
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { designer: { contains: term, mode: "insensitive" as const } },
              { shop: { name: { contains: term, mode: "insensitive" as const } } },
              { description: { contains: term, mode: "insensitive" as const } },
            ],
          })),
        ];
      }
      if (blockedIds.length > 0) where.id = { notIn: blockedIds };
    }
  } else {
    // No search query — apply blocked IDs normally.
    if (blockedIds.length > 0) where.id = { notIn: blockedIds };
  }

  // DB-level sort
  let orderBy: Prisma.ProductOrderByWithRelationInput[];
  switch (opts.sort) {
    case "price-asc":    orderBy = [{ pricePerDay: "asc" }]; break;
    case "price-desc":   orderBy = [{ pricePerDay: "desc" }]; break;
    case "name":         orderBy = [{ name: "asc" }]; break;
    case "rating-desc":  orderBy = [{ shop: { ratingAvg: { sort: "desc", nulls: "last" } } }]; break;
    default:             orderBy = [{ featured: "desc" }, { sponsored: "desc" }, { createdAt: "desc" }];
  }

  // Pagination
  const take = opts.limit ?? PAGE_SIZE;
  const skip = opts.limit ? 0 : (page - 1) * PAGE_SIZE;

  // Trigram path with no explicit sort override:
  // Fetch all candidates (≤ 200 from the raw query), re-sort by similarity rank
  // in JS, then paginate in memory. This preserves relevance order accurately
  // regardless of secondary Prisma filters (color, size, price, etc.).
  if (trigramRankedIds !== null && !opts.sort) {
    const rows = await db.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy, // stable featured/sponsored/createdAt tiebreaker
    });
    const all = rows.map(mapProduct);
    // Re-sort by trigram rank: lower index in rankedIds = higher similarity score.
    const rankMap = new Map(trigramRankedIds.map((id, i) => [id, i]));
    all.sort((a, b) => (rankMap.get(a.id) ?? 9999) - (rankMap.get(b.id) ?? 9999));
    const total = all.length;
    const paged = all.slice(skip, skip + take);
    const hasMore = opts.limit ? false : (skip + take) < total;
    return { items: paged, total, hasMore };
  }

  // Standard path: no trigram active, OR user chose an explicit sort
  // (price-asc / price-desc / name) which overrides similarity ranking.
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy,
      take,
      skip,
    }),
    db.product.count({ where }),
  ]);

  const items = rows.map(mapProduct);
  const hasMore = opts.limit ? false : (page * PAGE_SIZE) < total;

  return { items, total, hasMore };
}

export async function listDesigners(): Promise<string[]> {
  const rows = await db.product.findMany({
    where: {
      status: "live",
      available: true,
      designer: { not: null },
      productType: { key: DEFAULT_PRODUCT_TYPE_KEY },
    },
    select: { designer: true },
    distinct: ["designer"],
  });
  return rows
    .map((r) => r.designer?.trim() ?? "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const d = await db.product.findUnique({ where: { slug }, include: PRODUCT_INCLUDE });
  if (!d) return null;
  return mapProduct(d);
}

export async function getProductByTagCode(tagCode: string): Promise<Product | null> {
  const d = await db.product.findUnique({ where: { tagCode }, include: PRODUCT_INCLUDE });
  if (!d) return null;
  return mapProduct(d);
}

/**
 * Paid sponsor strip — shops on a paid ads_tier (boost/featured).
 * Powers the home marquee as a sponsored-shop placement. Featured first,
 * then boost. Returns [] when no one is on a paid plan yet (caller falls
 * back to the plain verified strip so it never renders empty).
 */
export async function listSponsorShops(limit = 8): Promise<Shop[]> {
  try {
    const rows = await db.shop.findMany({
      where: {
        status: "live",
        adsTier: { in: ["boost", "featured"] },
      },
      include: {
        area: { select: { key: true } },
        products: SHOP_PRODUCT_PREVIEW,
      },
      orderBy: [{ adsTier: "desc" }, { featured: "desc" }, { name: "asc" }],
      take: limit,
    });
    return rows.map((r, index) => mapShopWithCards(r, index));
  } catch {
    return [];
  }
}

export async function listShops(opts: { limit?: number; featuredFirst?: boolean; sort?: "rating-desc" | "name" } = {}): Promise<Shop[]> {
  let orderBy: Prisma.ShopOrderByWithRelationInput[];
  if (opts.sort === "rating-desc") {
    orderBy = [{ ratingAvg: { sort: "desc", nulls: "last" } }];
  } else {
    orderBy = [
      ...(opts.featuredFirst ? [{ featured: "desc" as const }] : []),
      { name: "asc" },
    ];
  }
  const rows = await db.shop.findMany({
    where: { status: "live" },
    include: {
      area: { select: { key: true } },
      products: SHOP_PRODUCT_PREVIEW,
    },
    orderBy,
    take: opts.limit,
  });
  return rows.map((r, index) => mapShopWithCards(r, index));
}

/** Default page size for the public /shops "load more" feed. */
export const SHOPS_PAGE_SIZE = 24;

/** Minimal shop row for the /shops finder grid (no product join — the finder
 *  doesn't render previews, so we keep this query light enough for thousands of
 *  shops with offset pagination + a free-text DB filter). */
export type ShopListItem = {
  id: string;
  slug: string;
  name: string;
  areaKey: string | null;
  areaLabel: string;
  coverColor: Color;
  /** Shop logo URL, else null (card falls back to the gradient cover). */
  coverImage: string | null;
  featured: boolean;
  verified: boolean;
  tag: string | null;
  sinceYear: number | null;
  instagram: string | null;
};

/**
 * Paginated, DB-filtered list of live shops for the public finder.
 * Search (`q`) matches name / area / IG / tag case-insensitively at the DB.
 * Returns the rows for this page plus the total matching count (for "hasMore").
 */
export async function listShopsPage(opts: {
  q?: string;
  skip?: number;
  take?: number;
} = {}): Promise<{ rows: ShopListItem[]; total: number }> {
  const q = (opts.q ?? "").trim();
  const where: Prisma.ShopWhereInput = {
    status: "live",
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { areaLabel: { contains: q, mode: "insensitive" } },
            { instagram: { contains: q, mode: "insensitive" } },
            { tag: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.shop.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        areaLabel: true,
        coverColor: true,
        featured: true,
        verified: true,
        tag: true,
        sinceYear: true,
        instagram: true,
        logoUrl: true,
        area: { select: { key: true } },
      },
      orderBy: [{ featured: "desc" }, { name: "asc" }],
      skip: opts.skip ?? 0,
      take: opts.take ?? SHOPS_PAGE_SIZE,
    }),
    db.shop.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      areaKey: r.area?.key ?? null,
      areaLabel: r.areaLabel,
      coverColor: r.coverColor as Color,
      coverImage: r.logoUrl ?? null,
      featured: r.featured,
      verified: r.verified,
      tag: r.tag,
      sinceYear: r.sinceYear,
      instagram: r.instagram,
    })),
    total,
  };
}

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  const b = await db.shop.findUnique({
    where: { slug },
    include: { area: { select: { key: true } } },
  });
  return b ? mapShop(b, null) : null;
}

/** Fetch live products by id list (e.g. a user's saved/favorite products). */
export async function listProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({
    where: { id: { in: ids }, status: "live" },
    include: PRODUCT_INCLUDE,
  });
  return rows.map(mapProduct);
}

export async function listProductsByShop(shopId: string): Promise<Product[]> {
  const rows = await db.product.findMany({
    where: { shopId, status: "live", available: true },
    include: PRODUCT_INCLUDE,
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapProduct);
}

/**
 * List occasions for the UI (landing row, filters, nav).
 * rev 3: sourced from the tag system (group "occasion"); th = tags.label,
 * en/color_token/sort_order come from the curated FALLBACK_OCCASIONS constant
 * (the tag system has no color/en/sort columns). Unknown tag keys get safe
 * defaults and sort last. Return shape unchanged.
 */
export async function listOccasions(): Promise<Occasion[]> {
  const rows = await db.tag.findMany({
    where: {
      isActive: true,
      tagGroup: { key: "occasion" },
      // เฉพาะ occasion ที่มีสินค้าที่มองเห็นได้ผูกอยู่จริง (live + available)
      productTags: { some: { product: { status: "live", available: true } } },
    },
    select: { key: true, label: true, imageUrl: true },
  });
  return rows
    .map((r) => {
      const meta = FALLBACK_OCCASIONS.find((f) => f.key === r.key);
      return {
        key: r.key as OccasionKey,
        th: r.label || meta?.th || r.key,
        en: meta?.en ?? r.key,
        color_token: meta?.color_token ?? ("rose" as Color),
        sort_order: meta?.sort_order ?? 99,
        image_url: r.imageUrl ?? null,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
}

/**
 * List blackout dates for a product.
 * variantId = undefined → product-wide only (variantId IS NULL).
 * variantId = string   → variant-specific only.
 * variantId = "all"    → all blackouts (product-wide + all variants).
 */
export async function listBlackouts(
  productId: string,
  variantId?: string | null,
): Promise<{ date: string; variantId: string | null; unitId: string | null }[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = await db.productBlackoutDate.findMany({
    where: variantId && variantId !== "all"
      ? { productId, date: { gte: today }, OR: [{ variantId: null }, { variantId }] }
      : variantId === "all"
        ? { productId, date: { gte: today } }
        : { productId, date: { gte: today }, variantId: null },
    orderBy: { date: "asc" },
    select: { date: true, variantId: true, unitId: true },
  });
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    variantId: r.variantId,
    unitId: r.unitId,
  }));
}

export async function getStats(): Promise<{ shops: number; products: number; minPrice: number }> {
  const [shops, products, cheapest] = await Promise.all([
    db.shop.count({ where: { status: "live" } }),
    db.product.count({
      where: { status: "live", available: true, productType: { key: DEFAULT_PRODUCT_TYPE_KEY } },
    }),
    db.product.findFirst({
      where: { status: "live", available: true, productType: { key: DEFAULT_PRODUCT_TYPE_KEY } },
      orderBy: { pricePerDay: "asc" },
      select: { pricePerDay: true },
    }),
  ]);
  return { shops, products, minPrice: cheapest?.pricePerDay ?? 1500 };
}

export async function getBlackoutsByProduct(productId: string): Promise<Blackout[]> {
  const rows = await db.productBlackoutDate.findMany({
    where: { productId },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    product_id: r.productId,
    date: r.date.toISOString().slice(0, 10),
    created_at: r.createdAt.toISOString(),
  }));
}

export async function getBlackoutsByMonth(
  productIds: string[],
  month: string, // YYYY-MM
): Promise<Array<{ product_id: string; date: string }>> {
  if (!productIds.length) return [];
  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(year, mon - 1, 1);
  const monthEnd = new Date(year, mon, 0); // last day
  const rows = await db.productBlackoutDate.findMany({
    where: { productId: { in: productIds }, date: { gte: monthStart, lte: monthEnd } },
  });
  return rows.map((r) => ({
    product_id: r.productId,
    date: r.date.toISOString().slice(0, 10),
  }));
}

export async function listSimilarProducts(seed: Product, limit = 4): Promise<Product[]> {
  const rows = await db.product.findMany({
    where: {
      status: "live",
      available: true,
      NOT: { id: seed.id },
      productType: { key: seed.product_type_key || DEFAULT_PRODUCT_TYPE_KEY },
    },
    include: PRODUCT_INCLUDE,
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: 60,
  });

  const pool = rows.map(mapProduct);
  const seedOccasions = new Set(seed.occasions ?? []);

  function score(d: Product): number {
    let s = 0;
    const dOcc = new Set(d.occasions ?? []);
    const intersection = [...seedOccasions].filter((o) => dOcc.has(o)).length;
    const union = new Set([...seedOccasions, ...dOcc]).size;
    if (union > 0) s += (intersection / union) * 5;
    if (d.color === seed.color) s += 3;
    if (d.size === seed.size) s += 3;
    const lo = seed.price_per_day * 0.7, hi = seed.price_per_day * 1.3;
    if (d.price_per_day >= lo && d.price_per_day <= hi) s += 2;
    if (seed.designer && d.designer === seed.designer) s += 2;
    if (d.shop_id === seed.shop_id) s += 1;
    return s;
  }

  return pool
    .map((d) => ({ d, s: score(d) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ d }) => d);
}

export const isSupabaseConfigured = false;
