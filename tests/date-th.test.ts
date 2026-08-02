/**
 * tests/date-th.test.ts
 *
 * Tests for pure formatting helpers in lib/date-th.ts.
 * All functions are pure (no DB/network/process-global deps).
 */

import { describe, it, expect } from "vitest";
import {
  fmtThai,
  fmtThaiShort,
  fmtThaiLong,
  toLocalYmd,
  ymdUtc,
  fmtRentalWindow,
  MONTHS_TH,
  MONTHS_TH_FULL,
  DAYS_TH,
} from "@/lib/date-th";

// ---------------------------------------------------------------------------
// fmtThai  ("YYYY-MM-DD" → "DD/MM/YYYY")
// ---------------------------------------------------------------------------

describe("fmtThai", () => {
  it("formats a standard date", () => {
    expect(fmtThai("2024-03-15")).toBe("15/03/2024");
  });

  it("preserves zero-padded month and day", () => {
    expect(fmtThai("2024-01-05")).toBe("05/01/2024");
  });

  it("returns the input unchanged when it cannot be parsed (empty parts)", () => {
    // fmtThai splits on "-"; empty string has no parts → returns input unchanged
    expect(fmtThai("")).toBe("");
  });

  it("gracefully rearranges any hyphen-delimited string (3 parts)", () => {
    // fmtThai("not-a-date") => "date/a/not" (y=not, m=a, d=date → d/m/y)
    // This documents the actual behavior — the guard only fires on missing parts
    expect(fmtThai("not-a-date")).toBe("date/a/not");
  });

  it("handles December correctly", () => {
    expect(fmtThai("2023-12-31")).toBe("31/12/2023");
  });
});

// ---------------------------------------------------------------------------
// fmtThaiShort  ("YYYY-MM-DD" → "DD/MM/YY")
// ---------------------------------------------------------------------------

describe("fmtThaiShort", () => {
  it("formats with 2-digit year", () => {
    expect(fmtThaiShort("2024-03-15")).toBe("15/03/24");
  });

  it("returns unchanged for invalid input", () => {
    expect(fmtThaiShort("bad")).toBe("bad");
  });

  it("uses last 2 digits of Gregorian year", () => {
    expect(fmtThaiShort("2000-01-01")).toBe("01/01/00");
    expect(fmtThaiShort("1999-12-31")).toBe("31/12/99");
  });
});

// ---------------------------------------------------------------------------
// fmtThaiLong  ("YYYY-MM-DD" → "D <full Thai month> <CE year>")
// ---------------------------------------------------------------------------

describe("fmtThaiLong", () => {
  it("formats with full Thai month name", () => {
    expect(fmtThaiLong("2024-03-15")).toBe("15 มีนาคม 2024");
  });

  it("strips leading zero from day", () => {
    expect(fmtThaiLong("2024-01-05")).toBe("5 มกราคม 2024");
  });

  it("handles December (month index 11)", () => {
    expect(fmtThaiLong("2023-12-31")).toBe("31 ธันวาคม 2023");
  });

  it("returns unchanged for invalid input", () => {
    expect(fmtThaiLong("foo-bar")).toBe("foo-bar");
  });
});

// ---------------------------------------------------------------------------
// ymdUtc  (Date → "YYYY-MM-DD" in UTC)
// ---------------------------------------------------------------------------

describe("ymdUtc", () => {
  it("formats UTC midnight correctly", () => {
    const d = new Date("2024-06-15T00:00:00Z");
    expect(ymdUtc(d)).toBe("2024-06-15");
  });

  it("uses UTC date (not local)", () => {
    // 2024-06-14T21:00:00Z is still 2024-06-14 in UTC but could be 2024-06-15 in +7
    const d = new Date("2024-06-14T21:00:00Z");
    expect(ymdUtc(d)).toBe("2024-06-14");
  });
});

// ---------------------------------------------------------------------------
// toLocalYmd  (Date → "YYYY-MM-DD" using local clock)
// ---------------------------------------------------------------------------

describe("toLocalYmd", () => {
  it("formats using local getFullYear/getMonth/getDate", () => {
    // Use a date that won't be affected by timezone offset in tests
    const d = new Date(2024, 2, 15); // March 15 2024 local
    expect(toLocalYmd(d)).toBe("2024-03-15");
  });

  it("zero-pads month and day", () => {
    const d = new Date(2024, 0, 5); // Jan 5 2024 local
    expect(toLocalYmd(d)).toBe("2024-01-05");
  });
});

// ---------------------------------------------------------------------------
// fmtRentalWindow
// ---------------------------------------------------------------------------

describe("fmtRentalWindow", () => {
  it("formats with start + end times", () => {
    const result = fmtRentalWindow("2024-03-15", "2024-03-17", "09:00", "18:00");
    expect(result).toBe("15/03/2024 09:00 – 17/03/2024 18:00");
  });

  it("formats full-day when times are null", () => {
    const result = fmtRentalWindow("2024-03-15", "2024-03-17", null, null);
    expect(result).toBe("15/03/2024 – 17/03/2024 · ทั้งวัน");
  });

  it("formats full-day when times are undefined", () => {
    const result = fmtRentalWindow("2024-03-15", "2024-03-17");
    expect(result).toBe("15/03/2024 – 17/03/2024 · ทั้งวัน");
  });

  it("formats full-day when only one time is provided", () => {
    // startTime without endTime → full-day fallback
    const result = fmtRentalWindow("2024-03-15", "2024-03-17", "09:00", null);
    expect(result).toBe("15/03/2024 – 17/03/2024 · ทั้งวัน");
  });
});

// ---------------------------------------------------------------------------
// Constants — structural invariants
// ---------------------------------------------------------------------------

describe("MONTHS_TH", () => {
  it("has 12 entries", () => {
    expect(MONTHS_TH.length).toBe(12);
  });

  it("starts with ม.ค. and ends with ธ.ค.", () => {
    expect(MONTHS_TH[0]).toBe("ม.ค.");
    expect(MONTHS_TH[11]).toBe("ธ.ค.");
  });
});

describe("MONTHS_TH_FULL", () => {
  it("has 12 entries", () => {
    expect(MONTHS_TH_FULL.length).toBe(12);
  });

  it("starts with มกราคม and ends with ธันวาคม", () => {
    expect(MONTHS_TH_FULL[0]).toBe("มกราคม");
    expect(MONTHS_TH_FULL[11]).toBe("ธันวาคม");
  });
});

describe("DAYS_TH", () => {
  it("has 7 entries (Sun-first)", () => {
    expect(DAYS_TH.length).toBe(7);
  });

  it("starts with อา (Sunday) and ends with ส (Saturday)", () => {
    expect(DAYS_TH[0]).toBe("อา");
    expect(DAYS_TH[6]).toBe("ส");
  });
});
