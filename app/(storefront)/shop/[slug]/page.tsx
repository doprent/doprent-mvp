import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopCover } from "@/components/ProductArt";
import ProductCard from "@/components/ProductCard";
import LineButton from "@/components/LineButton";
import VerifiedBadge from "@/components/VerifiedBadge";
import StarRating from "@/components/StarRating";
import ReviewList from "@/components/ReviewList";
import ShopSocialLinks from "@/components/ShopSocialLinks";
import { getShopBySlug, listProductsByShop } from "@/lib/products";
import { getShopReviews } from "@/lib/reviews";
import { parseBusinessHours, formatBusinessHoursLines } from "@/lib/hours";

// ISR: revalidate every 5 minutes. Auth-aware UI (LineButton, SaveButton) is
// hydrated client-side via /api/me — no user session needed at render time.
export const revalidate = 300;

// Opt the dynamic [slug] segment into ISR (on-demand cached) instead of the
// default per-request dynamic rendering.
export function generateStaticParams() {
  return [];
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://doprent.com";

type Params = { slug: string };

/**
 * Next.js 14 hands the dynamic `[slug]` segment to us still percent-encoded
 * (e.g. a Thai slug arrives as "%E0%B8%8A..."). The DB stores the decoded
 * UTF-8 slug, so we must decode before querying or non-ASCII shops 404.
 * Guarded: a malformed `%` sequence falls back to the raw value, and an
 * already-decoded slug (no `%`) is returned unchanged.
 */
function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const b = await getShopBySlug(decodeSlug(params.slug));
  if (!b) return { title: "ไม่พบร้าน", robots: { index: false } };
  const url = `${SITE}/shop/${b.slug}`;
  const description = b.tag ?? `${b.name} · ${b.area_label}`;
  // og:image — shop logo first, then a product cover so a pasted shop link shows
  // the shop visually. URLs are already absolute (R2/MinIO public URL).
  const ogImage = b.logo_url ?? b.cover_image ?? undefined;
  return {
    title: b.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: b.name,
      description,
      url,
      type: "website",
      siteName: "DopRent",
      locale: "th_TH",
      images: ogImage ? [{ url: ogImage, alt: b.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: b.name,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function BoutiquePage({ params }: { params: Params }) {
  const b = await getShopBySlug(decodeSlug(params.slug));
  if (!b) notFound();
  const [dresses, reviews] = await Promise.all([
    listProductsByShop(b.id),
    getShopReviews(b.id),
  ]);

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "20px 0 8px" }}>
        <Link href="/shops">← ดูร้านทั้งหมด</Link>
      </div>

      {/* Cover */}
      <div style={{ aspectRatio: "5/2", borderRadius: 8, overflow: "hidden", margin: "28px 0 0" }}>
        <ShopCover color={b.cover_color} />
      </div>

      {/* Head */}
      <div
        className="shop-head"
        style={{
          padding: "24px 0 12px",
          display: "flex",
          alignItems: "end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>{b.area_label}</div>
          <h1 className="page-title" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {b.name}
            {b.verified ? <VerifiedBadge size="md" withLabel /> : null}
          </h1>
          <div style={{ fontSize: 14, color: "var(--ink-2)", maxWidth: 600, lineHeight: 1.55 }}>
            {b.tag}
          </div>
          {b.rating_count > 0 ? (
            <div style={{ marginTop: 8 }}>
              <StarRating avg={b.rating_avg} count={b.rating_count} size="md" />
            </div>
          ) : null}
        </div>
        <div className="shop-head-actions" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          {!b.is_open ? (
            <div
              style={{
                padding: "8px 14px",
                background: "var(--warn-soft)",
                border: "1px solid color-mix(in oklch, var(--warn) 30%, transparent)",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--warn)",
              }}
            >
              ⏸ ปิดชั่วคราว · ไม่รับจองขณะนี้
            </div>
          ) : null}
          {b.is_open ? (
            /* LineButton self-fetches isLoggedIn from /api/me; href is always
               passed so the URL is available once auth resolves client-side. */
            <LineButton
              href={b.line_url}
              label="ทักร้านทาง LINE"
              variant="primary"
              source="boutique_primary"
              shopId={b.id}
              loginNext={`/shop/${b.slug}`}
            />
          ) : null}
          {/* Social follow channels grouped with the LINE CTA so all contact
              links live together at the top (not scattered down the page). */}
          {(b.instagram || b.facebook || b.twitter || b.tiktok) ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>ช่องทางติดตามร้าน</div>
              <ShopSocialLinks
                instagram={b.instagram}
                facebook={b.facebook}
                twitter={b.twitter}
                tiktok={b.tiktok}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Info grid
          ⚠️ PRIVACY: never render b.address (full street/house number) here —
          this page is public. Show only b.area_label (district) so renters
          can gauge convenience without exposing the boutique's exact location.
          Full address stays in DB and is visible to the owner in /sell/edit
          and to admins in /admin/boutiques. The seller will share their
          pickup address with confirmed renters privately via LINE. */}
      <div
        className="boutique-info-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 24,
          padding: "18px 0",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          margin: "20px 0 28px",
        }}
      >
        <InfoCell k="ย่าน" v={b.area_label} />
        {b.hours ? (
          (() => {
            const schedule = parseBusinessHours(b.hours);
            if (schedule) {
              return (
                <InfoCell
                  k="เวลาทำการ"
                  v={
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {formatBusinessHoursLines(schedule).map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                  }
                />
              );
            }
            return <InfoCell k="เวลาทำการ" v={b.hours} />;
          })()
        ) : null}
        {b.since_year ? (
          <InfoCell k="เปิดบริการ" v={`ตั้งแต่ ${b.since_year}${b.owner_name ? ` · ดูแลโดย ${b.owner_name}` : ""}`} />
        ) : null}
      </div>

      {/* Story */}
      {b.story ? (
        <div
          style={{
            padding: "0 0 32px",
            maxWidth: 720,
            color: "var(--ink-2)",
            lineHeight: 1.7,
            fontSize: 15,
          }}
        >
          {b.story}
        </div>
      ) : null}

      {/* Listings */}
      <div
        className="section-head"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
          padding: "20px 0 14px",
          gap: 8,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>ชุดทั้งหมดจาก {b.name}</h2>
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{dresses.length} ชุด</span>
      </div>

      {dresses.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--ink-3)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 8,
          }}
        >
          ยังไม่มีชุดในร้านนี้ ทักร้านสอบถามได้
        </div>
      ) : (
        <div className="grid-3 products-grid-wide" style={{ gap: 20 }}>
          {dresses.map((d, i) => (
            <ProductCard key={d.id} product={d} variant={i} />
          ))}
        </div>
      )}

      {/* Reviews section */}
      <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--line)" }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 20 }}>รีวิวจากผู้เช่า</h2>
        <ReviewList reviews={reviews} />
      </div>
    </div>
  );
}

function InfoCell({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>{k}</div>
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>{v}</div>
    </div>
  );
}
