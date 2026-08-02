/**
 * tests/bookings.test.ts
 *
 * Pure-function tests for lib/bookings.ts.
 * Nothing here touches the DB, network, or Prisma client.
 */

import { describe, it, expect } from "vitest";
import {
  amountDue,
  dueAt,
  commissionAmount,
  rentalDays,
  slipAutoConfirmHours,
  slipReminderOffsetHours,
  paymentWindowHours,
  isActive,
  findTransition,
  BOOKING_STATUS_META,
  TRANSITIONS,
  ACTIVE_STATUSES,
  PAYMENT_WINDOW_HOURS,
  PAYMENT_WINDOW_HOURS_SAMEDAY,
  PLATFORM_COMMISSION_RATE,
} from "@/lib/bookings";
import type { BookingStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// amountDue
// ---------------------------------------------------------------------------

describe("amountDue", () => {
  it("sums rental_total + deposit + shipping_fee", () => {
    expect(amountDue({ rental_total: 1000, deposit: 500, shipping_fee: 100 })).toBe(1600);
  });

  it("treats null shipping_fee as 0", () => {
    expect(amountDue({ rental_total: 1000, deposit: 500, shipping_fee: null })).toBe(1500);
  });

  it("treats zero shipping_fee correctly", () => {
    expect(amountDue({ rental_total: 1000, deposit: 500, shipping_fee: 0 })).toBe(1500);
  });

  it("works when all fields are zero", () => {
    expect(amountDue({ rental_total: 0, deposit: 0, shipping_fee: 0 })).toBe(0);
  });

  it("works with large values", () => {
    expect(amountDue({ rental_total: 9999, deposit: 3000, shipping_fee: 250 })).toBe(13249);
  });
});

// ---------------------------------------------------------------------------
// commissionAmount
// ---------------------------------------------------------------------------

describe("commissionAmount", () => {
  it("rounds to nearest integer", () => {
    // 1500 * 0.1 = 150 exactly
    expect(commissionAmount(1500)).toBe(150);
  });

  it("rounds down correctly", () => {
    // 1005 * 0.1 = 100.5 → rounds to 101 (Math.round)
    expect(commissionAmount(1005)).toBe(101);
  });

  it("accepts a custom rate", () => {
    expect(commissionAmount(2000, 0.15)).toBe(300);
  });

  it("returns 0 for 0 rental total", () => {
    expect(commissionAmount(0)).toBe(0);
  });

  it("handles NaN/non-numeric gracefully (treats as 0)", () => {
    expect(commissionAmount(NaN)).toBe(0);
  });

  it("default rate equals PLATFORM_COMMISSION_RATE", () => {
    const total = 1000;
    expect(commissionAmount(total)).toBe(Math.round(total * PLATFORM_COMMISSION_RATE));
  });
});

// ---------------------------------------------------------------------------
// dueAt
// ---------------------------------------------------------------------------

describe("dueAt", () => {
  it("adds the payment window hours to the given base date", () => {
    const base = new Date("2024-03-15T10:00:00Z");
    const result = dueAt(base, 3);
    expect(result).toBe(new Date("2024-03-15T13:00:00Z").toISOString());
  });

  it("defaults to PAYMENT_WINDOW_HOURS when no hours arg", () => {
    const base = new Date("2024-03-15T10:00:00Z");
    const result = dueAt(base);
    const expected = new Date(base.getTime() + PAYMENT_WINDOW_HOURS * 3600 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  it("uses PAYMENT_WINDOW_HOURS_SAMEDAY value correctly", () => {
    const base = new Date("2024-06-01T08:00:00Z");
    const result = dueAt(base, PAYMENT_WINDOW_HOURS_SAMEDAY);
    const expected = new Date(base.getTime() + 1 * 3600 * 1000).toISOString();
    expect(result).toBe(expected);
  });

  it("returns a valid ISO string", () => {
    expect(() => new Date(dueAt())).not.toThrow();
    expect(isNaN(new Date(dueAt()).getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rentalDays
// ---------------------------------------------------------------------------

describe("rentalDays", () => {
  it("returns 1 for same-day rental", () => {
    expect(rentalDays("2024-03-15", "2024-03-15")).toBe(1);
  });

  it("returns 3 for a 3-night inclusive window", () => {
    expect(rentalDays("2024-03-15", "2024-03-17")).toBe(3);
  });

  it("returns at least 1 even when end < start", () => {
    expect(rentalDays("2024-03-17", "2024-03-15")).toBeGreaterThanOrEqual(1);
  });

  it("handles month boundaries", () => {
    expect(rentalDays("2024-01-30", "2024-02-02")).toBe(4);
  });

  it("handles leap year boundary", () => {
    expect(rentalDays("2024-02-28", "2024-03-01")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// slipAutoConfirmHours
// ---------------------------------------------------------------------------

describe("slipAutoConfirmHours", () => {
  const todayBkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

  it("returns 1 for same-day booking when shop is open", () => {
    expect(
      slipAutoConfirmHours({
        startDate: todayBkk,
        shopIsOpen: true,
        shopHoursToday: true,
      }),
    ).toBe(1);
  });

  it("returns 3 for same-day booking when shop is NOT open", () => {
    expect(
      slipAutoConfirmHours({
        startDate: todayBkk,
        shopIsOpen: false,
        shopHoursToday: true,
      }),
    ).toBe(3);
  });

  it("returns 3 for same-day booking when shopHoursToday=false", () => {
    expect(
      slipAutoConfirmHours({
        startDate: todayBkk,
        shopIsOpen: true,
        shopHoursToday: false,
      }),
    ).toBe(3);
  });

  it("returns 24 for future date more than 24h away", () => {
    // Use a fixed 'now' that is far from any plausible startDate
    const fixedNow = new Date("2024-01-01T00:00:00Z");
    expect(
      slipAutoConfirmHours({
        startDate: "2024-01-10",
        shopIsOpen: true,
        shopHoursToday: true,
        now: fixedNow,
      }),
    ).toBe(24);
  });

  it("returns 12 for future date <= 24h away", () => {
    // now = 2024-01-02T00:00:00Z → Bangkok wall-clock = 2024-01-02T07:00 → todayStr = "2024-01-02"
    // startDate = "2024-01-03" → midnight Bangkok = 2024-01-02T17:00:00Z → 17h away (<= 24h)
    const fixedNow = new Date("2024-01-02T00:00:00Z");
    expect(
      slipAutoConfirmHours({
        startDate: "2024-01-03",
        shopIsOpen: true,
        shopHoursToday: true,
        now: fixedNow,
      }),
    ).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// slipReminderOffsetHours
// ---------------------------------------------------------------------------

describe("slipReminderOffsetHours", () => {
  it("returns 0.5 for 1h window", () => {
    expect(slipReminderOffsetHours(1)).toBe(0.5);
  });

  it("returns 1.5 for 3h window", () => {
    expect(slipReminderOffsetHours(3)).toBe(1.5);
  });

  it("returns 2 for 12h window", () => {
    expect(slipReminderOffsetHours(12)).toBe(2);
  });

  it("returns 2 for 24h window", () => {
    expect(slipReminderOffsetHours(24)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// paymentWindowHours
// ---------------------------------------------------------------------------

describe("paymentWindowHours", () => {
  const todayBkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

  it("returns SAMEDAY window when same-day + both open flags true", () => {
    expect(
      paymentWindowHours({ startDate: todayBkk, shopIsOpen: true, shopHoursToday: true }),
    ).toBe(PAYMENT_WINDOW_HOURS_SAMEDAY);
  });

  it("returns standard window when same-day but shop is closed", () => {
    expect(
      paymentWindowHours({ startDate: todayBkk, shopIsOpen: false, shopHoursToday: true }),
    ).toBe(PAYMENT_WINDOW_HOURS);
  });

  it("returns standard window for a future date", () => {
    expect(
      paymentWindowHours({ startDate: "2099-01-01", shopIsOpen: true, shopHoursToday: true }),
    ).toBe(PAYMENT_WINDOW_HOURS);
  });
});

// ---------------------------------------------------------------------------
// isActive
// ---------------------------------------------------------------------------

describe("isActive", () => {
  it("returns true for statuses in ACTIVE_STATUSES", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(isActive(s)).toBe(true);
    }
  });

  it("returns false for terminal statuses not in ACTIVE_STATUSES", () => {
    const nonActive: BookingStatus[] = ["cancelled", "rejected", "payment_expired", "completed"];
    for (const s of nonActive) {
      expect(isActive(s)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// findTransition
// ---------------------------------------------------------------------------

describe("findTransition", () => {
  it("finds a valid renter transition", () => {
    const t = findTransition("booking_pending", "cancelled", "renter");
    expect(t).toBeDefined();
    expect(t?.actor).toBe("renter");
  });

  it("finds a valid seller transition", () => {
    const t = findTransition("payment_review", "confirmed", "seller");
    expect(t).toBeDefined();
    expect(t?.actor).toBe("seller");
  });

  it("returns undefined for an illegal transition", () => {
    const t = findTransition("booking_pending", "completed", "renter");
    expect(t).toBeUndefined();
  });

  it("is actor-sensitive — renter cannot do seller-only moves", () => {
    const t = findTransition("booking_pending", "waiting_for_payment", "renter");
    expect(t).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BOOKING_STATUS_META — structural invariants
// ---------------------------------------------------------------------------

describe("BOOKING_STATUS_META structural invariants", () => {
  const ALL_STATUSES: BookingStatus[] = [
    "booking_pending",
    "waiting_for_payment",
    "payment_review",
    "confirmed",
    "renting",
    "awaiting_return",
    "cancel_requested",
    "slip_disputed",
    "rejected",
    "cancelled",
    "payment_expired",
    "returned",
    "completed",
    "not_returned",
    "return_disputed",
    "deposit_disputed",
  ];

  it("covers every BookingStatus", () => {
    for (const s of ALL_STATUSES) {
      expect(BOOKING_STATUS_META[s], `missing meta for ${s}`).toBeDefined();
    }
  });

  it("every meta entry has label, tone, terminal, renterHint, sellerHint", () => {
    for (const [status, meta] of Object.entries(BOOKING_STATUS_META)) {
      expect(typeof meta.label, status).toBe("string");
      expect(typeof meta.terminal, status).toBe("boolean");
      expect(typeof meta.renterHint, status).toBe("string");
      expect(typeof meta.sellerHint, status).toBe("string");
      expect(["neutral", "info", "warn", "success", "danger"]).toContain(meta.tone);
    }
  });

  it("terminal statuses are the expected set", () => {
    const terminals = ALL_STATUSES.filter((s) => BOOKING_STATUS_META[s].terminal);
    expect(new Set(terminals)).toEqual(
      new Set(["rejected", "cancelled", "payment_expired", "completed"]),
    );
  });
});

// ---------------------------------------------------------------------------
// TRANSITIONS — structural invariants
// ---------------------------------------------------------------------------

describe("TRANSITIONS structural invariants", () => {
  const ALL_STATUSES = new Set<string>([
    "booking_pending",
    "waiting_for_payment",
    "payment_review",
    "confirmed",
    "renting",
    "awaiting_return",
    "cancel_requested",
    "slip_disputed",
    "rejected",
    "cancelled",
    "payment_expired",
    "returned",
    "completed",
    "not_returned",
    "return_disputed",
    "deposit_disputed",
  ]);

  it("every transition.from is a valid BookingStatus", () => {
    for (const t of TRANSITIONS) {
      expect(ALL_STATUSES.has(t.from), `invalid from: ${t.from}`).toBe(true);
    }
  });

  it("every transition.to is a valid BookingStatus", () => {
    for (const t of TRANSITIONS) {
      expect(ALL_STATUSES.has(t.to), `invalid to: ${t.to}`).toBe(true);
    }
  });

  it("terminal statuses have no outgoing transitions", () => {
    const terminals = ["rejected", "cancelled", "payment_expired", "completed"];
    for (const t of TRANSITIONS) {
      expect(terminals, `terminal ${t.from} has outgoing transition`).not.toContain(t.from);
    }
  });

  it("actor is always renter or seller", () => {
    for (const t of TRANSITIONS) {
      expect(["renter", "seller"]).toContain(t.actor);
    }
  });

  it("has no duplicate (from, to, actor) combinations", () => {
    const seen = new Set<string>();
    for (const t of TRANSITIONS) {
      const key = `${t.from}|${t.to}|${t.actor}`;
      expect(seen.has(key), `duplicate transition: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("requires field is only shipping_fee or slip_path when set", () => {
    for (const t of TRANSITIONS) {
      if (t.requires !== undefined) {
        expect(["shipping_fee", "slip_path"]).toContain(t.requires);
      }
    }
  });
});
