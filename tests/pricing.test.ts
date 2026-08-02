/**
 * tests/pricing.test.ts
 *
 * Tests for pure pricing helpers in lib/pricing.ts.
 * No DB, no network.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeTiers,
  tierForNights,
  priceForNights,
  startingPerDay,
  hasMultipleRates,
  validateTiers,
} from "@/lib/pricing";
import type { PriceTier } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ONE_TIER: PriceTier[] = [{ min: 1, max: null, per_day: 500 }];

const THREE_TIERS: PriceTier[] = [
  { min: 1, max: 3, per_day: 600 },
  { min: 4, max: 7, per_day: 500 },
  { min: 8, max: null, per_day: 400 },
];

// ---------------------------------------------------------------------------
// normalizeTiers
// ---------------------------------------------------------------------------

describe("normalizeTiers", () => {
  it("returns empty array for null/undefined", () => {
    expect(normalizeTiers(null)).toEqual([]);
    expect(normalizeTiers(undefined)).toEqual([]);
  });

  it("parses a JSON string array", () => {
    const raw = JSON.stringify([{ min: 1, max: null, per_day: 500 }]);
    expect(normalizeTiers(raw)).toEqual([{ min: 1, max: null, per_day: 500 }]);
  });

  it("accepts an already-parsed array", () => {
    expect(normalizeTiers([{ min: 1, max: null, per_day: 500 }])).toEqual([
      { min: 1, max: null, per_day: 500 },
    ]);
  });

  it("filters out tiers with invalid min (<1)", () => {
    const raw = [
      { min: 0, max: null, per_day: 500 },
      { min: 1, max: null, per_day: 400 },
    ];
    const result = normalizeTiers(raw);
    expect(result.length).toBe(1);
    expect(result[0].min).toBe(1);
  });

  it("filters out tiers with per_day <= 0", () => {
    const result = normalizeTiers([
      { min: 1, max: null, per_day: 0 },
      { min: 1, max: null, per_day: -100 },
    ]);
    expect(result.length).toBe(0);
  });

  it("filters out tiers where max < min", () => {
    const result = normalizeTiers([{ min: 5, max: 3, per_day: 500 }]);
    expect(result.length).toBe(0);
  });

  it("sorts tiers by min ascending", () => {
    const raw = [
      { min: 8, max: null, per_day: 400 },
      { min: 1, max: 3, per_day: 600 },
      { min: 4, max: 7, per_day: 500 },
    ];
    const result = normalizeTiers(raw);
    expect(result[0].min).toBe(1);
    expect(result[1].min).toBe(4);
    expect(result[2].min).toBe(8);
  });

  it("rounds per_day to integer", () => {
    const result = normalizeTiers([{ min: 1, max: null, per_day: 499.9 }]);
    expect(result[0].per_day).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// tierForNights
// ---------------------------------------------------------------------------

describe("tierForNights", () => {
  it("returns null for empty tiers", () => {
    expect(tierForNights([], 3)).toBeNull();
  });

  it("returns null for nights <= 0", () => {
    expect(tierForNights(THREE_TIERS, 0)).toBeNull();
    expect(tierForNights(THREE_TIERS, -1)).toBeNull();
  });

  it("selects the correct tier for nights in range", () => {
    expect(tierForNights(THREE_TIERS, 1)?.per_day).toBe(600);
    expect(tierForNights(THREE_TIERS, 3)?.per_day).toBe(600);
    expect(tierForNights(THREE_TIERS, 4)?.per_day).toBe(500);
    expect(tierForNights(THREE_TIERS, 7)?.per_day).toBe(500);
    expect(tierForNights(THREE_TIERS, 8)?.per_day).toBe(400);
    expect(tierForNights(THREE_TIERS, 100)?.per_day).toBe(400); // open-ended last tier
  });
});

// ---------------------------------------------------------------------------
// priceForNights
// ---------------------------------------------------------------------------

describe("priceForNights", () => {
  it("uses fallback when no tiers provided", () => {
    const { perDay, total } = priceForNights(null, 500, 3);
    expect(perDay).toBe(500);
    expect(total).toBe(1500);
  });

  it("uses tier when tiers provided", () => {
    const { perDay, total } = priceForNights(THREE_TIERS, 999, 4);
    expect(perDay).toBe(500); // tier 4-7
    expect(total).toBe(2000); // 500 * 4
  });

  it("returns total=0 for nights <= 0", () => {
    const { total } = priceForNights(THREE_TIERS, 500, 0);
    expect(total).toBe(0);
  });

  it("uses empty tiers array as no-tiers (fallback)", () => {
    const { perDay } = priceForNights([], 750, 5);
    expect(perDay).toBe(750);
  });
});

// ---------------------------------------------------------------------------
// startingPerDay
// ---------------------------------------------------------------------------

describe("startingPerDay", () => {
  it("returns the minimum per_day from tiers", () => {
    expect(startingPerDay(THREE_TIERS, 999)).toBe(400);
  });

  it("returns fallbackPerDay when tiers is null", () => {
    expect(startingPerDay(null, 750)).toBe(750);
  });

  it("returns fallbackPerDay when tiers is empty", () => {
    expect(startingPerDay([], 750)).toBe(750);
  });
});

// ---------------------------------------------------------------------------
// hasMultipleRates
// ---------------------------------------------------------------------------

describe("hasMultipleRates", () => {
  it("returns false when tiers is null/empty", () => {
    expect(hasMultipleRates(null)).toBe(false);
    expect(hasMultipleRates([])).toBe(false);
  });

  it("returns false when only one tier", () => {
    expect(hasMultipleRates(ONE_TIER)).toBe(false);
  });

  it("returns false when multiple tiers with same rate", () => {
    const same: PriceTier[] = [
      { min: 1, max: 3, per_day: 500 },
      { min: 4, max: null, per_day: 500 },
    ];
    expect(hasMultipleRates(same)).toBe(false);
  });

  it("returns true when tiers have different rates", () => {
    expect(hasMultipleRates(THREE_TIERS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTiers
// ---------------------------------------------------------------------------

describe("validateTiers", () => {
  it("passes a valid single-tier set", () => {
    expect(validateTiers(ONE_TIER).ok).toBe(true);
  });

  it("passes a valid multi-tier set", () => {
    expect(validateTiers(THREE_TIERS).ok).toBe(true);
  });

  it("fails when empty", () => {
    expect(validateTiers([]).ok).toBe(false);
  });

  it("fails when first tier does not start at day 1", () => {
    const result = validateTiers([{ min: 2, max: null, per_day: 500 }]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1 วัน/);
  });

  it("fails when a non-last tier has max=null", () => {
    const bad: PriceTier[] = [
      { min: 1, max: null, per_day: 600 }, // open-ended but not last
      { min: 2, max: null, per_day: 500 },
    ];
    expect(validateTiers(bad).ok).toBe(false);
  });

  it("fails when last tier is not open-ended (max != null)", () => {
    const bad: PriceTier[] = [{ min: 1, max: 5, per_day: 500 }];
    expect(validateTiers(bad).ok).toBe(false);
  });

  it("fails when tiers are not contiguous", () => {
    const bad: PriceTier[] = [
      { min: 1, max: 3, per_day: 600 },
      { min: 5, max: null, per_day: 500 }, // gap: 4 missing
    ];
    expect(validateTiers(bad).ok).toBe(false);
    expect(validateTiers(bad).error).toMatch(/ต่อเนื่อง/);
  });

  it("fails when a later tier has higher per_day (more expensive per day for longer rentals)", () => {
    const bad: PriceTier[] = [
      { min: 1, max: 3, per_day: 400 },
      { min: 4, max: null, per_day: 600 }, // more expensive for longer rental
    ];
    expect(validateTiers(bad).ok).toBe(false);
  });

  it("passes when later tiers have same or lower per_day", () => {
    const same: PriceTier[] = [
      { min: 1, max: 3, per_day: 500 },
      { min: 4, max: null, per_day: 500 }, // same is ok
    ];
    expect(validateTiers(same).ok).toBe(true);
  });

  it("fails when per_day = 0", () => {
    expect(validateTiers([{ min: 1, max: null, per_day: 0 }]).ok).toBe(false);
  });
});
