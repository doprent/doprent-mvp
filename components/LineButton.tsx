"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getMe } from "./HeaderUserSlot";

type Variant = "primary" | "secondary" | "inline";

type Props = {
  /** LINE deep link. Only used when isLoggedIn === true; ignored otherwise. */
  href?: string | null;
  label: string;
  variant?: Variant;
  source?: string;
  productId?: string;
  shopId?: string;
  fullWidth?: boolean;
  /**
   * Whether the viewer is signed in. Strictly gates contact: when false,
   * the button renders as a login-redirect link and the LINE URL is
   * never sent to the browser (caller should pass href={null} for anon).
   */
  isLoggedIn?: boolean;
  /** Where to return after login. Required when !isLoggedIn. */
  loginNext?: string;
};

/**
 * LineButton — primary contact CTA.
 *
 * IMPORTANT (per product requirement): anonymous users may NOT initiate
 * contact with boutiques via LINE. When `isLoggedIn` is false, this
 * component:
 *   1) Does NOT render the LINE href anywhere in the DOM.
 *   2) Replaces the LINE click with a Next.js Link to /login?next=...
 *   3) The caller should also pass href={null} so the URL never reaches
 *      the client JS bundle in the first place.
 *
 * After login the user lands back on loginNext and the button works normally.
 */
export default function LineButton({
  href,
  label,
  variant = "primary",
  source,
  productId,
  shopId,
  fullWidth,
  isLoggedIn,
  loginNext,
}: Props) {
  // Self-fetch login state when not provided by server (ISR/cached pages).
  const [resolvedIsLoggedIn, setResolvedIsLoggedIn] = useState(isLoggedIn ?? false);
  useEffect(() => {
    if (isLoggedIn !== undefined) {
      setResolvedIsLoggedIn(isLoggedIn);
      return;
    }
    getMe().then((d) => setResolvedIsLoggedIn(!!d.user));
  }, [isLoggedIn]);

  // useCallback must always run (rules of hooks) — kept outside the branch.
  const trackClick = useCallback(() => {
    try {
      const payload = JSON.stringify({ source, product_id: productId, shop_id: shopId });
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon(
          "/api/track",
          new Blob([payload], { type: "application/json" }),
        );
      }
    } catch {
      /* noop */
    }
  }, [source, productId, shopId]);

  // "inline" is a low-visual-weight link with icon — used when LineButton
  // is a SECONDARY action (e.g., "ask shop") that shouldn't compete with
  // a primary date-picker booking CTA above/below it.
  const isInline = variant === "inline";
  const buttonClass = isInline
    ? "" // no btn class — we want a text-link, not a button shape
    : `btn ${variant === "primary" ? "btn-line" : "btn-outline"}`;
  const buttonStyle = isInline
    ? ({
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color: "var(--line-green)",
        padding: "4px 0",
        textDecoration: "none",
      } as React.CSSProperties)
    : ({
        ...(fullWidth ? { width: "100%" } : {}),
        ...(variant === "primary" ? { fontWeight: 600, padding: "14px" } : {}),
      } as React.CSSProperties);

  // --- Anonymous path: never expose the LINE href ---
  if (!resolvedIsLoggedIn || !href) {
    const next = loginNext || "/";
    return (
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        aria-label="เข้าสู่ระบบเพื่อทักร้านทาง LINE"
        className={buttonClass}
        style={buttonStyle}
      >
        <LineIcon />
        เข้าสู่ระบบเพื่อทักร้าน
      </Link>
    );
  }

  // --- Authenticated path: real LINE deep link ---
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={trackClick}
      aria-label={`${label} (เปิดหน้าต่าง LINE ใหม่)`}
      className={buttonClass}
      style={buttonStyle}
    >
      <LineIcon />
      {label}
    </a>
  );
}

function LineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}
