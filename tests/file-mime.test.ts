/**
 * tests/file-mime.test.ts
 *
 * Tests for magic-byte detection in lib/file-mime.ts.
 * Pure Buffer → string | null — no DB, no network.
 */

import { describe, it, expect } from "vitest";
import { detectSlipMime } from "@/lib/file-mime";

// ---------------------------------------------------------------------------
// Magic-byte fixtures
// ---------------------------------------------------------------------------

function jpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function png(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function webp(): Buffer {
  // RIFF....WEBP
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // file size (not validated)
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
}

function unknown(): Buffer {
  return Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
}

// ---------------------------------------------------------------------------
// detectSlipMime
// ---------------------------------------------------------------------------

describe("detectSlipMime", () => {
  it("detects JPEG by magic bytes", () => {
    expect(detectSlipMime(jpeg())).toBe("image/jpeg");
  });

  it("detects PNG by magic bytes", () => {
    expect(detectSlipMime(png())).toBe("image/png");
  });

  it("detects WEBP by RIFF+WEBP signature", () => {
    expect(detectSlipMime(webp())).toBe("image/webp");
  });

  it("returns null for an unknown format", () => {
    expect(detectSlipMime(unknown())).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(detectSlipMime(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for a RIFF buffer without WEBP marker", () => {
    const notWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x41, 0x56, 0x49, 0x20, // AVI (not WEBP)
    ]);
    expect(detectSlipMime(notWebp)).toBeNull();
  });
});
