import { cache } from "react";
import { db } from "@/lib/db";

export const SETTING_KEYS = {
  LINE_URL: "line_url",
  CONTACT_EMAIL: "contact_email",
  LINE_DISPLAY: "line_display",
} as const;

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.LINE_URL]: "https://line.me/R/ti/p/@doprent",
  [SETTING_KEYS.CONTACT_EMAIL]: "hello@doprent.com",
  [SETTING_KEYS.LINE_DISPLAY]: "@doprent",
};

export const getSiteSettings = cache(async () => {
  const map: Record<string, string> = { ...DEFAULTS };
  try {
    const rows = await db.siteSetting.findMany();
    for (const r of rows) map[r.key] = r.value;
  } catch {
    // Fall back to defaults when DB is unreachable (e.g. during static prerender
    // at build time). The real values are served at runtime via ISR/dynamic pages.
  }
  return map;
});

export async function getSetting(key: string): Promise<string> {
  const all = await getSiteSettings();
  return all[key] ?? "";
}
