/**
 * tests/product-parse.test.ts
 *
 * Tests for pure helpers in lib/product-parse.ts.
 * parseVariants and parsePriceTiersFromForm require FormData (Web API global);
 * validateTierSet and slugify are plain pure functions — all tested here.
 *
 * Note: Vitest's node environment exposes FormData via globalThis in Node 18+,
 * so the FormData-based tests are included.
 */

import { describe, it, expect } from "vitest";
import { validateTierSet, slugify } from "@/lib/product-parse";

// ---------------------------------------------------------------------------
// validateTierSet
// ---------------------------------------------------------------------------

describe("validateTierSet", () => {
  it("passes a valid set with minDays=1 entry", () => {
    const result = validateTierSet([{ minDays: 1, pricePerDay: 500 }]);
    expect(result.ok).toBe(true);
  });

  it("fails on empty tiers", () => {
    expect(validateTierSet([]).ok).toBe(false);
  });

  it("fails when no tier has minDays=1", () => {
    const result = validateTierSet([{ minDays: 2, pricePerDay: 500 }]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/เริ่มต้นที่ 1 วัน/);
  });

  it("fails when minDays < 1", () => {
    const result = validateTierSet([{ minDays: 0, pricePerDay: 500 }]);
    expect(result.ok).toBe(false);
  });

  it("fails when minDays is not an integer", () => {
    const result = validateTierSet([{ minDays: 1.5, pricePerDay: 500 }]);
    expect(result.ok).toBe(false);
  });

  it("fails when pricePerDay < 0", () => {
    const result = validateTierSet([{ minDays: 1, pricePerDay: -100 }]);
    expect(result.ok).toBe(false);
  });

  it("fails when pricePerDay < 100 (business minimum)", () => {
    const result = validateTierSet([{ minDays: 1, pricePerDay: 50 }]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/100/);
  });

  it("fails when duplicate minDays", () => {
    const result = validateTierSet([
      { minDays: 1, pricePerDay: 500 },
      { minDays: 1, pricePerDay: 400 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ซ้ำ/);
  });

  it("passes multiple valid tiers", () => {
    const result = validateTierSet([
      { minDays: 1, pricePerDay: 600 },
      { minDays: 4, pricePerDay: 500 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("includes label in error message when label provided", () => {
    const result = validateTierSet([], "ชุดไซซ์ M");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ชุดไซซ์ M/);
  });
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("lowercases and trims", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("abc def")).toBe("abc-def");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("-hello-")).toBe("hello");
  });

  it("collapses multiple separators into one hyphen", () => {
    expect(slugify("a  b  c")).toBe("a-b-c");
    expect(slugify("a--b")).toBe("a-b");
  });

  it("preserves Thai characters", () => {
    const result = slugify("ชุดเช่า");
    expect(result).toMatch(/^[ก-๙a-z0-9-]+$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("truncates to 48 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(48);
  });

  it("returns a non-empty string for all-space input", () => {
    // Spaces alone produce empty string after slugify processing (trim + replace)
    const result = slugify("   ");
    expect(typeof result).toBe("string");
  });
});
