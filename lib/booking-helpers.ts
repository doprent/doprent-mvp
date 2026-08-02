import { parseBusinessHours } from "@/lib/hours";
import { todayBkk } from "@/lib/date-th";

/** Shared result type for all booking server actions. */
export type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Minutes from "now" until the shop closes today, in the Asia/Bangkok wall
 *  clock. null when the shop is closed today or hours are unparseable. Negative
 *  when already past closing. Used to gate same-day express dispatch server-side
 *  (the client computes the same thing for the UI). */
export function minutesUntilCloseBkk(hours: ReturnType<typeof parseBusinessHours>): number | null {
  if (!hours) return null;
  const dow = new Date(`${todayBkk()}T00:00:00Z`).getUTCDay();
  const today = hours[dow];
  if (!today?.open) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const [closeH, closeM] = today.to.split(":").map(Number);
  return closeH * 60 + closeM - (hh * 60 + mm);
}
