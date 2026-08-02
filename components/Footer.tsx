import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { version } from "@/package.json";
import { getSiteSettings, SETTING_KEYS } from "@/lib/site-settings";
import LocaleToggle from "./LocaleToggle";
import FooterVariantSwitch from "./FooterVariantSwitch";

// Locale is not read server-side here (that would call cookies() and make
// every page dynamic). Footer text defaults to Thai; LocaleToggle reads the
// NEXT_LOCALE cookie client-side and re-renders if the user switches.
const STATIC_LOCALE: Locale = "th";

export default async function Footer() {
  const locale = STATIC_LOCALE;
  const year = new Date().getFullYear();
  const settings = await getSiteSettings();
  const lineUrl = settings[SETTING_KEYS.LINE_URL];
  const lineDisplay = settings[SETTING_KEYS.LINE_DISPLAY];
  const contactEmail = settings[SETTING_KEYS.CONTACT_EMAIL];

  return (
    <FooterVariantSwitch
      defaultFooter={<DefaultFooter locale={locale} year={year} lineUrl={lineUrl} lineDisplay={lineDisplay} contactEmail={contactEmail} />}
      sellerFooter={<SellerFooter locale={locale} year={year} lineUrl={lineUrl} lineDisplay={lineDisplay} contactEmail={contactEmail} />}
      adminFooter={<AdminFooter year={year} />}
    />
  );
}

/* ── Default: public / renter routes ─────────────────────────────── */

function DefaultFooter({ locale, year, lineUrl, lineDisplay, contactEmail }: { locale: Locale; year: number; lineUrl: string; lineDisplay: string; contactEmail: string }) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        padding: "40px 0 16px",
        background: "var(--surface)",
        marginTop: 60,
      }}
    >
      <div className="container footer-grid" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 10 }}>DopRent</div>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
            {t("footer.tagline", locale)}
          </p>
        </div>
        <div>
          <h5 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{t("footer.shop", locale)}</h5>
          <FooterLink href="/">{t("footer.allDresses", locale)}</FooterLink>
          <FooterLink href="/?occasion=engagement">{t("footer.engagement", locale)}</FooterLink>
          <FooterLink href="/?occasion=wedding">{t("footer.wedding", locale)}</FooterLink>
          <FooterLink href="/?occasion=cocktail">{t("footer.cocktail", locale)}</FooterLink>
          <FooterLink href="/?occasion=work">{t("footer.workDress", locale)}</FooterLink>
        </div>
        <div>
          <h5 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{t("footer.forShops", locale)}</h5>
          <FooterLink href="/sell">{t("footer.openShop", locale)}</FooterLink>
          <FooterLink href="/sell/dashboard">{t("footer.myDashboard", locale)}</FooterLink>
          <FooterLink href="/shops">{t("footer.allBoutiques", locale)}</FooterLink>
        </div>
        <div>
          <h5 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{t("footer.contact", locale)}</h5>
          <a
            href={lineUrl}
            target="_blank"
            rel="noreferrer noopener"
            style={{ display: "block", fontSize: 13, color: "var(--ink-2)", padding: "4px 0" }}
          >
            LINE {lineDisplay}
          </a>
          <a href={`mailto:${contactEmail}`} style={{ display: "block", fontSize: 13, color: "var(--ink-2)", padding: "4px 0" }}>
            {contactEmail}
          </a>
        </div>
      </div>
      <div
        className="container footer-bottom"
        style={{
          borderTop: "1px solid var(--line)",
          paddingTop: 14,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          fontSize: 12,
          color: "var(--ink-3)",
          textAlign: "center",
        }}
      >
        <span>© {year} DopRent · Bangkok · v{version}</span>
        <span aria-hidden="true">·</span>
        <Link href="/privacy" style={{ color: "var(--ink-3)" }}>นโยบายความเป็นส่วนตัว</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" style={{ color: "var(--ink-3)" }}>เงื่อนไขการใช้บริการ</Link>
        <span aria-hidden="true">·</span>
        <LocaleToggle defaultLocale={locale} variant="footer-inline" />
      </div>
    </footer>
  );
}

/* ── Seller: /sell/dashboard area ────────────────────────────────── */

function SellerFooter({ locale, year, lineUrl, lineDisplay, contactEmail }: { locale: Locale; year: number; lineUrl: string; lineDisplay: string; contactEmail: string }) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        padding: "16px 0",
        background: "var(--surface)",
        marginTop: 60,
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "8px 22px",
          flexWrap: "wrap",
          fontSize: 13,
        }}
      >
        <Link href="/sell/dashboard" style={{ color: "var(--ink-2)" }}>
          {t("footer.myDashboard", locale)}
        </Link>
        <Link href="/" style={{ color: "var(--ink-2)" }}>
          {t("footer.allDresses", locale)}
        </Link>
        <a href={lineUrl} target="_blank" rel="noreferrer noopener" style={{ color: "var(--ink-2)" }}>
          LINE {lineDisplay}
        </a>
        <a href={`mailto:${contactEmail}`} style={{ color: "var(--ink-2)" }}>
          {contactEmail}
        </a>
        <Link href="/privacy" style={{ color: "var(--ink-2)" }}>
          {t("footer.privacy", locale)}
        </Link>
        <Link href="/terms" style={{ color: "var(--ink-2)" }}>
          {t("footer.terms", locale)}
        </Link>
      </div>
      <div
        className="container"
        style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}
      >
        © {year} DopRent · v{version}
      </div>
    </footer>
  );
}

/* ── Admin: /admin area ──────────────────────────────────────────── */

function AdminFooter({ year }: { year: number }) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        padding: "14px 0",
        background: "var(--surface)",
        marginTop: 60,
      }}
    >
      <div className="container" style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>
        © {year} DopRent · v{version}
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{ display: "block", fontSize: 13, color: "var(--ink-2)", padding: "4px 0" }}
    >
      {children}
    </Link>
  );
}
