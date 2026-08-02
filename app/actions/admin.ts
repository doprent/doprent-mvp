"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { base, db } from "@/lib/db";
import { withActor } from "@/lib/db-context";
import { dueAt } from "@/lib/bookings";
import { uploadPrivateToR2 } from "@/lib/r2";
import { detectSlipMime } from "@/lib/file-mime";
import { BOOKING_SLIP_MAX_BYTES } from "@/lib/config";
import { notifyBookingCancelled, notifyRefundIssued } from "@/lib/notifications";
import type { BookingStatus } from "@/lib/types";

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  if (user.role !== "admin") return { ok: false, error: "ต้องเป็น admin" };
  return { ok: true, userId: user.id };
}

/**
 * Write a business audit row to audit_logs (DESIGN §6.1).
 * Uses `base` (un-extended) to avoid re-auditing the audit write itself.
 */
async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string | null,
  payload?: Record<string, unknown>,
) {
  try {
    await base.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: targetType,
        entityId: targetId,
        actorId: adminId,
        before: Prisma.JsonNull,
        after: {
          admin_action: action,
          reason: reason ?? null,
          ...payload,
        },
      },
    });
  } catch (e) {
    console.error("[admin audit] write failed", action, e);
  }
}

export async function approveKyc(kycId: string, notes?: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const kyc = await db.kycSubmission.findUnique({ where: { id: kycId } });
  if (!kyc) return { ok: false, error: "ไม่พบ KYC" };

  const isPaidPlan = kyc.plan === "boost" || kyc.plan === "featured";

  return withActor(auth.userId, async () => {
    await db.kycSubmission.update({
      where: { id: kycId },
      data: { status: "approved", reviewerId: auth.userId, reviewNotes: notes ?? null, reviewedAt: new Date() },
    });
    await db.shop.update({
      where: { id: kyc.shopId },
      data: { kycStatus: "verified", verified: isPaidPlan, status: "live" },
    });
    await logAdminAction(auth.userId, "approve_kyc", "kyc", kycId, notes ?? null, { plan: kyc.plan, verified: isPaidPlan });

    revalidatePath("/admin");
    revalidatePath("/admin/kyc");
    revalidatePath("/admin/shops");
    revalidatePath("/sell/dashboard");
    return { ok: true };
  });
}

export async function rejectKyc(kycId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!reason.trim()) return { ok: false, error: "ระบุเหตุผลด้วย" };

  const kyc = await db.kycSubmission.findUnique({ where: { id: kycId } });
  if (!kyc) return { ok: false, error: "ไม่พบ KYC" };

  return withActor(auth.userId, async () => {
    await db.kycSubmission.update({
      where: { id: kycId },
      data: { status: "rejected", reviewerId: auth.userId, reviewNotes: reason, reviewedAt: new Date() },
    });
    await db.shop.update({ where: { id: kyc.shopId }, data: { kycStatus: "rejected" } });
    await logAdminAction(auth.userId, "reject_kyc", "kyc", kycId, reason);

    revalidatePath("/admin/kyc");
    revalidatePath("/sell/dashboard");
    return { ok: true };
  });
}

export async function setShopStatus(
  shopId: string,
  status: "live" | "pending" | "rejected",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  return withActor(auth.userId, async () => {
    await db.shop.update({
      where: { id: shopId },
      data: { status, rejectReason: status === "rejected" ? reason ?? null : null },
    });
    await logAdminAction(auth.userId, `set_shop_${status}`, "shop", shopId, reason ?? null);

    revalidatePath("/admin/shops");
    revalidatePath("/");
    return { ok: true };
  });
}

export async function toggleShopVerified(shopId: string, verified: boolean): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  return withActor(auth.userId, async () => {
    await db.shop.update({ where: { id: shopId }, data: { verified } });
    await logAdminAction(auth.userId, verified ? "verify_shop" : "unverify_shop", "shop", shopId, null);

    revalidatePath("/admin/shops");
    revalidatePath("/");
    return { ok: true };
  });
}

export async function toggleShopFeatured(shopId: string, featured: boolean): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  return withActor(auth.userId, async () => {
    await db.shop.update({ where: { id: shopId }, data: { featured } });
    await logAdminAction(auth.userId, featured ? "feature_shop" : "unfeature_shop", "shop", shopId, null);

    revalidatePath("/admin/shops");
    revalidatePath("/");
    return { ok: true };
  });
}

export async function setProductStatus(
  productId: string,
  status: "live" | "pending" | "rejected",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  return withActor(auth.userId, async () => {
    await db.product.update({
      where: { id: productId },
      data: { status, rejectReason: status === "rejected" ? reason ?? null : null },
    });
    await logAdminAction(auth.userId, `set_product_${status}`, "product", productId, reason ?? null);

    revalidatePath("/admin/products");
    revalidatePath("/");
    return { ok: true };
  });
}

export async function toggleProductFeatured(productId: string, featured: boolean): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  return withActor(auth.userId, async () => {
    await db.product.update({ where: { id: productId }, data: { featured } });
    await logAdminAction(auth.userId, featured ? "feature_product" : "unfeature_product", "product", productId, null);

    revalidatePath("/admin/products");
    revalidatePath("/");
    return { ok: true };
  });
}

/* --------------------------- booking resolution --------------------------- */
/* Admin resolves the two dead-end statuses (cancel_requested, slip_disputed). */

function revalidateBookingPaths(bookingId: string) {
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
}

export async function adminApproveCancel(
  bookingId: string,
  note?: string,
  refundAmount?: number,
  refundNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      cancelReason: true,
      cancelFromStatus: true,
      cancelledBy: true,
      renter: { select: { email: true } },
      items: { select: { id: true, unitId: true, product: { select: { name: true } } } },
    },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.status !== "cancel_requested")
    return { ok: false, error: "การจองนี้ไม่ได้อยู่ในสถานะรอยกเลิก" };

  // Statuses that imply the renter already paid → refund is required.
  const paidStatuses: (BookingStatus | string)[] = [
    "payment_review",
    "confirmed",
    "renting",
    "awaiting_return",
  ];
  const refundRequired = paidStatuses.includes(booking.cancelFromStatus ?? "");
  const refundStatus = refundRequired ? "required" : "none";

  // Preserve who originally requested — shop/renter; fall back to "admin".
  const cancelledBy = booking.cancelledBy ?? "admin";

  return withActor(auth.userId, async () => {
    // Atomic: cancel the booking AND release the unit in one transaction.
    const res = await db.$transaction(async (tx) => {
      const moved = await tx.booking.updateMany({
        where: { id: bookingId, status: "cancel_requested" },
        data: {
          status: "cancelled",
          cancelledBy,
          refundStatus,
          ...(refundRequired && refundAmount != null ? { refundAmount } : {}),
          ...(refundNote ? { refundNote } : {}),
        },
      });
      // Release the held units back to available stock.
      if (moved.count > 0) {
        const unitIds = booking.items.map((i) => i.unitId).filter((x): x is string => !!x);
        if (unitIds.length > 0) {
          await tx.productUnit.updateMany({
            where: { id: { in: unitIds } },
            data: { status: "available" },
          });
        }
        await tx.bookingItem.updateMany({ where: { bookingId }, data: { unitId: null } });
      }
      return moved;
    });
    if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

    await logAdminAction(auth.userId, "approve_booking_cancel", "booking", bookingId, note ?? null, {
      cancelledBy,
      sellerReason: booking.cancelReason,
      fromStatus: booking.cancelFromStatus,
      refundRequired,
      refundAmount: refundAmount ?? null,
    });

    // Notify the renter their booking was cancelled (+ refund status).
    notifyBookingCancelled({
      renterEmail: booking.renter?.email,
      dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
      bookingId,
      refundRequired,
      refundAmount: refundAmount ?? null,
    });

    revalidateBookingPaths(bookingId);
    return { ok: true };
  });
}

export async function adminDenyCancel(bookingId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, cancelReason: true, cancelFromStatus: true },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.status !== "cancel_requested")
    return { ok: false, error: "การจองนี้ไม่ได้อยู่ในสถานะรอยกเลิก" };

  const revertTo =
    booking.cancelFromStatus === "payment_review" || booking.cancelFromStatus === "confirmed"
      ? (booking.cancelFromStatus as "payment_review" | "confirmed")
      : "confirmed";

  return withActor(auth.userId, async () => {
    const res = await db.booking.updateMany({
      where: { id: bookingId, status: "cancel_requested" },
      data: { status: revertTo, cancelReason: null, cancelFromStatus: null },
    });
    if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

    await logAdminAction(auth.userId, "deny_booking_cancel", "booking", bookingId, note ?? null, {
      sellerReason: booking.cancelReason,
      revertedTo: revertTo,
    });
    revalidateBookingPaths(bookingId);
    return { ok: true };
  });
}

/**
 * Admin records that a refund has been issued for a cancelled booking.
 * Validates booking.refundStatus === "required", uploads the proof-of-refund
 * slip to the private bucket, then marks refundStatus = "refunded".
 * Decision: admin-only (keeps refund audit trail in one role; seller cannot
 * self-declare a refund they did not make).
 */
export async function recordRefund(
  bookingId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      refundStatus: true,
      renter: { select: { email: true } },
      items: { orderBy: { createdAt: "asc" as const }, take: 1, select: { product: { select: { name: true } } } },
    },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.refundStatus !== "required")
    return { ok: false, error: "การจองนี้ไม่อยู่ในสถานะรอคืนเงิน" };

  // Validate + upload refund slip (same MIME / size rules as payment slips).
  const file = formData.get("slip");
  if (!file || typeof file === "string") return { ok: false, error: "ยังไม่ได้เลือกไฟล์สลิป" };
  if ((file as File).size > BOOKING_SLIP_MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 5MB" };

  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const mime = detectSlipMime(buffer);
  if (!mime) return { ok: false, error: "ไฟล์ต้องเป็นรูปภาพ (JPG/PNG/WebP)" };
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];

  const key = `refunds/${bookingId}/${randomUUID()}.${ext}`;
  try {
    await uploadPrivateToR2(key, buffer, mime);
  } catch (e) {
    console.error("[doprent] refund slip upload error", e);
    return { ok: false, error: "อัปโหลดสลิปคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  // Parse optional refund amount override from the form.
  const rawAmount = formData.get("refund_amount");
  const parsedAmount = rawAmount ? Number(rawAmount) : null;
  const refundAmountUpdate =
    parsedAmount != null && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? { refundAmount: Math.round(parsedAmount) }
      : {};

  return withActor(auth.userId, async () => {
    await db.booking.update({
      where: { id: bookingId },
      data: {
        refundStatus: "refunded",
        refundedAt: new Date(),
        refundSlipPath: key,
        ...refundAmountUpdate,
      },
    });

    await logAdminAction(auth.userId, "record_refund", "booking", bookingId, null, {
      refundSlipPath: key,
      ...refundAmountUpdate,
    });

    // Notify renter.
    const rawFinal = await db.booking.findUnique({
      where: { id: bookingId },
      select: { refundAmount: true },
    });
    notifyRefundIssued({
      renterEmail: booking.renter?.email,
      dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
      bookingId,
      refundAmount: rawFinal?.refundAmount ?? null,
    });

    revalidateBookingPaths(bookingId);
    return { ok: true };
  });
}

export async function adminAcceptSlip(bookingId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  return withActor(auth.userId, async () => {
    const res = await db.booking.updateMany({
      where: { id: bookingId, status: "slip_disputed" },
      data: { status: "confirmed", cancelReason: null, cancelFromStatus: null },
    });
    if (res.count === 0) return { ok: false, error: "การจองนี้ไม่ได้อยู่ในสถานะสลิปมีปัญหา" };

    await logAdminAction(auth.userId, "accept_disputed_slip", "booking", bookingId, note ?? null);
    revalidateBookingPaths(bookingId);
    return { ok: true };
  });
}

export async function adminRejectSlip(bookingId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, slipPath: true },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.status !== "slip_disputed")
    return { ok: false, error: "การจองนี้ไม่ได้อยู่ในสถานะสลิปมีปัญหา" };

  return withActor(auth.userId, async () => {
    const res = await db.booking.updateMany({
      where: { id: bookingId, status: "slip_disputed" },
      data: {
        status: "waiting_for_payment",
        currentDueAt: new Date(dueAt()),
        cancelReason: null,
        cancelFromStatus: null,
      },
    });
    if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

    await logAdminAction(auth.userId, "reject_disputed_slip", "booking", bookingId, note ?? null, {
      rejectedSlipPath: booking.slipPath,
    });
    revalidateBookingPaths(bookingId);
    return { ok: true };
  });
}

/* ── Admin force-transition (any status → target) ── */

const ADMIN_ALLOWED_TARGETS = new Set([
  "booking_pending",
  "waiting_for_payment",
  "payment_review",
  "confirmed",
  "returned",
  "completed",
  "cancelled",
  "rejected",
]);

export async function adminForceStatus(
  bookingId: string,
  targetStatus: string,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!ADMIN_ALLOWED_TARGETS.has(targetStatus))
    return { ok: false, error: `สถานะ ${targetStatus} ไม่อนุญาต` };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.status === targetStatus)
    return { ok: false, error: "สถานะเดิมกับปลายทางเหมือนกัน" };

  return withActor(auth.userId, async () => {
    await db.booking.update({
      where: { id: bookingId },
      data: {
        status: targetStatus as BookingStatus,
        ...(targetStatus === "waiting_for_payment" ? { currentDueAt: new Date(dueAt()) } : {}),
        ...(targetStatus === "payment_review" ? { paymentReviewAt: new Date() } : {}),
      },
    });

    await logAdminAction(auth.userId, "force_status", "booking", bookingId, note ?? null, {
      from: booking.status,
      to: targetStatus,
    });
    revalidateBookingPaths(bookingId);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Admin user management
// ---------------------------------------------------------------------------

/**
 * Promote a user to the admin role by email.
 * Idempotent — if the user is already admin, returns a friendly notice.
 * Promotion only — no demotion to prevent accidental lock-out.
 */
export async function addAdminByEmail(formData: FormData): Promise<{ ok: boolean; error?: string; notice?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  if (!email) return { ok: false, error: "ระบุอีเมลด้วย" };

  const target = await db.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, fullName: true } });
  if (!target) return { ok: false, error: `ไม่พบผู้ใช้ที่มีอีเมล ${email}` };

  if (target.role === "admin") {
    return { ok: true, notice: `${email} เป็น admin อยู่แล้ว` };
  }

  await db.user.update({ where: { id: target.id }, data: { role: "admin" } });

  await logAdminAction(auth.userId, "promote_to_admin", "user", target.id, null, {
    targetEmail: target.email,
    targetName: target.fullName ?? null,
    previousRole: target.role,
  });

  revalidatePath("/admin/admins");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tag image management
// ---------------------------------------------------------------------------

/**
 * อัปเดต imageUrl ของแท็กหมวดโอกาส (admin only).
 * imageUrl = null → ลบรูปภาพออก
 */
export async function setTagImage(
  tagId: string,
  imageUrl: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const tag = await db.tag.findUnique({ where: { id: tagId }, select: { id: true } });
  if (!tag) return { ok: false, error: "ไม่พบแท็ก" };

  await withActor(auth.userId, () =>
    db.tag.update({
      where: { id: tagId },
      data: { imageUrl },
    }),
  );

  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Legacy aliases — keep old names working during transition
// ---------------------------------------------------------------------------
/** @deprecated use setShopStatus */
export const setBoutiqueStatus = setShopStatus;
/** @deprecated use toggleShopVerified */
export const toggleBoutiqueVerified = toggleShopVerified;
/** @deprecated use toggleShopFeatured */
export const toggleBoutiqueFeatured = toggleShopFeatured;
/** @deprecated use setProductStatus */
export const setDressStatus = setProductStatus;
/** @deprecated use toggleProductFeatured */
export const toggleDressFeatured = toggleProductFeatured;
