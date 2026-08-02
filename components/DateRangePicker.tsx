"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { priceForNights } from "@/lib/pricing";
import { type PriceTier, sizeLabel } from "@/lib/types";
import { remainingForRange } from "@/lib/booking-policy";
import { fmtThai, MONTHS_TH_FULL, DAYS_TH } from "@/lib/date-th";
import { useCart } from "@/lib/cart";
import { getMe } from "./HeaderUserSlot";
/** A size variant available for booking on the product. */
export type VariantOption = {
  id: string;
  size: string;
  quantity: number;
  pricePerDay: number;
  deposit: number;
  available: boolean;
  /** Per-variant unavailable dates (computed by the server). */
  unavailable?: string[];
  /** Per-day booked count keyed by YYYY-MM-DD (same blocking statuses + buffer as the calendar). */
  dailyBooked?: Record<string, number>;
};

type Props = {
  /** Dress display name. */
  dressName: string;
  /** Boutique name for the LINE message. */
  boutiqueName: string;
  /** Public URL of the dress detail page (so seller can preview it). */
  dressPageUrl?: string;
  /** First image URL of the dress (sent as a link in LINE message). */
  dressImageUrl?: string;
  /** Base/fallback per-day rental price (THB). */
  pricePerDay?: number;
  /** Optional duration-based pricing tiers (overrides flat per-day when set). */
  priceTiers?: PriceTier[] | null;
  /** Deposit (THB). */
  deposit?: number;
  /** Unavailable dates as YYYY-MM-DD strings. Renter can't pick a range overlapping these. */
  blackouts?: string[];
  /** Combined unavailable date set (blackouts + bookings + closed days). Renter can't pick a range overlapping these. */
  unavailable?: string[];
  /** Minimum days in advance the rental must start. */
  leadTimeDays?: number;
  /**
   * One-way standard-shipping transit days. Applied before the start (outbound
   * leg) and/or after the end (return leg) depending on the chosen methods.
   * Express collapses its leg to 0. The picker scans the same buffered window
   * the server's oversell guard does, so a range can't pass here yet be rejected.
   */
  bufferDaysBefore?: number;
  /** One-way standard return transit days (same as bufferDaysBefore for symmetry). */
  bufferDaysAfter?: number;
  /** Cleaning/preparation days always reserved AFTER the end date, regardless of shipping method. */
  cleaningDays?: number;
  /** Minimum rental length in days. */
  minRentalDays?: number;
  /** Maximum rental length in days; null = unlimited. */
  maxRentalDays?: number | null;
  /** Optional dress ID to be tracked in /api/track when user clicks LINE. */
  productId?: string;
  shopId?: string;
  /** Optional dress tag code (e.g. internal SKU) to include in LINE message */
  dressTagCode?: string;
  /** Shop name (used by the cart). */
  shopName?: string;
  /** Product display name (used by the cart). */
  productName?: string;
  /** Product slug (used by the cart link). */
  productSlug?: string;
  /** First product image URL (used by the cart thumbnail). */
  productImage?: string | null;
  /**
   * Strict contact gate. When false (default), the LINE booking button
   * is replaced with a login redirect and the LINE URL is never used.
   * Caller should also pass lineUrl="" for anon to avoid leaking it.
   */
  isLoggedIn?: boolean;
  /** Where to redirect back after login. Required when !isLoggedIn. */
  loginNext?: string;
  /**
   * Available size variants for this product. When provided, shows a size
   * selector above the calendar. The chosen variant's pricePerDay/deposit
   * and unavailable dates override the product-level ones.
   */
  variants?: VariantOption[];
  /** Today's shop closing time as "HH:MM" (e.g. "19:00"). Null when shop is closed today or hours unknown. */
  shopClosingTime?: string | null;
  /**
   * Whether the shop has real weekly business hours configured. When false the
   * shop never set hours, so same-day express is allowed (fail-open) rather than
   * blocked. When true and shopClosingTime is null, the shop is closed today
   * (express blocked). Mirrors the server rule in createBooking.
   */
  shopHoursConfigured?: boolean;
  /** Whether the shop is currently open (manual toggle). */
  shopIsOpen?: boolean | null;
};

/** Days between two YYYY-MM-DD dates, inclusive. Returns 0 if either is empty/invalid or end < start. */
function nightsBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Inclusive list of YYYY-MM-DD between start and end (assumes start ≤ end). */
function rangeDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const result: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  const cur = new Date(s);
  while (cur <= e) {
    result.push(isoOf(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/** The `count` transit days immediately BEFORE `start` (YYYY-MM-DD, oldest first). */
function bufferDatesBefore(start: string, count: number): string[] {
  if (!start || count <= 0) return [];
  const s = new Date(start);
  if (isNaN(s.getTime())) return [];
  const result: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(s);
    d.setDate(d.getDate() - i);
    result.push(isoOf(d));
  }
  return result;
}

/** The `count` buffer days immediately AFTER `end` (YYYY-MM-DD, soonest first). */
function bufferDatesAfter(end: string, count: number): string[] {
  if (!end || count <= 0) return [];
  const e = new Date(end);
  if (isNaN(e.getTime())) return [];
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(e);
    d.setDate(d.getDate() + i);
    result.push(isoOf(d));
  }
  return result;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return isoOf(d);
})();


/**
 * Renter-side date range picker. Blocks dates the seller has marked as unavailable
 * and pre-fills a LINE message with image, link, dates and price.
 */
export default function DateRangePicker({
  dressName,
  boutiqueName,
  dressPageUrl,
  dressImageUrl,
  pricePerDay,
  priceTiers,
  deposit,
  blackouts = [],
  unavailable = [],
  leadTimeDays = 0,
  bufferDaysBefore = 0,
  bufferDaysAfter = 0,
  cleaningDays = 1,
  minRentalDays = 1,
  maxRentalDays = null,
  productId,
  shopId,
  dressTagCode,
  isLoggedIn,
  variants,
  shopClosingTime,
  shopHoursConfigured = false,
  shopIsOpen,
  shopName,
  productName,
  productSlug,
  productImage,
}: Props) {
  // When isLoggedIn is not provided by the server (ISR pages), self-fetch from
  // /api/me. The shared getMe() singleton ensures only one fetch per page.
  const [resolvedIsLoggedIn, setResolvedIsLoggedIn] = useState(isLoggedIn ?? false);
  useEffect(() => {
    if (isLoggedIn !== undefined) {
      setResolvedIsLoggedIn(isLoggedIn);
      return;
    }
    getMe().then((d) => setResolvedIsLoggedIn(!!d.user));
  }, [isLoggedIn]);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Rental time-of-day. Default = full day (allDay); customer can opt to set a
  // specific pickup/return time. Logistics only — does not affect price/stock.
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // When specifying times, both ends are required before checkout.
  const timeIncomplete = !allDay && (!startTime || !endTime);

  // Variant / size selection state (only active when variants are provided)
  const hasVariants = !!variants && variants.length > 0;
  // Auto-select first available variant on first render
  const defaultVariantId = hasVariants
    ? (variants!.find((v) => v.available)?.id ?? variants![0].id)
    : null;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId);

  // Resolve the chosen variant object
  const selectedVariant = hasVariants && selectedVariantId
    ? variants!.find((v) => v.id === selectedVariantId) ?? null
    : null;

  // Effective price/deposit: use chosen variant's price when variants exist, else product-level
  const effectivePricePerDay = selectedVariant ? selectedVariant.pricePerDay : pricePerDay;
  const effectiveDeposit = selectedVariant ? selectedVariant.deposit : deposit;

  // Shipping methods — chosen here on the calendar page (no longer at checkout).
  //   outbound (ร้าน→ลูกค้า) drives the before-rental transit buffer
  //   return   (ลูกค้า→ร้าน) drives the after-rental transit buffer
  // express collapses its leg's transit to 0; cleaning is always reserved.
  type ShipMethod = "express" | "standard";
  const [outboundMethod, setOutboundMethod] = useState<ShipMethod>("standard");
  const [returnMethod, setReturnMethod] = useState<ShipMethod>("standard");

  // Method-aware buffer windows (mirror lib/booking-policy.shippingBuffers).
  //   before = outbound express → 0, else transitBefore
  //   after  = cleaning + (return express → 0, else transitAfter)
  const windowBefore = outboundMethod === "express" ? 0 : bufferDaysBefore;
  const windowAfter = cleaningDays + (returnMethod === "express" ? 0 : bufferDaysAfter);

  // Effective unavailable set: merge product-level + variant-specific unavailable dates
  const effectiveUnavailable = useMemo(() => {
    if (selectedVariant?.unavailable && selectedVariant.unavailable.length > 0) {
      return [...unavailable, ...selectedVariant.unavailable];
    }
    return unavailable;
  }, [unavailable, selectedVariant]);

  const blackoutSet = useMemo(() => new Set(blackouts), [blackouts]);
  // Merged unavailable set: blackouts + policy-computed + variant-specific dates
  const allUnavailableSet = useMemo(
    () => (effectiveUnavailable.length === 0 ? blackoutSet : new Set([...blackoutSet, ...effectiveUnavailable])),
    [blackoutSet, effectiveUnavailable],
  );
  // Minimum selectable ISO date: today + leadTimeDays
  const minISO = useMemo(() => {
    if (!leadTimeDays) return TODAY;
    const d = new Date(TODAY + "T00:00:00");
    d.setDate(d.getDate() + leadTimeDays);
    return isoOf(d);
  }, [leadTimeDays]);

  const nights = nightsBetween(start, end);
  const quote = priceForNights(priceTiers ?? null, effectivePricePerDay ?? 0, nights);

  // Conflict check: does the selected range — INCLUDING the shipping transit
  // days before the start AND the cleaning + return-transit days after the end —
  // hit any unavailable date? The server's oversell guard scans the same
  // [start - windowBefore, end + windowAfter] window, so the picker must match
  // it or a range could pass here yet be rejected at confirm time.
  const conflictDates = useMemo(() => {
    if (!start || !end) return [];
    const pre = bufferDatesBefore(start, windowBefore).filter((d) => d >= TODAY);
    const post = bufferDatesAfter(end, windowAfter);
    return [...pre, ...rangeDates(start, end), ...post].filter((d) => allUnavailableSet.has(d));
  }, [start, end, windowBefore, windowAfter, allUnavailableSet]);

  const hasConflict = conflictDates.length > 0;

  // The chosen size must have at least one unit free across the whole window the
  // server checks — [start - windowBefore, end + windowAfter] — not just nights.
  const selectedVariantFull = useMemo(() => {
    if (!start || !end || !selectedVariant?.dailyBooked) return false;
    const rangeStart = windowBefore > 0 ? (bufferDatesBefore(start, windowBefore)[0] ?? start) : start;
    const rangeEnd = windowAfter > 0 ? (bufferDatesAfter(end, windowAfter).at(-1) ?? end) : end;
    return remainingForRange(selectedVariant.dailyBooked, selectedVariant.quantity, rangeStart, rangeEnd) <= 0;
  }, [start, end, selectedVariant, windowBefore, windowAfter]);

  // Policy validation: min/max rental days (checked only when no date conflict)
  const policyError = useMemo<string | null>(() => {
    if (!start || !end || hasConflict) return null;
    if (minRentalDays > 1 && nights < minRentalDays) {
      return `ร้านนี้เช่าขั้นต่ำ ${minRentalDays} วัน`;
    }
    if (maxRentalDays !== null && maxRentalDays !== undefined && nights > maxRentalDays) {
      return `เช่าได้สูงสุด ${maxRentalDays} วัน`;
    }
    return null;
  }, [start, end, nights, minRentalDays, maxRentalDays, hasConflict]);


  // Shop closing-soon warning + minutes-until-close (drives same-day express gating).
  // null = shop closed today / hours unknown → express same-day not possible.
  const [closingSoon, setClosingSoon] = useState(false);
  const [minsToClose, setMinsToClose] = useState<number | null>(null);
  useEffect(() => {
    if (!shopClosingTime) { setClosingSoon(false); setMinsToClose(null); return; }
    function check() {
      const now = new Date();
      const [h, m] = shopClosingTime!.split(":").map(Number);
      const closeMin = h * 60 + m;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const diff = closeMin - nowMin;
      setMinsToClose(diff);
      setClosingSoon(diff > 0 && diff <= 60);
    }
    check();
    const iv = setInterval(check, 60_000);
    return () => clearInterval(iv);
  }, [shopClosingTime]);

  // Same-day-start delivery gating (mirrors the server rule in createBooking):
  //   • standard outbound can never ship same-day
  //   • manual "ปิดร้านชั่วคราว" toggle (shopIsOpen === false) always blocks
  //   • hours NOT configured → unknown → allow express same-day (fail-open)
  //   • hours configured → require the shop open today with > 60 min before close
  const sameDayStart = !!start && start === TODAY;
  const expressTodayOk =
    shopIsOpen !== false &&
    (!shopHoursConfigured || (minsToClose != null && minsToClose > 60));
  const standardOutboundDisabled = sameDayStart;
  const expressOutboundDisabled = sameDayStart && !expressTodayOk;

  // Return standard disabled: if the after-buffer (cleaning + transit) would collide
  // with a booked date, standard return is not possible — the dress won't arrive in time.
  const standardReturnDisabled = useMemo(() => {
    if (!start || !end) return false;
    const afterWindowStandard = cleaningDays + bufferDaysAfter; // cleaning + return transit
    const postDates = bufferDatesAfter(end, afterWindowStandard);
    return postDates.some((d) => allUnavailableSet.has(d));
  }, [start, end, cleaningDays, bufferDaysAfter, allUnavailableSet]);

  // If a same-day pickup makes the current outbound choice impossible, nudge the
  // user to the only valid option (or surface the no-delivery error below).
  useEffect(() => {
    if (standardOutboundDisabled && outboundMethod === "standard" && !expressOutboundDisabled) {
      setOutboundMethod("express");
    }
  }, [standardOutboundDisabled, expressOutboundDisabled, outboundMethod]);

  // If return standard becomes impossible, nudge to express.
  useEffect(() => {
    if (standardReturnDisabled && returnMethod === "standard") {
      setReturnMethod("express");
    }
  }, [standardReturnDisabled, returnMethod]);

  const deliveryError = useMemo<string | null>(() => {
    if (!start || !end) return null;
    if (standardOutboundDisabled && expressOutboundDisabled) {
      return "ไม่สามารถจัดส่งให้ทันภายในวันนี้ได้ กรุณาเลือกวันรับชุดเป็นวันอื่น";
    }
    if (outboundMethod === "standard" && standardOutboundDisabled) {
      return "ส่งพัสดุไม่สามารถจัดส่งภายในวันได้ กรุณาเลือกส่งด่วน หรือเลือกวันรับเป็นวันอื่น";
    }
    if (outboundMethod === "express" && expressOutboundDisabled) {
      return "เลยเวลาส่งด่วนสำหรับวันนี้แล้ว กรุณาเลือกวันรับชุดเป็นวันอื่น";
    }
    return null;
  }, [start, end, outboundMethod, standardOutboundDisabled, expressOutboundDisabled]);

  const isInvalid = hasConflict || selectedVariantFull || !!policyError || !!deliveryError;

  // Up to 6 nearest future blackouts to show as warning
  const nextBlackouts = useMemo(() => {
    return blackouts.filter((d) => d >= TODAY).sort().slice(0, 6);
  }, [blackouts]);

  // Cart integration
  const cart = useCart();
  const [addedToCart, setAddedToCart] = useState(false);

  function handleAddToCart() {
    if (!start || !end || isInvalid || !productId || !shopId) return;
    const cartItemId = `${productId}:${selectedVariantId ?? ""}:${start}:${end}`;
    cart.add({
      id: cartItemId,
      productId,
      productName: productName ?? dressName,
      productSlug: productSlug ?? productId,
      productImage: productImage ?? dressImageUrl ?? null,
      shopId,
      shopName: shopName ?? boutiqueName,
      variantId: selectedVariantId,
      size: selectedVariant?.size ?? null,
      pricePerDay: effectivePricePerDay ?? 0,
      deposit: effectiveDeposit ?? 0,
      startDate: start,
      endDate: end,
      startTime: !allDay && startTime ? startTime : null,
      endTime: !allDay && endTime ? endTime : null,
      outboundMethod,
      returnMethod,
      qty: 1,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  }

  function trackAndGo(e: React.MouseEvent<HTMLAnchorElement>) {
    if (productId || shopId) {
      try {
        const blob = new Blob(
          [JSON.stringify({ product_id: productId, shop_id: shopId, source: "detail_datepicker" })],
          { type: "application/json" },
        );
        if (navigator.sendBeacon) navigator.sendBeacon("/api/track", blob);
      } catch {
        // ignore
      }
    }
    void e;
  }

  // Checkout URL includes variantId when a variant is selected, plus the chosen
  // pickup/return times when the customer opted out of full-day.
  const checkoutBase = `/checkout/address?product=${productId ?? ""}&start=${start}&end=${end}`;
  const timeQuery = !allDay && startTime && endTime ? `&startTime=${startTime}&endTime=${endTime}` : "";
  const shipQuery = `&outbound=${outboundMethod}&return=${returnMethod}`;
  const checkoutHref = `${selectedVariantId ? `${checkoutBase}&variant=${selectedVariantId}` : checkoutBase}${timeQuery}${shipQuery}`;

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14, marginBottom: 16, background: "var(--bg)" }}>
      {/* ── Size selector (only shown when product has variants) ── */}
      {hasVariants ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>เลือกไซซ์</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {variants!.map((v) => {
              const isSelected = v.id === selectedVariantId;
              // Check if this variant is "full" for the chosen range. Standard
              // shipping reserves transit days before the start, so widen the
              // window to [start - bufferDaysBefore, end] — same span the server
              // oversell guard scans — otherwise a size can look free here yet
              // be rejected at confirm time.
              const variantUnavailSet = new Set([...blackouts, ...(v.unavailable ?? [])]);
              const hasRange = !!start && !!end;
              const rangeStart = bufferDaysBefore > 0
                ? (bufferDatesBefore(start, bufferDaysBefore)[0] ?? start)
                : start;
              const isFullForRange = hasRange
                ? rangeDates(rangeStart, end).some((d) => variantUnavailSet.has(d))
                : false;
              // Remaining units: for a chosen range use the per-day peak; otherwise total stock.
              const remaining = hasRange && v.dailyBooked
                ? remainingForRange(v.dailyBooked, v.quantity, rangeStart, end)
                : v.quantity;
              const isFull = isFullForRange || (hasRange && remaining <= 0);
              const isDisabled = !v.available || isFull;
              // Stock hint: always shown — "เต็ม" when full, else "เหลือ N ตัว".
              // Before a range is picked, N = total stock; after, N = remaining for the range.
              const stockHint = isFull ? "เต็ม" : `เหลือ ${remaining} ตัว`;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    setSelectedVariantId(v.id);
                    // Reset date range when switching size (availability differs per size)
                    setStart("");
                    setEnd("");
                  }}
                  title={isFull ? "ไซซ์นี้เต็มสำหรับช่วงวันที่เลือก" : (!v.available ? "ไม่เปิดจองขณะนี้" : "")}
                  className="flex flex-col items-center leading-tight"
                  style={{
                    padding: "7px 14px",
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 400,
                    border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--line)"}`,
                    background: isSelected ? "var(--accent)" : isDisabled ? "var(--bg)" : "var(--surface)",
                    color: isSelected ? "var(--accent-ink)" : isDisabled ? "var(--ink-3)" : "var(--ink)",
                    borderRadius: 8,
                    cursor: isDisabled ? "default" : "pointer",
                    opacity: isDisabled ? 0.55 : 1,
                    textDecoration: isDisabled && !v.available ? "line-through" : "none",
                  }}
                >
                  <span>{sizeLabel(v.size)}</span>
                  {stockHint ? (
                    <span className={`mt-0.5 text-[10px] font-semibold ${isSelected ? "opacity-90" : isFull ? "text-danger" : "text-ink-3"}`}>
                      {stockHint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {selectedVariant ? (
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
              ฿{selectedVariant.pricePerDay.toLocaleString()}/วัน · มัดจำ ฿{selectedVariant.deposit.toLocaleString()}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Shop closing-soon / offline warning */}
      {shopIsOpen === false ? (
        <div style={{ padding: "12px 14px", background: "rgba(220,38,38,0.06)", border: "1.5px solid rgba(220,38,38,0.35)", borderRadius: 8, fontSize: 13, color: "var(--danger)", marginBottom: 12, lineHeight: 1.5, fontWeight: 600, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <div>
            <div>ร้านปิดให้บริการอยู่ขณะนี้</div>
            <div style={{ fontWeight: 400, fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>คำจองอาจไม่ได้รับการตอบกลับ หรืออาจถูกปฏิเสธ</div>
          </div>
        </div>
      ) : closingSoon ? (
        <div style={{ padding: "10px 12px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.4)", borderRadius: 6, fontSize: 13, color: "var(--warn-ink)", marginBottom: 12, lineHeight: 1.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>⏰</span>
          ร้านใกล้จะปิด (ปิด {shopClosingTime} น.) — มีโอกาสที่จะถูกปฏิเสธการจอง
        </div>
      ) : !shopHoursConfigured ? (
        <div style={{ padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, fontSize: 12.5, color: "var(--ink-2)", marginBottom: 12, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
          <span>ร้านนี้ยังไม่ได้ตั้งเวลาทำการ — เวลาจัดส่งและรับชุดขึ้นอยู่กับการตอบกลับของร้าน</span>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>เลือกวันที่อยากเช่า (ไม่บังคับ)</div>
        {start ? (
          <button
            type="button"
            onClick={() => { setStart(""); setEnd(""); }}
            style={{ fontSize: 12, color: "var(--ink-3)", background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            ล้าง
          </button>
        ) : null}
      </div>

      <Calendar
        start={start}
        end={end}
        minISO={minISO}
        blackoutSet={allUnavailableSet}
        dailyBooked={selectedVariant?.dailyBooked}
        quantity={selectedVariant?.quantity}
        onChange={(s, e) => { setStart(s); setEnd(e); }}
      />

      {hasVariants && selectedVariant ? (
        <div className="mt-1.5 flex items-center justify-center text-[11px] text-ink-3">
          <span className="inline-block rounded bg-bg-hover px-1.5 py-0.5 font-semibold text-ink-2">
            ไซซ์ {sizeLabel(selectedVariant.size)}
          </span>
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "center", margin: "10px 0 2px", minHeight: 18 }}>
        {start && !end ? "เลือกวันคืนชุด (แตะหรือลากไปอีกวัน)" : start && end ? `${fmtThai(start)} → ${fmtThai(end)}` : "แตะวันรับชุดเพื่อเริ่ม"}
      </div>

      {/* ── Shipping method (both legs) — chosen here so the buffer is known ── */}
      {start && end ? (() => {
        // Compute contextual hints for outbound
        const outboundShipByDate = bufferDaysBefore > 0
          ? (() => { const d = new Date(start + "T00:00:00"); d.setDate(d.getDate() - bufferDaysBefore); return fmtThai(isoOf(d)); })()
          : "";
        const outboundStdHint = bufferDaysBefore > 0
          ? `ร้านจัดส่งภายใน ${outboundShipByDate}`
          : "ขนส่งทั่วไป";
        // Compute contextual hints for return
        const returnArrivalDate = bufferDaysBefore > 0
          ? (() => { const d = new Date(end + "T00:00:00"); d.setDate(d.getDate() + bufferDaysBefore); return fmtThai(isoOf(d)); })()
          : "";
        const returnStdHint = bufferDaysBefore > 0
          ? `ส่งคืนภายใน ${fmtThai(end)} · ถึงร้าน ~${returnArrivalDate}`
          : "ขนส่งทั่วไป";
        const returnStdDisabledHint = standardReturnDisabled
          ? "ส่งพัสดุไม่ได้ เนื่องจากสินค้าอาจส่งถึงไม่ทันช่วงที่มีลูกค้าท่านอื่นจองต่อ"
          : undefined;
        return (
          <div className="mt-3 grid gap-3 rounded-lg border border-line bg-surface p-3">
            <DeliveryToggle
              label="ตอนร้านจัดส่งของ (ขาไป)"
              value={outboundMethod}
              onChange={setOutboundMethod}
              expressDisabled={expressOutboundDisabled}
              standardDisabled={standardOutboundDisabled}
              standardHint={outboundStdHint}
            />
            <DeliveryToggle
              label="ตอนส่งคืนสินค้า (ขากลับ)"
              value={returnMethod}
              onChange={setReturnMethod}
              standardDisabled={standardReturnDisabled}
              standardHint={returnStdHint}
              standardDisabledHint={returnStdDisabledHint}
            />
          </div>
        );
      })() : null}

      {/* Same-day delivery gating warning */}
      {deliveryError ? (
        <div className="mt-2.5 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-danger">
          ⚠️ {deliveryError}
        </div>
      ) : null}

      {/* Blackouts info */}
      {nextBlackouts.length > 0 ? (
        <div style={{ padding: "8px 10px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", margin: "10px 0", lineHeight: 1.5 }}>
          <div style={{ color: "var(--ink)", fontWeight: 500, marginBottom: 3 }}>วันที่ร้านไม่ว่าง:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {nextBlackouts.map((d) => (
              <span key={d} style={{ padding: "2px 8px", background: "rgba(220,38,38,0.08)", color: "#DC2626", borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                {fmtThai(d)}
              </span>
            ))}
            {blackouts.filter((d) => d >= TODAY).length > nextBlackouts.length ? (
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                +{blackouts.filter((d) => d >= TODAY).length - nextBlackouts.length} วัน
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Conflict warning */}
      {hasConflict ? (
        <div style={{ padding: "10px 12px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6, fontSize: 13, color: "#DC2626", marginBottom: 10, lineHeight: 1.5, fontWeight: 500 }}>
          ⚠️ ช่วงวันที่เลือกชนกับวันที่ไม่ว่าง ({conflictDates.map(fmtThai).join(", ")}) กรุณาเลือกใหม่
        </div>
      ) : null}

      {/* Size full for the window (rental nights + transit buffer) */}
      {!hasConflict && selectedVariantFull ? (
        <div style={{ padding: "10px 12px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6, fontSize: 13, color: "#DC2626", marginBottom: 10, lineHeight: 1.5, fontWeight: 500 }}>
          ⚠️ ไซซ์นี้เต็มสำหรับช่วงวันที่เลือก (รวมวันจัดส่ง) กรุณาเลือกวันอื่นหรือไซซ์อื่น
        </div>
      ) : null}

      {/* Policy warning: min/max rental days */}
      {policyError ? (
        <div style={{ padding: "10px 12px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.4)", borderRadius: 6, fontSize: 13, color: "var(--warn-ink)", marginBottom: 10, lineHeight: 1.5, fontWeight: 500 }}>
          ⚠️ {policyError}
        </div>
      ) : null}

      {nights > 0 && !isInvalid ? (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 500, color: "var(--ink)" }}>
            ระยะเวลา: {nights} วัน ({fmtThai(start)} ถึง {fmtThai(end)})
          </div>
          {typeof effectivePricePerDay === "number" ? (
            <div style={{ marginTop: 2 }}>
              ราคา: ฿{quote.total.toLocaleString()} ({nights} × ฿{quote.perDay.toLocaleString()}/วัน)
            </div>
          ) : null}
          {typeof effectiveDeposit === "number" && effectiveDeposit > 0 ? (
            <div style={{ marginTop: 2 }}>มัดจำ: ฿{effectiveDeposit.toLocaleString()}</div>
          ) : null}
          <div style={{ marginTop: 2 }}>
            กด &quot;จองเลย&quot; เพื่อเลือกที่อยู่จัดส่งและชำระเงินผ่าน QR PromptPay
          </div>
        </div>
      ) : null}

      {/* Rental time-of-day — default full day, opt-in specific times */}
      {nights > 0 && !isInvalid ? (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            เช่าทั้งวัน (คืนภายใน {fmtThai(end)})
          </label>
          {!allDay ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-ink-2">
                รับเวลา
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-md border border-line bg-bg px-2 py-1.5 text-[14px] text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-2">
                คืนเวลา
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-md border border-line bg-bg px-2 py-1.5 text-[14px] text-ink"
                />
              </label>
            </div>
          ) : null}
          {timeIncomplete ? (
            <div className="mt-2 text-[12px] font-medium text-danger">กรุณาระบุทั้งเวลารับและเวลาคืน</div>
          ) : null}
        </div>
      ) : null}

      {nights > 0 && !isInvalid ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {resolvedIsLoggedIn && productId ? (
            <Link
              href={checkoutHref}
              onClick={(e) => { if (timeIncomplete) { e.preventDefault(); return; } trackAndGo(e); }}
              aria-disabled={timeIncomplete}
              className="btn btn-primary"
              style={{ display: "block", padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 600, opacity: timeIncomplete ? 0.5 : 1, pointerEvents: timeIncomplete ? "none" : "auto" }}
            >
              จองเลย · {nights} วัน
            </Link>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(checkoutHref)}`} className="btn btn-dark" style={{ display: "block", padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 600 }}>
              เข้าสู่ระบบเพื่อจอง · {nights} วัน
            </Link>
          )}
          {/* Add to cart — available to logged-in renters who have a productId + shopId */}
          {productId && shopId ? (
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={timeIncomplete}
              className={`btn btn-outline flex items-center justify-center gap-1.5 py-2.5 px-4 text-[13px] font-semibold ${timeIncomplete ? "opacity-50" : "opacity-100"}`}
            >
              {addedToCart ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  เพิ่มแล้ว ✓
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                  เพิ่มลงตะกร้า
                </>
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Calendar ─────────────────────────── */

function Calendar({
  start,
  end,
  minISO,
  blackoutSet,
  dailyBooked,
  quantity,
  onChange,
}: {
  start: string;
  end: string;
  minISO: string;
  blackoutSet: Set<string>;
  /** Per-day booked count for the selected size (YYYY-MM-DD → count). */
  dailyBooked?: Record<string, number>;
  /** Total stock of the selected size. */
  quantity?: number;
  onChange: (start: string, end: string) => void;
}) {
  const init = start ? new Date(start) : new Date();
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const [preview, setPreview] = useState("");
  const down = useRef(false);

  const rangeEnd = end || (preview && start && preview >= start ? preview : "");

  const firstDow = new Date(view.y, view.m, 1).getDay(); // Sunday-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();

  // Remaining stock of the selected size on a date (null when no size context).
  const remainingOn = (iso: string): number | null => {
    if (quantity == null || !dailyBooked) return null;
    return quantity - Math.min(quantity, dailyBooked[iso] ?? 0);
  };

  const isDisabled = (iso: string) => {
    if (iso < minISO || blackoutSet.has(iso)) return true;
    const rem = remainingOn(iso);
    return rem != null && rem <= 0;
  };

  const onDown = (iso: string) => {
    if (isDisabled(iso)) return;
    down.current = true;
    setPreview("");
    if (!start || (start && end)) onChange(iso, "");
    else if (iso < start) onChange(iso, "");
    else onChange(start, iso);
  };
  const onEnter = (iso: string) => {
    if (down.current && start && !end && !isDisabled(iso) && iso >= start) setPreview(iso);
  };
  const onUp = (iso: string) => {
    if (down.current && start && !end && iso > start && !isDisabled(iso)) onChange(start, iso);
    down.current = false;
    setPreview("");
  };

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };
  const canPrev = `${view.y}-${pad(view.m + 1)}` > minISO.slice(0, 7);

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div
      style={{ userSelect: "none", touchAction: "manipulation" }}
      onPointerLeave={() => { down.current = false; setPreview(""); }}
      onPointerUp={() => { down.current = false; }}
    >
      {/* Month header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <NavBtn dir="prev" disabled={!canPrev} onClick={() => canPrev && shiftMonth(-1)} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {MONTHS_TH_FULL[view.m]} {view.y}
        </div>
        <NavBtn dir="next" onClick={() => shiftMonth(1)} />
      </div>

      {/* Weekday row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 2 }}>
        {DAYS_TH.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--ink-3)", padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {cells.map((day, i) => {
          if (day == null) return <div key={`b${i}`} />;
          const iso = `${view.y}-${pad(view.m + 1)}-${pad(day)}`;
          const disabled = isDisabled(iso);
          const isStart = !!start && iso === start;
          const isEnd = !!rangeEnd && iso === rangeEnd;
          const inRange = !!start && !!rangeEnd && iso > start && iso < rangeEnd;
          const isToday = iso === minISO;

          // Pill background for the selected band.
          let bandBg = "transparent";
          let bandRadius = "0";
          if (start && rangeEnd && start !== rangeEnd && iso >= start && iso <= rangeEnd) {
            bandBg = "var(--accent-soft)";
            if (iso === start) bandRadius = "999px 0 0 999px";
            else if (iso === rangeEnd) bandRadius = "0 999px 999px 0";
          }

          const filled = isStart || isEnd;
          // Per-size remaining indicator: shown only when a size is selected,
          // the date is partially booked (some stock gone but not full), and
          // the cell isn't disabled or part of the selected band.
          const rem = remainingOn(iso);
          const showRemaining =
            rem != null && quantity != null && rem > 0 && rem < quantity && !disabled && !filled && !inRange;
          return (
            <div key={iso} style={{ display: "flex", justifyContent: "center", padding: "2px 0", background: bandBg, borderRadius: bandRadius }}>
              <button
                type="button"
                disabled={disabled}
                onPointerDown={() => onDown(iso)}
                onPointerEnter={() => onEnter(iso)}
                onPointerUp={() => onUp(iso)}
                aria-label={showRemaining ? `${fmtThai(iso)} เหลือ ${rem} ตัว` : fmtThai(iso)}
                className="flex flex-col items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: isToday && !filled ? "1px solid var(--accent)" : "1px solid transparent",
                  background: filled ? "var(--accent)" : inRange ? "transparent" : "transparent",
                  color: filled ? "var(--accent-ink)" : disabled ? "var(--ink-3)" : inRange ? "var(--accent-2)" : "var(--ink)",
                  fontSize: 14,
                  fontWeight: filled ? 600 : 400,
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.4 : 1,
                  textDecoration: disabled && blackoutSet.has(iso) ? "line-through" : "none",
                  fontVariantNumeric: "tabular-nums",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                <span>{day}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── Delivery method toggle ─────────────────────── */

function DeliveryToggle({
  label,
  value,
  onChange,
  expressDisabled = false,
  standardDisabled = false,
  standardHint,
  standardDisabledHint,
}: {
  label: string;
  value: "express" | "standard";
  onChange: (v: "express" | "standard") => void;
  expressDisabled?: boolean;
  standardDisabled?: boolean;
  /** Custom hint text for the standard option (replaces the default "+N วันขนส่ง"). */
  standardHint?: string;
  /** Tooltip/hint shown when standard is disabled (explains why). */
  standardDisabledHint?: string;
}) {
  const stdHint = standardDisabled && standardDisabledHint
    ? standardDisabledHint
    : standardHint ?? "ขนส่งทั่วไป";
  const options: { key: "express" | "standard"; title: string; hint: string; disabled: boolean }[] = [
    { key: "express", title: "ส่งด่วน", hint: "ภายในวัน", disabled: expressDisabled },
    { key: "standard", title: "ส่งพัสดุ", hint: stdHint, disabled: standardDisabled },
  ];
  return (
    <div className="grid gap-1.5">
      <div className="text-[13px] font-semibold text-ink">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const selected = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={o.disabled}
              onClick={() => onChange(o.key)}
              title={o.disabled && o.key === "standard" && standardDisabledHint ? standardDisabledHint : undefined}
              className={`flex flex-col items-start rounded-lg border-2 px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : o.disabled
                    ? "border-line bg-bg opacity-50"
                    : "border-line bg-bg hover:border-ink-3"
              } ${o.disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span className={`text-[13px] font-semibold ${selected ? "text-[var(--accent)]" : "text-ink"}`}>
                {o.title}
              </span>
              <span className={`text-[11px] leading-snug ${selected ? "text-[var(--accent-2)]" : o.disabled ? "text-danger" : "text-ink-3"}`}>{o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavBtn({ dir, onClick, disabled }: { dir: "prev" | "next"; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "เดือนก่อนหน้า" : "เดือนถัดไป"}
      style={{
        width: 30, height: 30, borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)",
        display: "grid", placeItems: "center", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1, color: "var(--ink-2)",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {dir === "prev" ? <polyline points="15,6 9,12 15,18" /> : <polyline points="9,6 15,12 9,18" />}
      </svg>
    </button>
  );
}
