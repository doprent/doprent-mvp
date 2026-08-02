/**
 * tests/booking-policy.test.ts
 *
 * Pure-function tests for lib/booking-policy.ts.
 * No DB, no network, fully deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  shippingBuffers,
  resolveEffectivePolicy,
  computeUnavailableDates,
  computeDailyBookedCounts,
  remainingForRange,
  validateBookingRange,
  nightsBetween,
  bookingShippingPlan,
  BOOKING_BLOCKING_STATUSES,
} from "@/lib/booking-policy";
import type { EffectivePolicy, PolicySource, ProductPolicyOverride } from "@/lib/booking-policy";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_POLICY: EffectivePolicy = {
  leadTimeDays: 1,
  minRentalDays: 1,
  maxRentalDays: null,
  returnWindowDays: 3,
  bufferDaysBefore: 2,
  bufferDaysAfter: 2,
  cleaningDays: 1,
  closedWeekdays: [],
};

const SHOP_POLICY: PolicySource = { ...BASE_POLICY };

const NO_OVERRIDE: ProductPolicyOverride = {
  policyOverride: false,
  leadTimeDays: null,
  minRentalDays: null,
  maxRentalDays: null,
  returnWindowDays: null,
  bufferDaysAfter: null,
  bufferDaysBefore: null,
  cleaningDays: null,
};

function makeBooking(
  startDate: string,
  endDate: string,
  status: string = "confirmed",
  outboundMethod?: string,
  returnMethod?: string,
) {
  return {
    startDate: new Date(startDate + "T00:00:00Z"),
    endDate: new Date(endDate + "T00:00:00Z"),
    status,
    outboundMethod,
    returnMethod,
  };
}

// ---------------------------------------------------------------------------
// nightsBetween
// ---------------------------------------------------------------------------

describe("nightsBetween", () => {
  it("returns 1 for same-day", () => {
    expect(nightsBetween("2024-03-15", "2024-03-15")).toBe(1);
  });

  it("returns 3 for a 3-day window", () => {
    expect(nightsBetween("2024-03-15", "2024-03-17")).toBe(3);
  });

  it("returns at least 1 when end < start", () => {
    expect(nightsBetween("2024-03-17", "2024-03-15")).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// shippingBuffers
// ---------------------------------------------------------------------------

describe("shippingBuffers", () => {
  it("standard/standard: before=bufferDaysBefore, after=cleaning+bufferDaysAfter", () => {
    const { before, after } = shippingBuffers(BASE_POLICY, "standard", "standard");
    expect(before).toBe(2); // bufferDaysBefore
    expect(after).toBe(3);  // cleaningDays(1) + bufferDaysAfter(2)
  });

  it("express outbound: before=0, after still includes return transit", () => {
    const { before, after } = shippingBuffers(BASE_POLICY, "express", "standard");
    expect(before).toBe(0);
    expect(after).toBe(3); // cleaning(1) + bufferDaysAfter(2)
  });

  it("express return: after=cleaningDays only (no transit)", () => {
    const { before, after } = shippingBuffers(BASE_POLICY, "standard", "express");
    expect(before).toBe(2);
    expect(after).toBe(1); // only cleaning
  });

  it("both express: before=0, after=cleaningDays only", () => {
    const { before, after } = shippingBuffers(BASE_POLICY, "express", "express");
    expect(before).toBe(0);
    expect(after).toBe(1); // only cleaning
  });

  it("null/undefined methods fall back to standard", () => {
    const standard = shippingBuffers(BASE_POLICY, "standard", "standard");
    const nullMethods = shippingBuffers(BASE_POLICY, null, null);
    const undefinedMethods = shippingBuffers(BASE_POLICY, undefined, undefined);
    expect(nullMethods).toEqual(standard);
    expect(undefinedMethods).toEqual(standard);
  });

  it("cleaning is always added regardless of return method", () => {
    const express = shippingBuffers(BASE_POLICY, "express", "express");
    expect(express.after).toBe(BASE_POLICY.cleaningDays);
  });
});

// ---------------------------------------------------------------------------
// bookingShippingPlan
// ---------------------------------------------------------------------------

describe("bookingShippingPlan", () => {
  it("standard outbound: shipBy = startDate - bufferDaysBefore", () => {
    const plan = bookingShippingPlan(BASE_POLICY, "2024-04-10", "2024-04-12", "standard", "standard");
    expect(plan.outbound.method).toBe("standard");
    expect(plan.outbound.transitDays).toBe(2);
    expect(plan.outbound.shipBy).toBe("2024-04-08"); // 10 - 2 = 8
    expect(plan.outbound.sameDay).toBe(false);
  });

  it("express outbound: shipBy = startDate (same-day)", () => {
    const plan = bookingShippingPlan(BASE_POLICY, "2024-04-10", "2024-04-12", "express", "standard");
    expect(plan.outbound.method).toBe("express");
    expect(plan.outbound.transitDays).toBe(0);
    expect(plan.outbound.shipBy).toBe("2024-04-10");
    expect(plan.outbound.sameDay).toBe(true);
  });

  it("return leg: shipBy always equals endDate", () => {
    const plan = bookingShippingPlan(BASE_POLICY, "2024-04-10", "2024-04-12", "standard", "express");
    expect(plan.return.shipBy).toBe("2024-04-12");
  });

  it("express return: transitDays=0, sameDay=true", () => {
    const plan = bookingShippingPlan(BASE_POLICY, "2024-04-10", "2024-04-12", "standard", "express");
    expect(plan.return.transitDays).toBe(0);
    expect(plan.return.sameDay).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectivePolicy
// ---------------------------------------------------------------------------

describe("resolveEffectivePolicy", () => {
  it("returns shop policy when policyOverride=false", () => {
    const result = resolveEffectivePolicy(SHOP_POLICY, NO_OVERRIDE);
    expect(result.leadTimeDays).toBe(SHOP_POLICY.leadTimeDays);
    expect(result.minRentalDays).toBe(SHOP_POLICY.minRentalDays);
    expect(result.bufferDaysBefore).toBe(SHOP_POLICY.bufferDaysBefore);
    expect(result.closedWeekdays).toBe(SHOP_POLICY.closedWeekdays);
  });

  it("applies product override when policyOverride=true and values non-null", () => {
    const override: ProductPolicyOverride = {
      policyOverride: true,
      leadTimeDays: 3,
      minRentalDays: 2,
      maxRentalDays: 7,
      returnWindowDays: 5,
      bufferDaysAfter: 1,
      bufferDaysBefore: 1,
      cleaningDays: 2,
    };
    const result = resolveEffectivePolicy(SHOP_POLICY, override);
    expect(result.leadTimeDays).toBe(3);
    expect(result.minRentalDays).toBe(2);
    expect(result.maxRentalDays).toBe(7);
    expect(result.cleaningDays).toBe(2);
    // closedWeekdays always from shop
    expect(result.closedWeekdays).toBe(SHOP_POLICY.closedWeekdays);
  });

  it("falls back to shop value when product override field is null", () => {
    const override: ProductPolicyOverride = {
      policyOverride: true,
      leadTimeDays: null,  // should fall back to shop's 1
      minRentalDays: 3,
      maxRentalDays: null, // null with policyOverride=true means unlimited
      returnWindowDays: null,
      bufferDaysAfter: null,
      bufferDaysBefore: null,
      cleaningDays: null,
    };
    const result = resolveEffectivePolicy(SHOP_POLICY, override);
    expect(result.leadTimeDays).toBe(SHOP_POLICY.leadTimeDays); // fallback
    expect(result.minRentalDays).toBe(3);
    expect(result.maxRentalDays).toBeNull(); // explicit unlimited
  });
});

// ---------------------------------------------------------------------------
// computeUnavailableDates
// ---------------------------------------------------------------------------

describe("computeUnavailableDates", () => {
  it("includes blackout dates", () => {
    const result = computeUnavailableDates({
      blackouts: ["2024-06-15"],
      shopClosedDates: [],
      bookings: [],
      effectivePolicy: BASE_POLICY,
      rangeStart: "2024-06-01",
      rangeEnd: "2024-06-30",
    });
    expect(result.has("2024-06-15")).toBe(true);
  });

  it("includes shopClosedDates", () => {
    const result = computeUnavailableDates({
      blackouts: [],
      shopClosedDates: ["2024-06-20"],
      bookings: [],
      effectivePolicy: BASE_POLICY,
      rangeStart: "2024-06-01",
      rangeEnd: "2024-06-30",
    });
    expect(result.has("2024-06-20")).toBe(true);
  });

  it("blocks buffer days around a confirmed booking (single-unit)", () => {
    // Booking: 2024-06-10 to 2024-06-12, standard/standard
    // Expected blocked: [2024-06-08 .. 2024-06-15] (before=2, after=cleaning1+transit2=3)
    const result = computeUnavailableDates({
      blackouts: [],
      shopClosedDates: [],
      bookings: [makeBooking("2024-06-10", "2024-06-12", "confirmed", "standard", "standard")],
      effectivePolicy: BASE_POLICY,
      rangeStart: "2024-06-01",
      rangeEnd: "2024-06-30",
    });
    expect(result.has("2024-06-08")).toBe(true);  // startDate - 2 buffer before
    expect(result.has("2024-06-10")).toBe(true);  // rental start
    expect(result.has("2024-06-12")).toBe(true);  // rental end
    expect(result.has("2024-06-15")).toBe(true);  // endDate + 3 buffer after (cleaning1+transit2)
    expect(result.has("2024-06-16")).toBe(false); // after buffer window
    expect(result.has("2024-06-07")).toBe(false); // before buffer window
  });

  it("non-blocking statuses do NOT block dates", () => {
    const result = computeUnavailableDates({
      blackouts: [],
      shopClosedDates: [],
      bookings: [makeBooking("2024-06-10", "2024-06-12", "booking_pending")],
      effectivePolicy: BASE_POLICY,
      rangeStart: "2024-06-01",
      rangeEnd: "2024-06-30",
    });
    // booking_pending is NOT in BOOKING_BLOCKING_STATUSES
    expect(result.has("2024-06-10")).toBe(false);
  });

  it("express outbound zeroes before-buffer", () => {
    const result = computeUnavailableDates({
      blackouts: [],
      shopClosedDates: [],
      bookings: [makeBooking("2024-06-10", "2024-06-12", "confirmed", "express", "standard")],
      effectivePolicy: BASE_POLICY,
      rangeStart: "2024-06-01",
      rangeEnd: "2024-06-30",
    });
    // before=0 → startDate-0 = 2024-06-10 (not 2024-06-08)
    expect(result.has("2024-06-08")).toBe(false);
    expect(result.has("2024-06-10")).toBe(true);
  });

  it("express return zeroes transit portion of after-buffer, cleaning stays", () => {
    const result = computeUnavailableDates({
      blackouts: [],
      shopClosedDates: [],
      bookings: [makeBooking("2024-06-10", "2024-06-12", "confirmed", "standard", "express")],
      effectivePolicy: BASE_POLICY,
      rangeStart: "2024-06-01",
      rangeEnd: "2024-06-30",
    });
    // after=cleaning(1)+0=1 → blocked up to 2024-06-13
    expect(result.has("2024-06-13")).toBe(true);
    expect(result.has("2024-06-14")).toBe(false); // no transit buffer
  });

  it("blocks closed weekdays (0=Sun) within range", () => {
    const policyWithSunday: EffectivePolicy = { ...BASE_POLICY, closedWeekdays: [0] };
    const result = computeUnavailableDates({
      blackouts: [],
      shopClosedDates: [],
      bookings: [],
      effectivePolicy: policyWithSunday,
      rangeStart: "2024-06-02",  // Sunday
      rangeEnd: "2024-06-08",    // Saturday
    });
    expect(result.has("2024-06-02")).toBe(true);  // Sunday
    expect(result.has("2024-06-09")).toBe(false); // outside range
    expect(result.has("2024-06-03")).toBe(false); // Monday — not closed
  });

  it("multi-unit: date blocked only when overlap_count >= quantity", () => {
    const q = 2;
    const booking1 = makeBooking("2024-06-10", "2024-06-12", "confirmed", "express", "express");
    const booking2 = makeBooking("2024-06-11", "2024-06-13", "confirmed", "express", "express");
    const result = computeUnavailableDates({
      blackouts: [],
      shopClosedDates: [],
      bookings: [booking1, booking2],
      effectivePolicy: { ...BASE_POLICY, bufferDaysBefore: 0, bufferDaysAfter: 0, cleaningDays: 0 },
      rangeStart: "2024-06-01",
      rangeEnd: "2024-06-30",
      quantity: q,
    });
    // 2024-06-11 and 2024-06-12 are each overlapped by both bookings → blocked
    expect(result.has("2024-06-11")).toBe(true);
    expect(result.has("2024-06-12")).toBe(true);
    // 2024-06-10 only has 1 overlap < 2 → NOT blocked
    expect(result.has("2024-06-10")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeDailyBookedCounts
// ---------------------------------------------------------------------------

describe("computeDailyBookedCounts", () => {
  it("counts blocking bookings per day", () => {
    const bookings = [
      makeBooking("2024-06-10", "2024-06-12", "confirmed"),
    ];
    const counts = computeDailyBookedCounts({
      bookings,
      bufferDaysAfter: 0,
      bufferDaysBefore: 0,
      statuses: BOOKING_BLOCKING_STATUSES,
    });
    expect(counts["2024-06-10"]).toBe(1);
    expect(counts["2024-06-11"]).toBe(1);
    expect(counts["2024-06-12"]).toBe(1);
    expect(counts["2024-06-13"]).toBeUndefined();
  });

  it("skips non-blocking statuses", () => {
    const counts = computeDailyBookedCounts({
      bookings: [makeBooking("2024-06-10", "2024-06-12", "cancelled")],
      bufferDaysAfter: 0,
      statuses: BOOKING_BLOCKING_STATUSES,
    });
    expect(Object.keys(counts).length).toBe(0);
  });

  it("adds flat buffer days when no effectivePolicy", () => {
    const counts = computeDailyBookedCounts({
      bookings: [makeBooking("2024-06-10", "2024-06-10", "confirmed")],
      bufferDaysAfter: 2,
      bufferDaysBefore: 1,
      statuses: BOOKING_BLOCKING_STATUSES,
    });
    expect(counts["2024-06-09"]).toBe(1); // 1 before
    expect(counts["2024-06-10"]).toBe(1);
    expect(counts["2024-06-11"]).toBe(1); // 2 after
    expect(counts["2024-06-12"]).toBe(1);
    expect(counts["2024-06-13"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// remainingForRange
// ---------------------------------------------------------------------------

describe("remainingForRange", () => {
  it("returns quantity when no bookings in range", () => {
    expect(remainingForRange({}, 3, "2024-06-10", "2024-06-12")).toBe(3);
  });

  it("subtracts peak bookings in range", () => {
    const daily = { "2024-06-11": 2 };
    expect(remainingForRange(daily, 3, "2024-06-10", "2024-06-12")).toBe(1);
  });

  it("clamps to 0 (never negative)", () => {
    const daily = { "2024-06-10": 5 };
    expect(remainingForRange(daily, 3, "2024-06-10", "2024-06-10")).toBe(0);
  });

  it("returns quantity for invalid range", () => {
    expect(remainingForRange({}, 3, "2024-06-12", "2024-06-10")).toBe(3);
    expect(remainingForRange({}, 3, "", "")).toBe(3);
  });

  it("uses the PEAK count, not total", () => {
    const daily = {
      "2024-06-10": 1,
      "2024-06-11": 3,
      "2024-06-12": 1,
    };
    // Peak is 3, so remaining = 5 - 3 = 2
    expect(remainingForRange(daily, 5, "2024-06-10", "2024-06-12")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// validateBookingRange
// ---------------------------------------------------------------------------

describe("validateBookingRange", () => {
  const EMPTY_UNAVAIL = new Set<string>();
  const TODAY = "2024-06-10";

  it("passes a valid range", () => {
    const result = validateBookingRange({
      startDate: "2024-06-12",  // today+2, satisfies leadTimeDays=1
      endDate: "2024-06-14",
      effectivePolicy: BASE_POLICY,
      unavailableDates: EMPTY_UNAVAIL,
      today: TODAY,
    });
    expect(result.ok).toBe(true);
  });

  it("fails when endDate < startDate", () => {
    const result = validateBookingRange({
      startDate: "2024-06-15",
      endDate: "2024-06-12",
      effectivePolicy: BASE_POLICY,
      unavailableDates: EMPTY_UNAVAIL,
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/วันคืน/);
  });

  it("fails when startDate < today + leadTimeDays", () => {
    const result = validateBookingRange({
      startDate: TODAY,  // same as today, but leadTimeDays=1 requires at least tomorrow
      endDate: TODAY,
      effectivePolicy: BASE_POLICY,
      unavailableDates: EMPTY_UNAVAIL,
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/ล่วงหน้า/);
  });

  it("fails when nights < minRentalDays", () => {
    const result = validateBookingRange({
      startDate: "2024-06-12",
      endDate: "2024-06-12",
      effectivePolicy: { ...BASE_POLICY, minRentalDays: 3 },
      unavailableDates: EMPTY_UNAVAIL,
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/ขั้นต่ำ/);
  });

  it("fails when nights > maxRentalDays", () => {
    const result = validateBookingRange({
      startDate: "2024-06-12",
      endDate: "2024-06-19",  // 8 nights
      effectivePolicy: { ...BASE_POLICY, maxRentalDays: 5 },
      unavailableDates: EMPTY_UNAVAIL,
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/สูงสุด/);
  });

  it("passes when maxRentalDays is null (unlimited)", () => {
    const result = validateBookingRange({
      startDate: "2024-06-12",
      endDate: "2024-12-31",
      effectivePolicy: { ...BASE_POLICY, maxRentalDays: null },
      unavailableDates: EMPTY_UNAVAIL,
      today: TODAY,
    });
    expect(result.ok).toBe(true);
  });

  it("fails when a date in the window is unavailable", () => {
    const result = validateBookingRange({
      startDate: "2024-06-12",
      endDate: "2024-06-14",
      effectivePolicy: { ...BASE_POLICY, bufferDaysBefore: 0, bufferDaysAfter: 0, cleaningDays: 0 },
      unavailableDates: new Set(["2024-06-13"]),
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/ไม่ว่าง/);
  });

  it("fails when startDate weekday is in closedWeekdays", () => {
    // 2024-06-16 is a Sunday (weekday 0)
    const result = validateBookingRange({
      startDate: "2024-06-16",
      endDate: "2024-06-18",
      effectivePolicy: { ...BASE_POLICY, closedWeekdays: [0] },
      unavailableDates: EMPTY_UNAVAIL,
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/ปิดทำการ/);
  });

  it("express outbound: the before-buffer scan window collapses to 0", () => {
    // Add an unavailable date 2 days before start — standard would fail, express should pass
    const result = validateBookingRange({
      startDate: "2024-06-12",
      endDate: "2024-06-14",
      effectivePolicy: { ...BASE_POLICY, bufferDaysBefore: 2 },
      unavailableDates: new Set(["2024-06-10"]), // 2 days before start
      today: TODAY,
      outboundMethod: "express",
      returnMethod: "standard",
    });
    // With express outbound, before=0, so 2024-06-10 is NOT in the scan window → should pass
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BOOKING_BLOCKING_STATUSES — sanity
// ---------------------------------------------------------------------------

describe("BOOKING_BLOCKING_STATUSES", () => {
  it("contains the 5 expected hold statuses", () => {
    expect(BOOKING_BLOCKING_STATUSES.has("waiting_for_payment")).toBe(true);
    expect(BOOKING_BLOCKING_STATUSES.has("payment_review")).toBe(true);
    expect(BOOKING_BLOCKING_STATUSES.has("confirmed")).toBe(true);
    expect(BOOKING_BLOCKING_STATUSES.has("renting")).toBe(true);
    expect(BOOKING_BLOCKING_STATUSES.has("awaiting_return")).toBe(true);
  });

  it("does NOT contain booking_pending", () => {
    expect(BOOKING_BLOCKING_STATUSES.has("booking_pending")).toBe(false);
  });

  it("does NOT contain terminal statuses", () => {
    for (const s of ["cancelled", "rejected", "payment_expired", "completed"] as const) {
      expect(BOOKING_BLOCKING_STATUSES.has(s)).toBe(false);
    }
  });
});
