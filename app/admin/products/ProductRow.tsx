"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setProductStatus, toggleProductFeatured } from "@/app/actions/admin";
import { ProductArt } from "@/components/ProductArt";
import StatusBadge from "@/components/StatusBadge";
import type { Color } from "@/lib/types";
import { productPath } from "@/lib/product-url";

type D = {
  id: string;
  slug: string;
  tag_code: string | null;
  name: string;
  designer: string | null;
  shop_name: string;
  size: string;
  color: string;
  price_per_day: number;
  status: string;
  available: boolean;
  featured: boolean;
  sponsored: boolean;
  images: string[];
  created_at: string;
  views: number;
};

export default function ProductRow({ d }: { d: D }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setWorking(true);
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.error ?? "ผิดพลาด");
    setWorking(false);
    router.refresh();
  }

  const hasImg = Array.isArray(d.images) && d.images.length > 0;

  const thaiDate = new Date(d.created_at).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <tr style={{ borderBottom: "1px solid var(--line)" }}>
        {/* สินค้า */}
        <td style={tdStyle}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div
              style={{
                width: 48,
                height: 60,
                borderRadius: 4,
                overflow: "hidden",
                background: "var(--bg)",
                flexShrink: 0,
              }}
            >
              {hasImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.images[0]}
                  alt={d.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <ProductArt color={d.color as Color} variant={0} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <Link
                href={d.tag_code ? productPath({ slug: d.slug, tag_code: d.tag_code }) : `/product/${d.slug}`}
                target="_blank"
                style={{ fontWeight: 600, fontSize: 13 }}
              >
                {d.name}
              </Link>
              {d.tag_code ? (
                <div
                  style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}
                >
                  {d.tag_code}
                </div>
              ) : null}
              {error ? (
                <div
                  style={{
                    color: "var(--danger)",
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </td>

        {/* ร้าน — prominent/bold so admin can tell which shop a product belongs to */}
        <td style={tdStyle}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
            {d.shop_name}
          </span>
        </td>

        {/* ราคา/วัน */}
        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
          ฿{d.price_per_day.toLocaleString()}
        </td>

        {/* สถานะ */}
        <td style={tdStyle}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <StatusBadge
              text={d.status}
              tone={
                d.status === "live"
                  ? "success"
                  : d.status === "rejected"
                  ? "danger"
                  : "warn"
              }
            />
            {!d.available ? (
              <StatusBadge text="ปิด" tone="neutral" />
            ) : null}
            {d.featured ? (
              <StatusBadge text="★ Featured" tone="warn" />
            ) : null}
            {d.sponsored ? (
              <StatusBadge text="★ Sponsored" tone="info" />
            ) : null}
          </div>
          <div
            style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}
          >
            {d.views} views
          </div>
        </td>

        {/* สร้างเมื่อ */}
        <td
          style={{
            ...tdStyle,
            whiteSpace: "nowrap",
            color: "var(--ink-3)",
            fontSize: 12,
          }}
        >
          {thaiDate}
        </td>

        {/* จัดการ */}
        <td style={{ ...tdStyle, textAlign: "right" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              alignItems: "flex-end",
            }}
          >
            {d.status === "pending" ? (
              <>
                <button
                  type="button"
                  className="btn btn-dark"
                  style={btnSm}
                  disabled={working}
                  onClick={() => act(() => setProductStatus(d.id, "live"))}
                >
                  ✓ Approve
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{
                    ...btnSm,
                    color: "var(--danger)",
                    borderColor: "var(--danger)",
                  }}
                  onClick={() => setShowReject((s) => !s)}
                >
                  Reject
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-outline"
                style={btnSm}
                disabled={working}
                onClick={() => act(() => setProductStatus(d.id, "pending"))}
              >
                กลับ pending
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline"
              style={btnSm}
              disabled={working}
              onClick={() =>
                act(() => toggleProductFeatured(d.id, !d.featured))
              }
            >
              {d.featured ? "ถอด ★" : "ติด ★"}
            </button>
          </div>
        </td>
      </tr>

      {showReject ? (
        <tr
          style={{
            borderBottom: "1px solid var(--line)",
            background: "var(--bg)",
          }}
        >
          <td colSpan={6} style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เหตุผลที่ปฏิเสธ"
                className="input"
                style={{ flex: 1, minWidth: 200 }}
              />
              <button
                type="button"
                className="btn btn-dark"
                style={{
                  background: "var(--danger)",
                  borderColor: "var(--danger)",
                  padding: "7px 12px",
                  fontSize: 12,
                }}
                disabled={working}
                onClick={() =>
                  act(() => setProductStatus(d.id, "rejected", reason))
                }
              >
                ยืนยัน
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const tdStyle: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
const btnSm: React.CSSProperties = { padding: "5px 10px", fontSize: 11, minWidth: 90 };
