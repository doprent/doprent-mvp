/**
 * tests/booking-dates.test.ts
 *
 * Tests for pure date helpers in lib/booking-dates.ts.
 */

import { describe, it, expect } from "vitest";
import { addDaysLocal, dateRangeLocal } from "@/lib/booking-dates";

// ---------------------------------------------------------------------------
// addDaysLocal
// ---------------------------------------------------------------------------

describe("addDaysLocal", () => {
  it("adds positive days", () => {
    expect(addDaysLocal("2024-03-15", 3)).toBe("2024-03-18");
  });

  it("subtracts days when negative", () => {
    expect(addDaysLocal("2024-03-15", -2)).toBe("2024-03-13");
  });

  it("returns same date when adding 0", () => {
    expect(addDaysLocal("2024-03-15", 0)).toBe("2024-03-15");
  });

  it("crosses month boundaries", () => {
    expect(addDaysLocal("2024-01-30", 5)).toBe("2024-02-04");
  });

  it("crosses year boundaries", () => {
    expect(addDaysLocal("2023-12-30", 5)).toBe("2024-01-04");
  });

  it("handles leap year correctly", () => {
    expect(addDaysLocal("2024-02-28", 1)).toBe("2024-02-29"); // 2024 is a leap year
    expect(addDaysLocal("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("handles non-leap year February", () => {
    expect(addDaysLocal("2023-02-28", 1)).toBe("2023-03-01"); // 2023 is not a leap year
  });
});

// ---------------------------------------------------------------------------
// dateRangeLocal
// ---------------------------------------------------------------------------

describe("dateRangeLocal", () => {
  it("returns a single date for same start and end", () => {
    expect(dateRangeLocal("2024-06-15", "2024-06-15")).toEqual(["2024-06-15"]);
  });

  it("returns all dates in an inclusive range", () => {
    expect(dateRangeLocal("2024-06-13", "2024-06-15")).toEqual([
      "2024-06-13",
      "2024-06-14",
      "2024-06-15",
    ]);
  });

  it("returns empty array when end < start", () => {
    expect(dateRangeLocal("2024-06-15", "2024-06-13")).toEqual([]);
  });

  it("crosses month boundaries correctly", () => {
    const range = dateRangeLocal("2024-01-30", "2024-02-02");
    expect(range).toEqual(["2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02"]);
  });

  it("length equals day count", () => {
    const range = dateRangeLocal("2024-06-01", "2024-06-30");
    expect(range.length).toBe(30);
  });
});
