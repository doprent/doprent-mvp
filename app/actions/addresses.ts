"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { withActor } from "@/lib/db-context";
import { getCurrentUser } from "@/lib/auth";
import { uploadPrivateToR2 } from "@/lib/r2";
import type { BookingStatus } from "@/lib/types";
import { BOOKING_SLIP_MAX_BYTES } from "@/lib/config";
import { detectSlipMime } from "@/lib/file-mime";
import type { Result } from "@/lib/booking-helpers";

/* ----------------------------- addresses ----------------------------- */

export async function addAddress(formData: FormData): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const recipient = String(formData.get("recipient_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const label = String(formData.get("label") ?? "บ้าน").trim();
  const addressLine = String(formData.get("address_line") ?? formData.get("address_text") ?? "").trim();
  const subdistrict = String(formData.get("subdistrict") ?? "").trim() || null;
  const district = String(formData.get("district") ?? "").trim() || null;
  const province = String(formData.get("province") ?? "กรุงเทพมหานคร").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const lineId = String(formData.get("line_id") ?? "").trim() || null;
  const makeDefault = String(formData.get("is_default") ?? "") === "on";
  if (!recipient) return { ok: false, error: "กรุณาใส่ชื่อผู้รับ" };
  if (!phone) return { ok: false, error: "กรุณาใส่เบอร์โทร" };
  if (!addressLine) return { ok: false, error: "กรุณาใส่ที่อยู่จัดส่ง" };

  return withActor(user.id, async () => {
    // First address becomes default automatically.
    const count = await db.address.count({ where: { userId: user.id } });
    const isDefault = makeDefault || count === 0;

    if (isDefault) {
      await db.address.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }

    const created = await db.address.create({
      data: {
        userId: user.id,
        label,
        recipientName: recipient,
        phone,
        addressLine,
        subdistrict,
        district,
        province,
        postalCode,
        lineId,
        isDefault,
      },
      select: { id: true },
    });

    revalidatePath("/checkout/address");
    revalidatePath("/account/addresses");
    return { ok: true, id: created.id };
  });
}

export async function updateAddress(formData: FormData): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const id = String(formData.get("id") ?? "").trim();
  const recipient = String(formData.get("recipient_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const addressLine = String(formData.get("address_line") ?? formData.get("address_text") ?? "").trim();
  const lineId = String(formData.get("line_id") ?? "").trim() || null;
  if (!id) return { ok: false, error: "ไม่พบที่อยู่" };
  if (!recipient) return { ok: false, error: "กรุณาใส่ชื่อผู้รับ" };
  if (!phone) return { ok: false, error: "กรุณาใส่เบอร์โทร" };
  if (!addressLine) return { ok: false, error: "กรุณาใส่ที่อยู่จัดส่ง" };

  return withActor(user.id, async () => {
    const existing = await db.address.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "ไม่พบที่อยู่" };

    await db.address.update({
      where: { id },
      data: { recipientName: recipient, phone, addressLine, lineId },
    });

    revalidatePath("/checkout/address");
    revalidatePath("/account/addresses");
    return { ok: true, id };
  });
}

export async function deleteAddress(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ไม่พบที่อยู่" };

  return withActor(user.id, async () => {
    const existing = await db.address.findFirst({
      where: { id, userId: user.id },
      select: { id: true, isDefault: true },
    });
    if (!existing) return { ok: false, error: "ไม่พบที่อยู่" };

    await db.address.delete({ where: { id } });

    // If we removed the default, promote the most-recent remaining address.
    if (existing.isDefault) {
      const next = await db.address.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (next) {
        await db.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    revalidatePath("/checkout/address");
    revalidatePath("/account/addresses");
    return { ok: true };
  });
}

export async function setDefaultAddress(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ไม่พบที่อยู่" };

  return withActor(user.id, async () => {
    const existing = await db.address.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "ไม่พบที่อยู่" };

    await db.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    await db.address.update({ where: { id }, data: { isDefault: true } });

    revalidatePath("/checkout/address");
    revalidatePath("/account/addresses");
    return { ok: true };
  });
}

/* -------------------- booking address edit (pre-shipment) -------------------- */

/** Statuses where the renter may still edit the delivery address (pre-shipment). */
const ADDRESS_EDITABLE_STATUSES: BookingStatus[] = ["booking_pending", "waiting_for_payment"];

/**
 * Renter edits the delivery address on an in-progress booking.
 * Only allowed while the booking is still in a pre-shipment state
 * (booking_pending or waiting_for_payment).
 */
export async function editBookingAddress(
  bookingId: string,
  formData: FormData,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const recipientName = String(formData.get("recipient_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const addressText = String(formData.get("address_text") ?? "").trim();

  if (!recipientName) return { ok: false, error: "กรุณาใส่ชื่อผู้รับ" };
  if (!phone) return { ok: false, error: "กรุณาใส่เบอร์โทร" };
  if (!addressText) return { ok: false, error: "กรุณาใส่ที่อยู่จัดส่ง" };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, renterId: true, status: true },
  });
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์แก้ไขการจองนี้" };
  if (!ADDRESS_EDITABLE_STATUSES.includes(booking.status as BookingStatus))
    return { ok: false, error: "ไม่สามารถแก้ไขที่อยู่ได้ในขั้นตอนนี้" };

  const res = await withActor(user.id, () =>
    db.booking.updateMany({
      where: {
        id: bookingId,
        renterId: user.id,
        status: { in: ADDRESS_EDITABLE_STATUSES },
      },
      data: { recipientName, phone, addressText },
    }),
  );
  if (res.count === 0) return { ok: false, error: "ไม่สามารถแก้ไขได้ (สถานะเปลี่ยนไปแล้ว)" };

  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/account/bookings");
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/sell/bookings");
  return { ok: true };
}

/* -------------------- post-payment address change -------------------- */

/** Load a booking with the extra addr-change fields needed for the sub-flow. */
async function loadBookingForAddrChange(bookingId: string) {
  return db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      renterId: true,
      shopId: true,
      status: true,
      shippingFee: true,
      addrChangeStatus: true,
      pendingRecipientName: true,
      pendingPhone: true,
      pendingAddressText: true,
      pendingShippingFee: true,
      addrChangeDiff: true,
      addrChangeSlipPath: true,
      addrChangeReason: true,
      shop: { select: { ownerId: true } },
    },
  });
}

/** addr_change_status values that allow a new request from the renter. */
const ADDR_CHANGE_REQUESTABLE = [null, "none", "rejected", "done"] as const;

/**
 * Renter requests a delivery-address change on a confirmed booking.
 * Creates a pending sub-flow without touching booking.status.
 */
export async function requestAddressChange(
  bookingId: string,
  formData: FormData,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const recipientName = String(formData.get("recipient_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const addressText = String(formData.get("address_text") ?? "").trim();

  if (!recipientName) return { ok: false, error: "กรุณาใส่ชื่อผู้รับ" };
  if (!phone) return { ok: false, error: "กรุณาใส่เบอร์โทร" };
  if (!addressText) return { ok: false, error: "กรุณาใส่ที่อยู่จัดส่ง" };

  const booking = await loadBookingForAddrChange(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.status !== "confirmed")
    return { ok: false, error: "สามารถขอแก้ที่อยู่ได้เฉพาะการจองที่ยืนยันแล้วเท่านั้น" };
  if (!(ADDR_CHANGE_REQUESTABLE as ReadonlyArray<string | null>).includes(booking.addrChangeStatus))
    return { ok: false, error: "มีคำขอแก้ที่อยู่อยู่แล้ว ลองรีเฟรช" };

  const res = await withActor(user.id, () =>
    db.booking.updateMany({
      where: {
        id: bookingId,
        renterId: user.id,
        status: "confirmed",
        OR: [
          { addrChangeStatus: null },
          { addrChangeStatus: "none" },
          { addrChangeStatus: "rejected" },
          { addrChangeStatus: "done" },
        ],
      },
      data: {
        addrChangeStatus: "requested",
        pendingRecipientName: recipientName,
        pendingPhone: phone,
        pendingAddressText: addressText,
        pendingShippingFee: null,
        addrChangeDiff: null,
        addrChangeSlipPath: null,
        addrChangeReason: null,
      },
    }),
  );
  if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/account/bookings");
  revalidatePath("/sell/bookings");
  return { ok: true };
}

/**
 * Seller reviews the address-change request: approve (with new shipping fee) or reject.
 * Approval with diff==0 auto-applies the change immediately.
 * Approval with diff>0 sets status="approved" and waits for renter top-up slip.
 */
export async function reviewAddressChange(
  bookingId: string,
  formData: FormData,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const booking = await loadBookingForAddrChange(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.shop?.ownerId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.addrChangeStatus !== "requested")
    return { ok: false, error: "ไม่มีคำขอแก้ที่อยู่ที่รอการอนุมัติ" };

  const action = String(formData.get("action") ?? "").trim();

  if (action === "reject") {
    const reason = String(formData.get("reason") ?? "").trim() || null;
    const res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, shopId: booking.shopId, addrChangeStatus: "requested" },
        data: {
          addrChangeStatus: "rejected",
          addrChangeReason: reason,
          pendingRecipientName: null,
          pendingPhone: null,
          pendingAddressText: null,
          pendingShippingFee: null,
          addrChangeDiff: null,
          addrChangeSlipPath: null,
        },
      }),
    );
    if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };
  } else if (action === "approve") {
    const newShippingFee = Math.round(Number(formData.get("new_shipping_fee")));
    if (!Number.isFinite(newShippingFee) || newShippingFee < 0)
      return { ok: false, error: "ค่าจัดส่งไม่ถูกต้อง" };

    const diff = Math.max(0, newShippingFee - (booking.shippingFee ?? 0));

    if (diff === 0) {
      // Auto-apply: copy pending → live snapshot, mark done, clear pending
      const res = await withActor(user.id, () =>
        db.booking.updateMany({
          where: { id: bookingId, shopId: booking.shopId, addrChangeStatus: "requested" },
          data: {
            recipientName: booking.pendingRecipientName,
            phone: booking.pendingPhone,
            addressText: booking.pendingAddressText,
            shippingFee: newShippingFee,
            addrChangeStatus: "done",
            pendingRecipientName: null,
            pendingPhone: null,
            pendingAddressText: null,
            pendingShippingFee: null,
            addrChangeDiff: null,
            addrChangeSlipPath: null,
          },
        }),
      );
      if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };
    } else {
      // diff > 0: require renter top-up
      const res = await withActor(user.id, () =>
        db.booking.updateMany({
          where: { id: bookingId, shopId: booking.shopId, addrChangeStatus: "requested" },
          data: {
            pendingShippingFee: newShippingFee,
            addrChangeDiff: diff,
            addrChangeStatus: "approved",
          },
        }),
      );
      if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };
    }
  } else {
    return { ok: false, error: "action ไม่ถูกต้อง" };
  }

  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/account/bookings");
  revalidatePath("/sell/bookings");
  return { ok: true };
}

/**
 * Renter uploads a top-up payment slip for the shipping-fee difference.
 * Only valid when addrChangeStatus === "approved" and addrChangeDiff > 0.
 */
export async function payAddressChangeDiff(
  bookingId: string,
  formData: FormData,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const booking = await loadBookingForAddrChange(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.renterId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.addrChangeStatus !== "approved")
    return { ok: false, error: "ไม่อยู่ในขั้นตอนอัปโหลดสลิปส่วนต่าง" };
  if ((booking.addrChangeDiff ?? 0) <= 0)
    return { ok: false, error: "ไม่มีส่วนต่างที่ต้องชำระ" };

  const file = formData.get("slip");
  if (!file || typeof file === "string") return { ok: false, error: "ยังไม่ได้เลือกไฟล์สลิป" };
  if (file.size > BOOKING_SLIP_MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 5MB" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectSlipMime(buffer);
  if (!mime) return { ok: false, error: "ไฟล์ต้องเป็นรูปภาพ (JPG/PNG/WebP)" };
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];

  const key = `addr-change-slips/${bookingId}/${randomUUID()}.${ext}`;
  try {
    await uploadPrivateToR2(key, buffer, mime);
  } catch (e) {
    console.error("[doprent] addr-change slip upload error", e);
    return { ok: false, error: "อัปโหลดสลิปไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  const res = await withActor(user.id, () =>
    db.booking.updateMany({
      where: {
        id: bookingId,
        renterId: user.id,
        addrChangeStatus: "approved",
      },
      data: {
        addrChangeSlipPath: key,
        addrChangeStatus: "paid_review",
      },
    }),
  );
  if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };

  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/account/bookings");
  revalidatePath("/sell/bookings");
  return { ok: true };
}

/**
 * Seller confirms or rejects the renter's top-up slip for the address-change diff.
 * Confirm → apply the pending address change. Reject → back to "approved" for re-upload.
 */
export async function confirmAddressChange(
  bookingId: string,
  formData: FormData,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const booking = await loadBookingForAddrChange(bookingId);
  if (!booking) return { ok: false, error: "ไม่พบการจอง" };
  if (booking.shop?.ownerId !== user.id) return { ok: false, error: "ไม่มีสิทธิ์จัดการการจองนี้" };
  if (booking.addrChangeStatus !== "paid_review")
    return { ok: false, error: "ไม่อยู่ในขั้นตอนตรวจสลิปส่วนต่าง" };

  const action = String(formData.get("action") ?? "").trim();

  if (action === "confirm") {
    const res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, shopId: booking.shopId, addrChangeStatus: "paid_review" },
        data: {
          recipientName: booking.pendingRecipientName,
          phone: booking.pendingPhone,
          addressText: booking.pendingAddressText,
          shippingFee: booking.pendingShippingFee,
          addrChangeStatus: "done",
          pendingRecipientName: null,
          pendingPhone: null,
          pendingAddressText: null,
          pendingShippingFee: null,
          addrChangeDiff: null,
          addrChangeSlipPath: null,
        },
      }),
    );
    if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };
  } else if (action === "reject") {
    const reason = String(formData.get("reason") ?? "").trim() || null;
    const res = await withActor(user.id, () =>
      db.booking.updateMany({
        where: { id: bookingId, shopId: booking.shopId, addrChangeStatus: "paid_review" },
        data: {
          addrChangeStatus: "approved",
          addrChangeReason: reason,
          // Keep pendingShippingFee + addrChangeDiff intact so renter knows the amount
          addrChangeSlipPath: null,
        },
      }),
    );
    if (res.count === 0) return { ok: false, error: "สถานะเปลี่ยนไปแล้ว ลองรีเฟรช" };
  } else {
    return { ok: false, error: "action ไม่ถูกต้อง" };
  }

  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath(`/sell/bookings/${bookingId}`);
  revalidatePath("/account/bookings");
  revalidatePath("/sell/bookings");
  return { ok: true };
}
