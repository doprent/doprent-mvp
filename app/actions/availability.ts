"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { withActor } from "@/lib/db-context";
import { ACTIVE_STATUSES } from "@/lib/bookings";

async function verifyProductOwner(productId: string): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const product = await db.product.findUnique({
    where: { id: productId },
    include: { shop: { select: { ownerId: true } } },
  });
  if (!product || product.shop.ownerId !== user.id) {
    return { ok: false, error: "ไม่มีสิทธิ์แก้ปฏิทินของสินค้านี้" };
  }
  return { ok: true, userId: user.id };
}

/**
 * Toggle a blackout date for a product, a specific variant, or a single unit.
 * variantId = null, unitId = null → product-wide blackout (blocks all variants).
 * variantId = uuid, unitId = null → variant-specific blackout (blocks one size).
 * unitId = uuid (variantId set)   → unit-specific blackout (blocks one code).
 */
export async function toggleBlackout(
  productId: string,
  date: string,
  variantId?: string | null,
  unitId?: string | null,
): Promise<{ ok: boolean; blocked: boolean; error?: string }> {
  const owner = await verifyProductOwner(productId);
  if (!owner.ok) return { ok: false, blocked: false, error: owner.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, blocked: false, error: "รูปแบบวันที่ไม่ถูกต้อง" };
  }

  const dateObj = new Date(date);
  const uid = unitId ?? null;
  const vid = variantId ?? null;

  // A unit blackout must carry its owning variant id so the storefront can map
  // it back to a size when reducing that size's free count.
  if (uid && !vid) {
    return { ok: false, blocked: false, error: "ต้องระบุไซซ์ของรหัสที่จะปิด" };
  }

  const existing = await db.productBlackoutDate.findFirst({
    where: { productId, variantId: vid, unitId: uid, date: dateObj },
  });

  return withActor(owner.userId, async () => {
    if (existing) {
      await db.productBlackoutDate.delete({ where: { id: existing.id } });
      revalidatePath('/product/[id]', 'page');
      return { ok: true, blocked: false };
    } else {
      await db.productBlackoutDate.create({
        data: { productId, variantId: vid, unitId: uid, date: dateObj },
      });
      revalidatePath('/product/[id]', 'page');
      return { ok: true, blocked: true };
    }
  });
}

export type VariantDayAvailability = {
  variantId: string;
  size: string;
  quantity: number;
  available: boolean;
  /** Units physically out on the chosen date. */
  out: number;
  /** quantity − out, floored at 0. */
  free: number;
};

/**
 * Seller-only: how many units of each size are free on a specific date.
 * "Out" counts physical bookings (ACTIVE_STATUSES incl. renting) whose
 * [startDate, endDate] span includes the date. Auth-guarded by product owner.
 */
export async function getVariantAvailabilityByDate(
  productId: string,
  date: string,
): Promise<{ ok: boolean; date?: string; variants?: VariantDayAvailability[]; error?: string }> {
  const owner = await verifyProductOwner(productId);
  if (!owner.ok) return { ok: false, error: owner.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "รูปแบบวันที่ไม่ถูกต้อง" };
  }
  const dateObj = new Date(date + "T00:00:00.000Z");

  const variants = await db.productVariant.findMany({
    where: { productId },
    orderBy: { size: "asc" },
    select: { id: true, size: true, quantity: true, available: true },
  });

  const outRows = await db.bookingItem.findMany({
    where: {
      productId,
      variantId: { not: null },
      booking: {
        status: { in: ACTIVE_STATUSES },
        startDate: { lte: dateObj },
        endDate: { gte: dateObj },
      },
    },
    select: { variantId: true },
  });
  const outMap: Record<string, number> = {};
  for (const r of outRows) {
    if (r.variantId) outMap[r.variantId] = (outMap[r.variantId] ?? 0) + 1;
  }

  return {
    ok: true,
    date,
    variants: variants.map((v) => {
      const out = outMap[v.id] ?? 0;
      return {
        variantId: v.id,
        size: v.size,
        quantity: v.quantity,
        available: v.available,
        out,
        free: Math.max(0, v.quantity - out),
      };
    }),
  };
}

export async function setBlackouts(
  productId: string,
  dates: string[],
  variantId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const owner = await verifyProductOwner(productId);
  if (!owner.ok) return owner;

  const validDates = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const vid = variantId ?? null;

  return withActor(owner.userId, async () => {
    await db.productBlackoutDate.deleteMany({
      where: { productId, variantId: vid, date: { gte: today } },
    });

    if (validDates.length > 0) {
      await db.productBlackoutDate.createMany({
        data: validDates.map((d) => ({ productId, variantId: vid, date: new Date(d) })),
        skipDuplicates: true,
      });
    }

    revalidatePath(`/product/${productId}`);
    return { ok: true };
  });
}
