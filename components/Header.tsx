import { Suspense } from "react";
import Link from "next/link";
import Logo from "./Logo";
import NavbarSearch from "./NavbarSearch";
import DetailsAutoClose from "./DetailsAutoClose";
import { HeaderTopBar, HeaderAuthIcons } from "./HeaderUserSlot";

// ── Static server shell ───────────────────────────────────────────────────────
// This component reads NO cookies, calls no auth() / getCurrentUser(), and
// makes no per-request DB queries. That keeps every route that renders this
// header cacheable (ISR / static) by default.
//
// Auth-aware chrome (top bar, user icons, user menu, staff UI) is delegated to
// <HeaderTopBar> and <HeaderAuthIcons>, which are 'use client' components that
// fetch /api/me after hydration. A <Suspense> fallback is rendered during SSR
// so the HTML is complete without a loading spinner.
//
// Locale: category nav defaults to Thai (the vast majority of users). The
// client islands read the NEXT_LOCALE cookie themselves after hydration —
// same approach LocaleToggle already uses.

export default function Header() {
  return (
    <header
      className="sticky top-0 z-40 bg-[color-mix(in_oklch,var(--accent)_97%,transparent)] backdrop-blur-[12px] border-b border-b-[color-mix(in_oklch,var(--accent)_50%,transparent)] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.25),0_1px_3px_rgba(0,0,0,0.1)]"
    >
      {/* ═══ TOP ROW ═══ (28px — utility links, client island) */}
      <Suspense fallback={<div style={{ height: 28, borderBottom: "1px solid rgba(126,126,126,0.25)" }} />}>
        <HeaderTopBar />
      </Suspense>

      {/* ═══ MIDDLE ROW ═══ (48px — logo + search + profile) */}
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          height: 52,
        }}
      >
        {/* Logo — left (static) */}
        <Link
          href="/"
          aria-label="doprent"
          style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, color: "var(--on-dark)" }}
        >
          <Logo size={26} />
        </Link>

        {/* Search — center, desktop only.
            NavbarSearch uses useSearchParams() → must be wrapped in Suspense
            so static pages prerender without a CSR-bailout error. */}
        <div className="hidden md:block" style={{ flex: 1, minWidth: 0, maxWidth: 620 }}>
          <Suspense fallback={<div style={{ height: 36, borderRadius: 999, background: "rgba(255,255,255,0.12)" }} />}>
            <NavbarSearch locale="th" />
          </Suspense>
        </div>

        {/* Auth icons — right (client island) */}
        <Suspense fallback={<HeaderAuthIconsSkeleton />}>
          <HeaderAuthIcons />
        </Suspense>
      </div>

      {/* ═══ MOBILE SEARCH ROW ═══ */}
      <div className="block md:hidden border-t border-t-[rgba(255,255,255,0.08)] px-4 py-2">
        <Suspense fallback={<div style={{ height: 36, borderRadius: 999, background: "rgba(255,255,255,0.12)" }} />}>
          <NavbarSearch locale="th" />
        </Suspense>
      </div>

      {/* ═══ BOTTOM ROW ═══ (category nav — fully static, no auth/locale reads) */}
      <div
        style={{
          background: "rgba(0,0,0,0.10)",
          borderTop: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div
          className="container hdr-cats"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minHeight: 46,
            overflow: "visible",
          }}
        >
          {/* Product-type dropdown */}
          <details className="hdr-cat-details" style={{ position: "relative", flexShrink: 0 }}>
            <summary className="hdr-cat-trigger" style={{ ...catTriggerStyle, listStyle: "none" }}>
              <span className="hdr-burger" aria-hidden="true">
                <span /><span /><span />
              </span>
              หมวดหมู่ทั้งหมด
              <span className="hdr-cat-caret" style={{ fontSize: 9, opacity: 0.85 }}>▾</span>
            </summary>
            <div className="hdr-cat-dropdown" style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              minWidth: 230,
              boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
              zIndex: 50,
              padding: "8px 0",
            }}>
              {PRODUCT_CATEGORIES.map((cat) => (
                <div key={cat.key}>
                  {cat.active ? (
                    <>
                      <div style={{ ...catDropdownItemStyle, fontWeight: 700, cursor: "default", paddingBottom: 2, color: "var(--ink-3)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {cat.th}
                      </div>
                      <Link href={cat.href} className="hdr-dd-item" style={{ ...catDropdownItemStyle, paddingLeft: 24, fontWeight: 600 }}>
                        ทั้งหมด
                      </Link>
                      {cat.subs.map((sub) => (
                        <Link key={sub.key} href={sub.href} className="hdr-dd-item" style={{ ...catDropdownItemStyle, paddingLeft: 24 }}>
                          {sub.th}
                        </Link>
                      ))}
                    </>
                  ) : (
                    <span style={{ ...catDropdownItemStyle, opacity: 0.4, cursor: "default", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {cat.th}
                      <span style={comingSoonBadge}>Soon</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </details>
          <DetailsAutoClose selector="details.hdr-cat-details" />

          <span style={{ width: 1, height: 18, background: "#7E7E7E", flexShrink: 0, margin: "0 2px", opacity: 0.5 }} />

          {/* Occasion quick-links */}
          <nav className="hdr-quick" style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto", flex: 1, minWidth: 0 }}>
            <span style={{ ...catLinkStyle, color: "rgba(255,255,255,0.55)", fontWeight: 500, padding: "4px 6px 4px 4px", cursor: "default" }}>
              ตามโอกาส:
            </span>
            {QUICK_OCCASIONS.map((q) => (
              <Link key={q.key} href={q.href} className="hdr-cat-link" style={catLinkStyle}>
                {q.th}
              </Link>
            ))}
          </nav>

          {/* Shops CTA */}
          <Link href="/shops" className="hdr-cat-link hdr-shops-link" style={{ ...catLinkStyle, flexShrink: 0, fontWeight: 600 }}>
            ร้านค้าทั้งหมด →
          </Link>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        header details > div a { color: var(--ink) !important; }
        header details > div button { color: var(--ink) !important; }
        .hdr-sell-link:hover { color: var(--on-dark) !important; }
        .hdr-top-row a:hover { color: var(--on-dark) !important; }
        .hdr-trend-link:hover { color: var(--on-dark) !important; }
        .hdr-trending::-webkit-scrollbar { display: none; }
        .hdr-cat-link:hover { background: rgba(255,255,255,0.12); }
        .hdr-cat-active { background: rgba(255,255,255,0.18) !important; color: var(--on-dark) !important; }
        .hdr-cat-details > summary::-webkit-details-marker { display: none; }
        .hdr-cat-details > summary::marker { content: ""; }
        .hdr-cat-dropdown a:hover { background: var(--bg-hover, rgba(0,0,0,0.04)); }
        .hdr-cat-trigger:hover { background: rgba(255,255,255,0.26) !important; }
        .hdr-cat-details[open] .hdr-cat-trigger { background: rgba(255,255,255,0.30) !important; }
        .hdr-cat-details[open] .hdr-cat-caret { transform: rotate(180deg); }
        .hdr-burger { display: inline-flex; flex-direction: column; justify-content: center; gap: 3px; width: 14px; }
        .hdr-burger span { display: block; height: 2px; border-radius: 2px; background: currentColor; }
        .hdr-quick { scrollbar-width: none; }
        .hdr-quick::-webkit-scrollbar { display: none; }
        .hdr-shops-link:hover { background: rgba(255,255,255,0.12); }
        .hdr-icon-btn:hover { background: rgba(255,255,255,0.12); }
        @media(max-width:768px) {
          .hdr-top-row { display: none !important; }
          .hdr-quick { -webkit-overflow-scrolling: touch; }
        }
      ` }} />
    </header>
  );
}

// ── Skeleton for auth icons during SSR / Suspense ────────────────────────────
function HeaderAuthIconsSkeleton() {
  return (
    <div style={{ width: 80, height: 38, flexShrink: 0 }} aria-hidden="true" />
  );
}

// ── Static data (no locale read — default Thai) ───────────────────────────────
const PRODUCT_CATEGORIES = [
  {
    key: "clothing", th: "เสื้อผ้า / ชุด", href: "/#results", active: true,
    subs: [
      { key: "dress", th: "ชุด", href: "/#results" },
      { key: "suit", th: "สูท", href: "/?type=suit" },
    ],
  },
  { key: "bags", th: "กระเป๋า", href: "#", active: false, subs: [] },
  { key: "accessories", th: "เครื่องประดับ", href: "#", active: false, subs: [] },
  { key: "shoes", th: "รองเท้า", href: "#", active: false, subs: [] },
  { key: "electronics", th: "อิเล็กทรอนิกส์", href: "#", active: false, subs: [] },
  { key: "cameras", th: "กล้อง", href: "#", active: false, subs: [] },
];

const QUICK_OCCASIONS = [
  { key: "wedding", th: "งานแต่ง", href: "/?occasion=wedding" },
  { key: "evening", th: "ราตรี",   href: "/?occasion=evening" },
  { key: "thai",    th: "ชุดไทย",  href: "/?occasion=thai" },
  { key: "suit",    th: "ชุดสูท",  href: "/?type=suit" },
];

const catTriggerStyle: React.CSSProperties = {
  color: "var(--on-dark)",
  background: "rgba(255,255,255,0.16)",
  textDecoration: "none",
  fontSize: 12.5,
  fontWeight: 600,
  padding: "7px 14px",
  borderRadius: 999,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
  transition: "background 0.15s",
};

const catLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.85)",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
  padding: "4px 12px",
  borderRadius: 999,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  transition: "background 0.15s",
};

const comingSoonBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  background: "rgba(255,255,255,0.2)",
  color: "rgba(255,255,255,0.8)",
  padding: "1px 5px",
  borderRadius: 999,
  marginLeft: 4,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

const catDropdownItemStyle: React.CSSProperties = {
  display: "block",
  padding: "8px 16px",
  fontSize: 13,
  color: "var(--ink)",
  textDecoration: "none",
  whiteSpace: "nowrap",
};
