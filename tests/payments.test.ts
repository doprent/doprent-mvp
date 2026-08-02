/**
 * tests/payments.test.ts
 *
 * Tests for pure functions in lib/payments.ts.
 * promptPayQrDataUrl is intentionally skipped — it calls the QR library and
 * is async/side-effect-y (network-like). Only availablePaymentChannels and
 * resolvePaymentChannel are pure.
 */

import { describe, it, expect } from "vitest";
import {
  availablePaymentChannels,
  resolvePaymentChannel,
} from "@/lib/payments";
import type { ShopPaymentInfo } from "@/lib/payments";

// ---------------------------------------------------------------------------
// availablePaymentChannels
// ---------------------------------------------------------------------------

describe("availablePaymentChannels", () => {
  it("returns empty array when nothing is configured", () => {
    const shop: ShopPaymentInfo = {};
    expect(availablePaymentChannels(shop)).toEqual([]);
  });

  it("returns ['promptpay'] when only promptpayId is set", () => {
    const shop: ShopPaymentInfo = { promptpayId: "0812345678" };
    expect(availablePaymentChannels(shop)).toEqual(["promptpay"]);
  });

  it("returns ['bank'] when only bank account is set", () => {
    const shop: ShopPaymentInfo = { bankAccountNumber: "123456789" };
    expect(availablePaymentChannels(shop)).toEqual(["bank"]);
  });

  it("returns both when both are configured", () => {
    const shop: ShopPaymentInfo = {
      promptpayId: "0812345678",
      bankAccountNumber: "123456789",
    };
    expect(availablePaymentChannels(shop)).toEqual(["promptpay", "bank"]);
  });

  it("ignores empty-string promptpayId", () => {
    const shop: ShopPaymentInfo = { promptpayId: "   " };
    expect(availablePaymentChannels(shop)).toEqual([]);
  });

  it("ignores empty-string bankAccountNumber", () => {
    const shop: ShopPaymentInfo = { bankAccountNumber: " " };
    expect(availablePaymentChannels(shop)).toEqual([]);
  });

  it("ignores null values", () => {
    const shop: ShopPaymentInfo = { promptpayId: null, bankAccountNumber: null };
    expect(availablePaymentChannels(shop)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolvePaymentChannel
// ---------------------------------------------------------------------------

describe("resolvePaymentChannel", () => {
  it("returns null when no channels are configured", () => {
    expect(resolvePaymentChannel({})).toBeNull();
  });

  it("returns the only available channel regardless of preferred", () => {
    const shop: ShopPaymentInfo = { promptpayId: "0812345678" };
    expect(resolvePaymentChannel(shop, "bank")).toBe("promptpay");
  });

  it("returns preferred when both channels available and preferred is valid", () => {
    const shop: ShopPaymentInfo = {
      promptpayId: "0812345678",
      bankAccountNumber: "123456789",
    };
    expect(resolvePaymentChannel(shop, "bank")).toBe("bank");
    expect(resolvePaymentChannel(shop, "promptpay")).toBe("promptpay");
  });

  it("falls back to shop.defaultPaymentMethod when preferred is absent", () => {
    const shop: ShopPaymentInfo = {
      promptpayId: "0812345678",
      bankAccountNumber: "123456789",
      defaultPaymentMethod: "bank",
    };
    expect(resolvePaymentChannel(shop)).toBe("bank");
  });

  it("falls back to first available when preferred invalid and no default", () => {
    const shop: ShopPaymentInfo = {
      promptpayId: "0812345678",
      bankAccountNumber: "123456789",
    };
    expect(resolvePaymentChannel(shop, null)).toBe("promptpay");
  });

  it("uses defaultPaymentMethod over first-available when preferred is null", () => {
    const shop: ShopPaymentInfo = {
      promptpayId: "0812345678",
      bankAccountNumber: "123456789",
      defaultPaymentMethod: "bank",
    };
    expect(resolvePaymentChannel(shop, null)).toBe("bank");
  });

  it("preferred takes precedence over defaultPaymentMethod", () => {
    const shop: ShopPaymentInfo = {
      promptpayId: "0812345678",
      bankAccountNumber: "123456789",
      defaultPaymentMethod: "bank",
    };
    expect(resolvePaymentChannel(shop, "promptpay")).toBe("promptpay");
  });
});
