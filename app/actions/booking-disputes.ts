"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { withActor } from "@/lib/db-context";
import { getCurrentUser } from "@/lib/auth";
import { uploadPrivateToR2 } from "@/lib/r2";
import { BOOKING_SLIP_MAX_BYTES } from "@/lib/config";
import { detectSlipMime } from "@/lib/file-mime";
import {
  notifyAdminReturnDisputeEscalated,
  notifyReturnDisputeResolved,
  notifyAdminDisputeEscalated,
  notifyDepositDisputed,
  notifyDepositDisputeResolved,
  notifyRefundSlipUploaded,
} from "@/lib/notifications";
import { loadBooking } from "@/lib/booking-loader";
import type { Result } from "@/lib/booking-helpers";

/** Hours the renter has to escalate a return dispute before it becomes final. */
const RETURN_DISPUTE_WINDOW_HOURS = 48;

/** Hours the renter has to dispute a deposit decision before it becomes final. */
const DEPOSIT_DISPUTE_WINDOW_HOURS = 48;

/* -------------------- return dispute -------------------- */

/**
 * Renter escalates a "not returned" decision — sends counter-argument for admin.
 * Sets currentDueAt to 48h from now for auto-resolve.
 */
export async function escalateReturnDispute(bookingId: string, note: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  const booking = await loadBooking(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.status !== "not_returned")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };
  if (!note.trim()) return { ok: false, error: "กรุณาใส่เหตุผลโต้แย้ง" };

  const now = new Date();
  const dueAt48h = new Date(now.getTime() + RETURN_DISPUTE_WINDOW_HOURS * 3600 * 1000);

  let res;
  try {
    res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, status: "not_returned", renterId: user.id },
        data: {
          status: "return_disputed",
          disputeNote: note.trim(),
          currentDueAt: dueAt48h,
        },
      }),
    );
  } catch (e) {
    console.error("[doprent] escalate return dispute error", e);
    return { ok: false, error: "ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

  // Notify admins
  const admins = await db.user.findMany({
    where: { role: "admin" },
    select: { email: true },
  });
  notifyAdminReturnDisputeEscalated({
    adminEmails: admins.map((a) => a.email).filter((e): e is string => !!e),
    dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
    bookingId,
    renterNote: note.trim(),
  });

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}

/**
 * Admin resolves a return dispute.
 *   accept_return → returned (admin sides with renter: items were returned)
 *   reject_return → not_returned (admin sides with seller: items truly not returned)
 */
export async function adminResolveReturnDispute(
  bookingId: string,
  resolution: "accept_return" | "reject_return",
  adminNote?: string,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  if (user.role !== "admin") return { ok: false, error: "ไม่มีสิทธิ์" };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, status: true,
      renter: { select: { email: true } },
      shop: { select: { owner: { select: { email: true } } } },
      items: {
        select: {
          id: true, unitId: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.status !== "return_disputed")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };

  const newStatus = resolution === "accept_return" ? "returned" : "not_returned";

  try {
    await withActor(user.id, () =>
      db.$transaction(async (tx) => {
        await tx.booking.updateMany({
          where: { id: bookingId, status: "return_disputed" },
          data: {
            status: newStatus,
            currentDueAt: null,
            ...(adminNote?.trim() ? { cancelReason: adminNote.trim() } : {}),
            ...(resolution === "accept_return" ? { returnedAt: new Date() } : {}),
          },
        });

        // If admin sides with renter (accept_return → returned), restore units to available
        if (resolution === "accept_return") {
          const itemUnitIds = booking.items.map((i) => i.unitId).filter((x): x is string => !!x);
          if (itemUnitIds.length > 0) {
            await tx.productUnit.updateMany({
              where: { id: { in: itemUnitIds } },
              data: { status: "available", lostFromBookingId: null, note: null },
            });
          }
        }
      }),
    );
  } catch (e) {
    console.error("[doprent] admin resolve return dispute error", e);
    return { ok: false, error: "อัปเดตสถานะไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  // Notify both parties
  notifyReturnDisputeResolved({
    renterEmail: booking.renter?.email,
    sellerEmail: booking.shop?.owner?.email,
    dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
    bookingId,
    resolution,
  });

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}

/* -------------------- slip dispute -------------------- */

/** Renter escalates a slip dispute — sends counter-argument for admin to judge. */
export async function escalateDispute(bookingId: string, note: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  const booking = await loadBooking(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.status !== "slip_disputed")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };
  if (!note.trim()) return { ok: false, error: "กรุณาใส่เหตุผลโต้แย้ง" };

  let res;
  try {
    res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, status: "slip_disputed", renterId: user.id },
        data: { disputeNote: note.trim() },
      }),
    );
  } catch (e) {
    console.error("[doprent] escalate dispute error", e);
    return { ok: false, error: "ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

  const admins = await db.user.findMany({
    where: { role: "admin" },
    select: { email: true },
  });
  notifyAdminDisputeEscalated({
    adminEmails: admins.map((a) => a.email).filter((e): e is string => !!e),
    dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
    bookingId,
    renterNote: note.trim(),
  });

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  return { ok: true };
}

/* -------------------- deposit dispute -------------------- */

/**
 * Renter escalates a deposit decision (partial_refund or forfeit).
 * Sets status → deposit_disputed, currentDueAt → now + 48h.
 */
export async function escalateDepositDispute(bookingId: string, note: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  const booking = await loadBooking(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.status !== "returned")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };
  if (!note.trim()) return { ok: false, error: "กรุณาใส่เหตุผลโต้แย้ง" };

  // Additional guard: depositDecision must be partial_refund or forfeit
  const bkDeposit = await db.booking.findUnique({
    where: { id: bookingId },
    select: { depositDecision: true },
  });
  if (!bkDeposit || !bkDeposit.depositDecision || bkDeposit.depositDecision === "full_refund")
    return { ok: false, error: "ไม่สามารถโต้แย้งได้ — มัดจำคืนเต็มจำนวนแล้ว" };

  const now = new Date();
  const dueAt48h = new Date(now.getTime() + DEPOSIT_DISPUTE_WINDOW_HOURS * 3600 * 1000);

  let res;
  try {
    res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, status: "returned", renterId: user.id },
        data: {
          status: "deposit_disputed",
          depositDisputeNote: note.trim(),
          currentDueAt: dueAt48h,
        },
      }),
    );
  } catch (e) {
    console.error("[doprent] escalate deposit dispute error", e);
    return { ok: false, error: "ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

  // Notify admins + seller
  const admins = await db.user.findMany({
    where: { role: "admin" },
    select: { email: true },
  });
  const sellerEmail = await db.shop.findUnique({
    where: { id: booking.shopId },
    select: { owner: { select: { email: true } } },
  });
  notifyDepositDisputed({
    adminEmails: admins.map((a) => a.email).filter((e): e is string => !!e),
    sellerEmail: sellerEmail?.owner?.email,
    dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
    bookingId,
    disputeNote: note.trim(),
  });

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}

/**
 * Renter disputes a refund slip uploaded by the seller.
 * Works when status = returned AND refundSlipPath exists.
 * Moves to deposit_disputed so admin can review.
 * Clears the slip so seller must re-upload after resolution.
 */
export async function disputeRefundSlip(bookingId: string, note: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  const booking = await loadBooking(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.status !== "returned")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };
  if (!note.trim()) return { ok: false, error: "กรุณาใส่เหตุผล" };

  // Must have a refund slip to dispute it
  const bk = await db.booking.findUnique({
    where: { id: bookingId },
    select: { refundSlipPath: true },
  });
  if (!bk?.refundSlipPath) return { ok: false, error: "ยังไม่มีสลิปคืนมัดจำ" };

  const now = new Date();
  const dueAt48h = new Date(now.getTime() + DEPOSIT_DISPUTE_WINDOW_HOURS * 3600 * 1000);

  let res;
  try {
    res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, status: "returned", renterId: user.id },
        data: {
          status: "deposit_disputed",
          depositDisputeNote: `[สลิปมีปัญหา] ${note.trim()}`,
          currentDueAt: dueAt48h,
          // Clear slip so seller re-uploads after admin resolution
          refundSlipPath: null,
          refundedAt: null,
          refundSlipDueAt: null,
          refundStatus: "refund_pending",
        },
      }),
    );
  } catch (e) {
    console.error("[doprent] dispute refund slip error", e);
    return { ok: false, error: "ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

  // Notify admins + seller
  const admins = await db.user.findMany({
    where: { role: "admin" },
    select: { email: true },
  });
  const sellerEmail = await db.shop.findUnique({
    where: { id: booking.shopId },
    select: { owner: { select: { email: true } } },
  });
  notifyDepositDisputed({
    adminEmails: admins.map((a) => a.email).filter((e): e is string => !!e),
    sellerEmail: sellerEmail?.owner?.email,
    dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
    bookingId,
    disputeNote: `[สลิปมีปัญหา] ${note.trim()}`,
  });

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}

/**
 * Admin resolves a deposit dispute.
 *   side_with_renter → full refund
 *   side_with_seller → keep original decision
 *   adjust           → set custom refundAmount
 */
export async function adminResolveDepositDispute(
  bookingId: string,
  resolution: "side_with_renter" | "side_with_seller" | "adjust",
  adjustedAmount?: number,
  adminNote?: string,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  if (user.role !== "admin") return { ok: false, error: "ไม่มีสิทธิ์" };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, status: true, deposit: true, depositDecision: true, refundAmount: true,
      renter: { select: { email: true } },
      shop: { select: { owner: { select: { email: true } } } },
      items: { take: 1, select: { product: { select: { name: true } } } },
    },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.status !== "deposit_disputed")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };

  let newRefundAmount: number;
  let newDepositDecision: string;
  if (resolution === "side_with_renter") {
    newRefundAmount = booking.deposit;
    newDepositDecision = "full_refund";
  } else if (resolution === "side_with_seller") {
    newRefundAmount = booking.refundAmount ?? 0;
    newDepositDecision = booking.depositDecision ?? "forfeit";
  } else {
    // adjust
    newRefundAmount = Math.round(adjustedAmount ?? 0);
    newDepositDecision = newRefundAmount > 0 ? "partial_refund" : "forfeit";
  }

  const newRefundStatus = newRefundAmount > 0 ? "refund_pending" : "forfeited";
  const newDeduction = booking.deposit - newRefundAmount;

  try {
    await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, status: "deposit_disputed" },
        data: {
          status: "returned",
          currentDueAt: null,
          depositDecision: newDepositDecision,
          refundAmount: newRefundAmount,
          deductionAmount: newDeduction,
          refundStatus: newRefundStatus,
          ...(adminNote?.trim() ? { refundNote: adminNote.trim() } : {}),
        },
      }),
    );
  } catch (e) {
    console.error("[doprent] admin resolve deposit dispute error", e);
    return { ok: false, error: "อัปเดตสถานะไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  // Notify both parties
  notifyDepositDisputeResolved({
    renterEmail: booking.renter?.email,
    sellerEmail: booking.shop?.owner?.email,
    dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
    bookingId,
    resolution,
    refundAmount: newRefundAmount,
  });

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}

/* -------------------- refund slip -------------------- */

/**
 * Seller uploads a refund slip after deposit decision is settled.
 * Guard: seller owns shop, status = returned, refundStatus = refund_pending.
 */
export async function sellerUploadRefundSlip(bookingId: string, formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, status: true, shopId: true, refundStatus: true, refundAmount: true,
      shop: { select: { ownerId: true } },
      renter: { select: { email: true } },
      items: { take: 1, select: { product: { select: { name: true } } } },
    },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.shop?.ownerId !== user.id)
    return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.status !== "returned")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };
  if (booking.refundStatus !== "refund_pending")
    return { ok: false, error: "ไม่อยู่ในขั้นตอนรอคืนเงิน" };

  const file = formData.get("slip");
  if (!file || typeof file === "string") return { ok: false, error: "ยังไม่ได้เลือกไฟล์สลิป" };
  if ((file as File).size > BOOKING_SLIP_MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 5MB" };

  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const mime = detectSlipMime(buffer);
  if (!mime) return { ok: false, error: "ไฟล์ต้องเป็นรูปภาพ (JPG/PNG/WebP)" };
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];

  const key = `refund-slips/${bookingId}/${randomUUID()}.${ext}`;
  try {
    await uploadPrivateToR2(key, buffer, mime);
  } catch (e) {
    console.error("[doprent] refund slip upload error", e);
    return { ok: false, error: "อัปโหลดสลิปไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  const now = new Date();
  const slipDue24h = new Date(now.getTime() + 24 * 3600 * 1000);

  try {
    const res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, status: "returned", refundStatus: "refund_pending" },
        data: {
          refundSlipPath: key,
          refundedAt: now,
          refundSlipDueAt: slipDue24h,
          currentDueAt: slipDue24h,
        },
      }),
    );
    if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };
  } catch (e) {
    console.error("[doprent] refund slip update error", e);
    return { ok: false, error: "อัปเดตสถานะไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  // Notify renter
  notifyRefundSlipUploaded({
    renterEmail: booking.renter?.email,
    dressName: booking.items[0]?.product?.name ?? "ชุดที่จอง",
    bookingId,
    refundAmount: booking.refundAmount ?? 0,
  });

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  return { ok: true };
}

/**
 * Renter verifies the refund slip uploaded by seller.
 * Transitions booking → completed.
 */
export async function renterVerifyRefundSlip(bookingId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, renterId: true, status: true, refundSlipPath: true,
      shop: { select: { owner: { select: { email: true } } } },
      items: { select: { id: true, unitId: true, product: { select: { name: true } } } },
    },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.status !== "returned")
    return { ok: false, error: "สถานะไม่ถูกต้อง" };
  if (!booking.refundSlipPath)
    return { ok: false, error: "ร้านยังไม่ได้อัปโหลดสลิปคืนเงิน" };

  try {
    await withActor(user.id, () =>
      db.$transaction(async (tx) => {
        await tx.booking.updateMany({
          where: { id: bookingId, status: "returned", renterId: user.id },
          data: {
            refundVerifiedAt: new Date(),
            refundStatus: "refunded",
            status: "completed",
            currentDueAt: null,
          },
        });

        // Release units to available
        const itemUnitIds = booking.items.map((i) => i.unitId).filter((x): x is string => !!x);
        if (itemUnitIds.length > 0) {
          await tx.productUnit.updateMany({
            where: { id: { in: itemUnitIds } },
            data: { status: "available" },
          });
        }
      }),
    );
  } catch (e) {
    console.error("[doprent] renter verify refund slip error", e);
    return { ok: false, error: "อัปเดตสถานะไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  // Notify seller (fire-and-forget)
  void booking.shop?.owner?.email;

  revalidatePath("/account/bookings");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  return { ok: true };
}
