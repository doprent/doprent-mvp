import Link from "next/link";
import ProductCardImage from "./ProductCardImage";
import SaveButton from "./SaveButton";
import VerifiedBadge from "./VerifiedBadge";
import DistanceBadge from "./DistanceBadge";
import StarRating from "./StarRating";
import { hasMultipleRates, startingPerDay } from "@/lib/pricing";
import { type Product } from "@/lib/types";
import { productPath } from "@/lib/product-url";

type Props = {
  product: Product;
  variant?: number;
  /** Set of product IDs the current user has saved. */
  savedSet?: Set<string>;
  /** Whether the viewer is logged in (affects save button behavior). */
  isLoggedIn?: boolean;
};

export default function ProductCard({ product, variant = 0, savedSet, isLoggedIn }: Props) {
  const hasImg = Array.isArray(product.images) && product.images.length > 0;
  const imgSrc = hasImg ? product.images[0] : null;
  const isSaved = savedSet ? savedSet.has(product.id) : false;

  return (
    <div className="card card-surface product-card" style={{ position: "relative" }}>
      <Link href={product.tag_code ? productPath({ slug: product.slug, tag_code: product.tag_code }) : `/product/${product.slug}`} style={{ display: "block", cursor: "pointer" }}>
        <div
          className="pc-media media"
          style={{
            aspectRatio: "3/4",
            position: "relative",
          }}
        >
          <ProductCardImage src={imgSrc} alt={product.name} color={product.color ?? "rose"} variant={variant} />
          <SaveButton productId={product.id} initialSaved={isSaved} isLoggedIn={isLoggedIn} />
          {/* Online badge — only shown when shop is open */}
          {product.shop_is_open && (
            <span
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(6px)",
                color: "var(--on-dark)",
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 7px",
                borderRadius: 6,
                lineHeight: 1,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--success)",
                  flexShrink: 0,
                }}
              />
              Online
            </span>
          )}
        </div>
        <div className="pc-body">
          {/* Top row: brand (left) + distance (right). */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                fontWeight: 500,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {product.designer || "—"}
            </span>
            {product.area_key ? (
              <DistanceBadge areaKey={product.area_key} style={{ flexShrink: 0, verticalAlign: "middle" }} />
            ) : null}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>
            {product.name}
          </div>
          {/* Shop line — below the product name. Smaller & grey, with trust badges. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 5,
              fontSize: 11,
              color: "var(--ink-3)",
              marginBottom: 4,
            }}
          >
            <span style={{ fontWeight: 500 }}>{product.shop_name}</span>
            {product.shop_verified ? (
              <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
                <VerifiedBadge size="sm" />
              </span>
            ) : null}
            {product.shop_rating_count ? (
              <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
                <StarRating avg={product.shop_rating_avg ?? null} count={product.shop_rating_count} size="sm" />
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", fontSize: 14 }}>
              {hasMultipleRates(product.price_tiers) ? (
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)" }}>เริ่ม </span>
              ) : null}
              ฿{startingPerDay(product.price_tiers, product.price_per_day).toLocaleString()}{" "}
              <span style={{ color: "var(--ink-3)", fontSize: 12, fontWeight: 400 }}>/วัน</span>
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
