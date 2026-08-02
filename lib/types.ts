
export type Color =
  | "rose"
  | "ivory"
  | "green"
  | "black"
  | "navy"
  | "red"
  | "blue"
  | "purple";

// NOTE: these are the Prisma enum *member names* (not the raw DB labels). The
// Postgres `size` enum stores "3XL"/"4XL"/"Free size", but Prisma maps those to
// the identifiers XL3/XL4/FreeSize (@map in schema.prisma). Always use these
// identifiers in code; use sizeLabel() for anything shown to a user.
export type Size =
  | "XXXS"
  | "XXS"
  | "XS"
  | "S"
  | "M"
  | "L"
  | "XL"
  | "XXL"
  | "XL3"
  | "XL4"
  | "FreeSize";

/** Canonical size order — single source for forms + filters. */
export const SIZES: Size[] = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XL3", "XL4", "FreeSize"];

/** Human-facing labels for sizes whose code identifier differs from the display text. */
export const SIZE_LABELS: Record<Size, string> = {
  XXXS: "XXXS",
  XXS: "XXS",
  XS: "XS",
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
  XXL: "XXL",
  XL3: "3XL",
  XL4: "4XL",
  FreeSize: "Free size",
};

/** Display label for a size value (falls back to the raw value for unknowns). */
export const sizeLabel = (s: string | null | undefined): string =>
  s == null ? "" : (SIZE_LABELS[s as Size] ?? s);

/**
 * Format a product's variant sizes into ONE consistent label, e.g. "S · M · L",
 * so every surface (product detail, seller list, etc.) shows sizes the same way.
 * Prefers available variants; if none available it still lists them. Sizes are
 * de-duplicated and ordered by the canonical SIZES order. Falls back to the
 * legacy single Product.size when there are no variants at all.
 */
export function formatVariantSizes(
  variants: ReadonlyArray<{ size: Size | string; available?: boolean }>,
  fallbackSize?: Size | string | null,
): string {
  const pool = variants.some((v) => v.available !== false)
    ? variants.filter((v) => v.available !== false)
    : variants;
  const uniq = Array.from(new Set(pool.map((v) => v.size)));
  if (uniq.length === 0) {
    return fallbackSize ? sizeLabel(fallbackSize) : "—";
  }
  uniq.sort((a, b) => {
    const ia = SIZES.indexOf(a as Size);
    const ib = SIZES.indexOf(b as Size);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return uniq.map((s) => sizeLabel(s)).join(" · ");
}

export type OccasionKey =
  | "engagement"
  | "wedding"
  | "cocktail"
  | "evening"
  | "gala"
  | "party"
  | "work"
  | "casual"
  | "thai"
  | "costume"
  | "graduation";

export type AdsTier = "free" | "boost" | "featured" | "full";
export type Status = "pending" | "live" | "rejected" | "draft";
export type KycStatus = "none" | "submitted" | "verified" | "rejected";

/** Booking lifecycle — mirrors the BookingStatus enum in prisma/schema.prisma.
 *  Keep in sync with BOOKING_STATUS_META / TRANSITIONS in lib/bookings.ts. */
export type BookingStatus =
  | "booking_pending"
  | "waiting_for_payment"
  | "payment_review"
  | "confirmed"
  | "renting"
  | "awaiting_return"
  | "cancel_requested"
  | "slip_disputed"
  | "rejected"
  | "cancelled"
  | "payment_expired"
  /** ผู้เช่าคืนชุดแล้ว รอร้านตรวจรับ — ระยะกลางของการปิดรายการ */
  | "returned"
  /** ร้านตรวจรับชุดเรียบร้อย ปิดรายการเช่าสมบูรณ์ — terminal สุดท้าย */
  | "completed"
  /** ลูกค้าไม่ส่งคืนชุด — ลูกค้ายังโต้แย้งได้ */
  | "not_returned"
  /** ผู้เช่าโต้แย้งกรณีไม่คืนของ — รอแอดมินตัดสิน */
  | "return_disputed"
  /** ผู้เช่าโต้แย้งการตัดสินมัดจำ — รอแอดมินตัดสิน */
  | "deposit_disputed";

/**
 * Public Occasion shape — mapper-output type (rev 3: assembled from the tag
 * system [group "occasion"] + i18n + UI color constant; no longer a DB table).
 */
export type Occasion = {
  key: OccasionKey;
  th: string;
  en: string;
  color_token: Color;
  sort_order: number;
  image_url: string | null;
};

/** Product type reference (e.g. "dress", "suit") — mirrors product_types. */
export type ProductType = {
  key: string;
  label: string;
  is_active: boolean;
};

/** Hierarchical product category (per product type) — mirrors product_categories. */
export type ProductCategory = {
  key: string;
  label: string;
  parent_key: string | null;
  product_type_key: string;
  sort_order: number;
  is_active: boolean;
};

/** Tag group (e.g. "occasion") — mirrors tag_groups. */
export type TagGroup = {
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

/** Tag inside a group (e.g. "wedding" in group "occasion") — mirrors tags. */
export type Tag = {
  key: string;
  label: string;
  group_key: string;
  is_active: boolean;
};

export type Area = {
  key: string;
  th: string;
  lat: number;
  lng: number;
  keywords: string[];
};

/** Lightweight product preview used in banner card stacks. */
export type ProductCard = {
  id: string;
  name: string;
  price_per_day: number;
  image: string | null;
};

export type Shop = {
  id: string;
  slug: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  area_key: string | null;
  area_label: string;
  address: string | null;
  /** Structured Thai address (added 2026-05-13 for proper geocoding). */
  house_no: string | null;
  street: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  hours: string | null;
  line_url: string;
  instagram: string | null;
  /** Facebook page URL/handle (optional). */
  facebook: string | null;
  /** X (Twitter) handle/URL (optional). */
  twitter: string | null;
  /** TikTok handle/URL (optional). */
  tiktok: string | null;
  /** PromptPay id (mobile/national-id) for in-web QR payments.
   *  Optional in the public Shop shape — only the booking flow selects it. */
  promptpay_id?: string | null;
  /** ธนาคารที่ใช้รับโอน (ไม่บังคับ) */
  bank_name?: string | null;
  /** เลขบัญชีธนาคาร */
  bank_account_number?: string | null;
  /** ชื่อบัญชีธนาคาร */
  bank_account_name?: string | null;
  /** PRIVATE bucket key ของรูปหน้าสมุดบัญชี (แนบเมื่อกรอกเลขบัญชี) */
  bankbook_image_path?: string | null;
  since_year: number | null;
  cover_color: Color;
  cover_image: string | null;
  /** Shop logo (PUBLIC bucket URL); null = no logo uploaded. */
  logo_url: string | null;
  tag: string | null;
  story: string | null;
  delivery_info: string | null;
  featured: boolean;
  /** Admin-toggled trust mark (post-KYC). Defaults to false. */
  verified: boolean;
  ads_tier: AdsTier;
  status: Status;
  reject_reason: string | null;
  kyc_status: KycStatus;
  /** Average rating (1–5) from visible reviews. NULL = no reviews yet. */
  rating_avg: number | null;
  /** Number of visible reviews. */
  rating_count: number;
  /** Seller-controlled open/close toggle. false = shop shows 'ปิดชั่วคราว' on public page. */
  is_open: boolean;
  created_at: string;
  updated_at: string;
  /** Optional product card previews — populated by listSponsorShops / listShops for the hero banner card stack. */
  product_cards?: ProductCard[];
};

/** One duration-based pricing bracket. per_day = THB/day; max=null means open-ended (X+ days). */
export type PriceTier = { min: number; max: number | null; per_day: number };

export type Product = {
  id: string;
  slug: string;
  tag_code: string;
  name: string;
  designer: string | null;
  shop_id: string;
  /** Joined from shops.name — populated by the product mapper. */
  shop_name: string;
  /** Denormalized from shops.verified — populated by listProducts(). */
  shop_verified?: boolean;
  /** Denormalized from shops.rating_avg — populated by listProducts(). */
  shop_rating_avg?: number | null;
  /** Denormalized from shops.rating_count — populated by listProducts(). */
  shop_rating_count?: number;
  /** Denormalized from the product's shop area key — populated by listProducts(). Used for distance display. */
  area_key?: string | null;
  /** Whether the product's shop is currently open (seller-toggled). */
  shop_is_open?: boolean;
  /** Business key of the product type (e.g. "dress") — joined from product_types. */
  product_type_key: string;
  /** Business key of the product's category (nullable — uncategorized allowed). */
  category_key?: string | null;
  size: Size;
  color: Color | null;
  /** Starting/base per-day rate (THB). Fallback when no tiers; also the "from" price for cards & filters. */
  price_per_day: number;
  /**
   * Optional duration-based pricing. Contiguous day ranges, each with a per-day
   * rate (longer = cheaper/day). Last tier has max=null (open-ended "X+ days").
   * When null/empty, pricing falls back to price_per_day. See lib/pricing.ts.
   */
  price_tiers: PriceTier[] | null;
  deposit: number;
  description: string | null;
  images: string[];
  occasions: OccasionKey[];
  line_url: string;
  ads_tier: AdsTier;
  featured: boolean;
  sponsored: boolean;
  status: Status;
  reject_reason: string | null;
  available: boolean;
  views: number;
  created_at: string;
  updated_at: string;
};

export type ProductWithShop = Product & {
  shop: Shop;
};

export type Blackout = {
  product_id: string;
  date: string;
  created_at: string;
};

/* ----------------------------- bookings ----------------------------- */

export type Address = {
  id: string;
  user_id: string;
  recipient_name: string;
  phone: string;
  address_text: string;
  line_id?: string | null;
  is_default: boolean;
  created_at: string;
};

export type BankAccount = {
  id: string;
  user_id: string;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default: boolean;
  created_at: string;
};

export type Booking = {
  id: string;
  renter_id: string;
  boutique_id: string;
  dress_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  start_time: string | null; // "HH:MM"; null = full day
  end_time: string | null; // "HH:MM"; null = full day
  rental_total: number;
  deposit: number;
  shipping_fee: number | null; // null until seller sets on accept
  /** Platform commission snapshot (see lib/bookings.ts commissionAmount). */
  commission_rate: number;
  commission_amount: number | null;
  /** Renter's first-touch acquisition channel (attribution). */
  channel: string | null;
  status: BookingStatus;
  slip_path: string | null;
  /** Channel the shop chose to collect through (snapshot at accept). */
  payment_method: "promptpay" | "bank" | null;
  /** Delivery method the renter picked at checkout ("standard" | "express"). Mirrors outbound_method. */
  delivery_method: string | null;
  /** Outbound shipping (shop→customer) — drives before-rental buffer. */
  outbound_method: string | null;
  /** Return shipping (customer→shop) — drives after-rental buffer. */
  return_method: string | null;
  /** Carrier the shop handed a standard parcel to (set when shipping). */
  delivery_carrier: string | null;
  /** Parcel tracking number the shop entered when shipping. */
  tracking_number: string | null;
  /** Tracking URL the shop entered when shipping. */
  tracking_url: string | null;
  /** Return carrier the renter used when shipping back. */
  return_carrier: string | null;
  /** Return parcel tracking number. */
  return_tracking_number: string | null;
  /** Return tracking URL. */
  return_tracking_url: string | null;
  /** When the renter submitted return tracking (ISO string). Null = not yet shipped back. */
  return_shipped_at: string | null;
  address_id: string | null;
  recipient_name: string | null; // snapshot at booking time
  phone: string | null;
  address_text: string | null;
  current_due_at: string | null;
  /** When the slip will be auto-confirmed if seller doesn't review (ISO string). */
  slip_confirm_due_at: string | null;
  cancel_reason: string | null;
  cancel_from_status: string | null;
  dispute_note: string | null;
  /** Post-payment address-change sub-flow (see lib/bookings.ts ADDR_CHANGE_*).
   *  null/"none" → "requested" → "approved" → "paid_review" → "done" | "rejected". */
  addr_change_status: string | null;
  /** Proposed new delivery address (pending shop approval). */
  pending_recipient_name: string | null;
  pending_phone: string | null;
  pending_address_text: string | null;
  /** New shipping fee the shop set for the proposed address (THB). */
  pending_shipping_fee: number | null;
  /** Positive difference the renter must top-up = max(0, pending − current) (THB). */
  addr_change_diff: number | null;
  /** Private bucket key of the top-up payment slip. */
  addr_change_slip_path: string | null;
  /** Shop's reason when an address-change request is rejected. */
  addr_change_reason: string | null;
  // -- Deposit refund --
  /** Renter's bank account snapshot for deposit refund. */
  refund_bank_name: string | null;
  refund_account_number: string | null;
  refund_account_name: string | null;
  /** Seller's deposit decision: "full_refund" / "partial_refund" / "forfeit". */
  deposit_decision: string | null;
  /** Renter's reason for disputing the deposit decision. */
  deposit_dispute_note: string | null;
  /** Deadline for renter to verify the refund slip (ISO string, 24h). */
  refund_slip_due_at: string | null;
  /** When the renter confirmed receipt of the refund (ISO string). */
  refund_verified_at: string | null;
  /** วันที่สินค้าพร้อมเช่าใหม่ (ร้านกำหนดตอนรับคืน) */
  next_available_date: string | null;
  created_at: string;
  updated_at: string;
};

/** One item row from BookingItem — sourced from booking.items[] in Phase 2. */
export type BookingItemDetail = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
  product_image: string | null;
  variant_id: string | null;
  size: string | null;
  unit_id: string | null;
  unit_code: string | null;
  rental_total: number;
  deposit: number;
};

/** Booking joined with dress + boutique for list/detail rendering. */
export type BookingDetail = Booking & {
  dress_name: string | null;
  dress_slug: string | null;
  dress_image: string | null;
  /** Size of the booked variant (e.g. "M"). Null for legacy bookings with no variantId. */
  dress_size: string | null;
  /** Total stock of the booked variant. Null for legacy bookings. */
  dress_variant_qty: number | null;
  boutique_name: string | null;
  boutique_slug: string | null;
  boutique_line_url: string | null;
  boutique_promptpay_id: string | null;
  boutique_bank_name: string | null;
  boutique_bank_account_number: string | null;
  boutique_bank_account_name: string | null;
  /** Shop's preferred default channel (used to default the accept-flow picker). */
  boutique_default_payment_method: "promptpay" | "bank" | null;
  boutique_instagram: string | null;
  boutique_facebook: string | null;
  boutique_twitter: string | null;
  boutique_tiktok: string | null;
  /** Refund tracking — populated from the booking's refund_* columns. */
  refund_status: string | null;
  refund_amount: number | null;
  refunded_at: string | null;
  refund_note: string | null;
  refund_slip_path: string | null;
  /** สภาพชุดตอนรับคืน: "complete" | "damaged" | "not_returned". Null = ยังไม่ได้รับคืน. */
  return_condition: string | null;
  /** รายละเอียดความเสียหายที่ร้านระบุ (เมื่อ return_condition = "damaged"). */
  return_damage_note: string | null;
  /** จำนวนมัดจำที่หัก (บาท) — ร้านกรอกตอน damaged. */
  deduction_amount: number | null;
  /** Private R2 key ของภาพบัตรประชาชนที่ใช้ในการจองนี้ (null = ไม่ได้แนบ). */
  id_card_path: string | null;
  /** Phase 2: item rows sourced from BookingItem child table. */
  items: BookingItemDetail[];
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  line_id: string | null;
  role: "customer" | "seller" | "admin";
  saved_dress_ids: string[];
  created_at: string;
  updated_at: string;
};

/* ---------------------------- analytics ----------------------------- */

/** Acquisition channel buckets — mirrors lib/attribution.ts Channel. */
export type Channel =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "line"
  | "google"
  | "youtube"
  | "twitter"
  | "email"
  | "referral"
  | "direct"
  | "other";

/** Visitor pageview event (general traffic analytics). */
export type PageView = {
  /** uuid (was bigint serial pre-restructure). */
  id: string;
  session_id: string | null;
  user_id: string | null;
  path: string | null;
  channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  province: string | null;
  country: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  created_at: string;
};

export type SubscriptionPlan = "free" | "boost" | "featured";
export type SubscriptionStatus = "active" | "past_due" | "cancelled" | "expired";

/** Shop paid-plan record (drives adoption-rate → revenue reporting). */
export type ShopSubscription = {
  id: string;
  shop_id: string | null;
  owner_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  amount: number; // THB per cycle
  billing_cycle: "monthly" | "yearly";
  started_at: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

// UI palette (mirrors PALETTE in demo's JS)
export const PALETTE: Record<Color, { c1: string; c2: string; c3: string }> = {
  rose: { c1: "#F4D7D2", c2: "#D9938E", c3: "#7C3D3F" },
  ivory: { c1: "#F4ECDA", c2: "#D4BD96", c3: "#6E5A38" },
  green: { c1: "#D9E5D4", c2: "#7FA887", c3: "#2B4A33" },
  black: { c1: "#3F3D3B", c2: "#1F1D1B", c3: "#0A0908" },
  navy: { c1: "#3E4A6E", c2: "#1F2A4A", c3: "#0E1733" },
  red: { c1: "#E5B0AB", c2: "#A33A36", c3: "#3E0807" },
  blue: { c1: "#D9E6F0", c2: "#7BA8C9", c3: "#23435C" },
  purple: { c1: "#E0D5EA", c2: "#9F86C0", c3: "#3D2E5C" },
};

export const COLOR_LABELS_TH: Record<Color, string> = {
  rose: "กุหลาบ",
  ivory: "งาช้าง",
  green: "เขียว",
  black: "ดำ",
  navy: "กรมท่า",
  red: "แดง",
  blue: "ฟ้า",
  purple: "ม่วง",
};

// NOTE: COLOR_SWATCH is shop-theme-only (Shop.coverColor). Product/browse swatches come from Tag.swatchHex.
export const COLOR_SWATCH: Record<Color, string> = {
  rose: "#D9A4A0",
  ivory: "#EFE3CC",
  green: "#2F6F4E",
  black: "#1A1815",
  navy: "#1F2A4A",
  red: "#B5302C",
  blue: "#7BA8C9",
  purple: "#A48BC4",
};
