"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CartIcon from "./CartIcon";
import UserMenu from "./UserMenu";
import LocaleToggle from "./LocaleToggle";
import { t, type Locale } from "@/lib/i18n";

// ── /api/me response shape ────────────────────────────────────────────────────
export type MeData = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
    savedProductIds: string[];
  } | null;
  hasShop: boolean;
  savedCount: number;
  badges: { renter: number; seller: number };
  staff: { name: string } | null;
  siteLineUrl: string;
};

const ME_EMPTY: MeData = {
  user: null,
  hasShop: false,
  savedCount: 0,
  badges: { renter: 0, seller: 0 },
  staff: null,
  siteLineUrl: "https://line.me/R/ti/p/@doprent",
};

// Module-level singleton so all islands in one page share one fetch.
let _mePromise: Promise<MeData> | null = null;

export function getMe(): Promise<MeData> {
  if (typeof window === "undefined") return Promise.resolve(ME_EMPTY);
  if (!_mePromise) {
    _mePromise = fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<MeData>) : ME_EMPTY))
      .catch(() => ME_EMPTY);
  }
  return _mePromise;
}

// ── Locale helper (mirrors LocaleToggle's cookie read) ────────────────────────
function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return "th";
  const m = document.cookie.match(/(?:^|; )NEXT_LOCALE=([^;]*)/);
  return m && decodeURIComponent(m[1]) === "en" ? "en" : "th";
}

// ── Shared hook ───────────────────────────────────────────────────────────────
function useMeData() {
  const [data, setData] = useState<MeData>(ME_EMPTY);
  const [locale, setLocale] = useState<Locale>("th");

  useEffect(() => {
    setLocale(readLocaleCookie());
    getMe().then(setData);
  }, []);

  return { data, locale };
}

// =============================================================================
// HeaderTopBar — utility / auth strip above the main header row
// =============================================================================
export function HeaderTopBar() {
  const { data, locale } = useMeData();
  const { user, hasShop, staff, siteLineUrl } = data;

  const isAdmin = user?.role === "admin";
  const staffName = staff?.name?.split(" ")[0] ?? "พนักงาน";
  const fullName = user?.fullName ?? user?.email?.split("@")[0] ?? "";

  return (
    <div
      className="container hdr-top-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 28,
        fontSize: 12,
        borderBottom: "1px solid rgba(126,126,126,0.25)",
      }}
    >
      {/* Left — contextual nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {staff && (
          <Link href="/sell/dashboard" style={topLinkStyle}>
            {t("menu.shopDashboard", locale)}
          </Link>
        )}
        {!staff && !hasShop && !isAdmin && (
          <Link href="/sell/signup" style={topLinkStyle}>
            {t("nav.openShop", locale)}
          </Link>
        )}
        {hasShop && (
          <Link href="/sell/dashboard" style={topLinkStyle}>
            {t("menu.shopDashboard", locale)}
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin" style={topLinkStyle}>
            Admin
          </Link>
        )}
        <span style={topDividerStyle}>|</span>
        <span style={{ ...topLinkStyle, display: "inline-flex", alignItems: "center", gap: 4 }}>
          {t("nav.followUs", locale)}
          <a href="https://instagram.com/doprent" target="_blank" rel="noreferrer" style={topIconLinkStyle} aria-label="Instagram">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          </a>
          <a href={siteLineUrl} target="_blank" rel="noreferrer" style={topIconLinkStyle} aria-label="LINE">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738S0 4.935 0 10.304c0 4.813 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.309 14.244 24 12.382 24 10.304zm-16.5 3.146a.348.348 0 01-.348.348H4.848a.348.348 0 01-.348-.348V8.196a.348.348 0 01.348-.348h.696a.348.348 0 01.348.348v4.558h1.609a.348.348 0 01.348.348v.348zm2.088-.348a.348.348 0 01-.348.348h-.696a.348.348 0 01-.348-.348V8.196a.348.348 0 01.348-.348h.696a.348.348 0 01.348.348v4.906zm6.26 0a.348.348 0 01-.348.348h-.696a.348.348 0 01-.272-.131l-1.992-2.692v2.475a.348.348 0 01-.348.348h-.696a.348.348 0 01-.348-.348V8.196a.348.348 0 01.348-.348h.696c.104 0 .2.046.265.127l1.996 2.697V8.196a.348.348 0 01.348-.348h.696a.348.348 0 01.348.348v4.906zm3.152-3.862a.348.348 0 01-.348.348h-1.609v.984h1.609a.348.348 0 01.348.348v.696a.348.348 0 01-.348.348h-2.304a.348.348 0 01-.348-.348V8.196a.348.348 0 01.348-.348h2.304a.348.348 0 01.348.348v.696a.348.348 0 01-.348.348h-1.609v.984h1.609a.348.348 0 01.348.348v.068z"/></svg>
          </a>
        </span>
      </div>

      {/* Right — locale toggle + name / signup */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <LocaleToggle defaultLocale={locale} variant="navbar-top" />
        {user ? (
          <>
            <span style={topDividerStyle}>|</span>
            <span style={{ ...topLinkStyle, fontWeight: 500 }}>{fullName.split(" ")[0]}</span>
          </>
        ) : staff ? (
          <>
            <span style={topDividerStyle}>|</span>
            <span style={{ ...topLinkStyle, fontWeight: 500 }}>{staffName} · พนักงาน</span>
          </>
        ) : (
          <>
            <span style={topDividerStyle}>|</span>
            <Link href="/signup" style={topLinkStyle}>{t("nav.signup", locale)}</Link>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HeaderAuthIcons — bookmark, cart, user-menu / login button (middle-row right)
// =============================================================================
export function HeaderAuthIcons() {
  const { data, locale } = useMeData();
  const { user, hasShop, savedCount, badges, staff } = data;

  const isSeller = user?.role === "seller";
  const isAdmin = user?.role === "admin";
  const fullName = user?.fullName ?? user?.email?.split("@")[0] ?? "";
  const initials = fullName
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const staffName = staff?.name?.split(" ")[0] ?? "พนักงาน";

  if (user) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {/* Bookings icon */}
        <Link
          href="/account/bookings"
          aria-label={t("menu.myBookings", locale)}
          title={t("menu.myBookings", locale)}
          style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, color: "rgba(255,255,255,0.85)" }}
          className="hdr-icon-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          {badges.renter > 0 && (
            <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 999, background: "var(--danger)", color: "var(--on-dark)", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 4px", lineHeight: 1 }}>
              {badges.renter > 9 ? "9+" : badges.renter}
            </span>
          )}
        </Link>
        {/* Favorites icon */}
        <Link
          href="/account"
          aria-label={t("menu.savedItems", locale)}
          title={t("menu.savedItems", locale)}
          style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, color: "rgba(255,255,255,0.85)" }}
          className="hdr-icon-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={savedCount > 0 ? "rgba(255,255,255,0.85)" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </Link>
        {/* Cart icon (reads localStorage — client only) */}
        <CartIcon />
        <UserMenu
          fullName={fullName}
          email={user.email}
          isAdmin={isAdmin}
          isSeller={isSeller}
          hasShop={hasShop}
          initials={initials}
          savedCount={savedCount}
          renterBadge={badges.renter}
          sellerBadge={badges.seller}
          locale={locale}
        />
      </div>
    );
  }

  if (staff) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link
          href="/sell/dashboard"
          style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", background: "var(--on-dark)", padding: "0 16px", height: 38, display: "inline-flex", alignItems: "center", borderRadius: 6, whiteSpace: "nowrap", textDecoration: "none", border: "1px solid var(--on-dark)" }}
        >
          {t("menu.shopDashboard", locale)}
        </Link>
        <form action="/auth/signout" method="POST" style={{ display: "inline-flex" }}>
          <button
            type="submit"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--on-dark)", background: "transparent", padding: "0 12px", height: 38, display: "inline-flex", alignItems: "center", borderRadius: 6, whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.5)", cursor: "pointer" }}
          >
            {t("menu.signOut", locale)}
          </button>
        </form>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{staffName}</span>
      </div>
    );
  }

  // Logged-out state
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
      <Link
        href="/login"
        style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", background: "var(--on-dark)", padding: "0 16px", height: 38, display: "inline-flex", alignItems: "center", borderRadius: 6, whiteSpace: "nowrap", textDecoration: "none", border: "1px solid var(--on-dark)" }}
      >
        {t("nav.login", locale)}
      </Link>
    </div>
  );
}

// ── Shared style constants ────────────────────────────────────────────────────
const topLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.75)",
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontSize: 12,
};

const topDividerStyle: React.CSSProperties = {
  color: "#7E7E7E",
  fontSize: 11,
};

const topIconLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.75)",
  display: "inline-flex",
  alignItems: "center",
};
