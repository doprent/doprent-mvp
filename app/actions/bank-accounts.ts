"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { withActor } from "@/lib/db-context";
import { getCurrentUser } from "@/lib/auth";
import type { Result } from "@/lib/booking-helpers";

/* ------------------------------ bank account CRUD ------------------------------ */

export async function addBankAccount(formData: FormData): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const label = String(formData.get("label") ?? "บัญชีหลัก").trim();
  const bankName = String(formData.get("bank_name") ?? "").trim();
  const accountNumber = String(formData.get("account_number") ?? "").trim();
  const accountName = String(formData.get("account_name") ?? "").trim();
  const makeDefault = String(formData.get("is_default") ?? "") === "on";

  if (!bankName) return { ok: false, error: "กรุณาเลือกธนาคาร" };
  if (!accountNumber) return { ok: false, error: "กรุณาใส่เลขบัญชี" };
  if (!accountName) return { ok: false, error: "กรุณาใส่ชื่อบัญชี" };

  return withActor(user.id, async () => {
    const count = await db.bankAccount.count({ where: { userId: user.id } });
    const isDefault = makeDefault || count === 0;

    if (isDefault) {
      await db.bankAccount.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }

    const created = await db.bankAccount.create({
      data: { userId: user.id, label, bankName, accountNumber, accountName, isDefault },
      select: { id: true },
    });

    revalidatePath("/checkout/address");
    revalidatePath("/account/bank-accounts");
    return { ok: true, id: created.id };
  });
}

export async function updateBankAccount(formData: FormData): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const id = String(formData.get("id") ?? "").trim();
  const bankName = String(formData.get("bank_name") ?? "").trim();
  const accountNumber = String(formData.get("account_number") ?? "").trim();
  const accountName = String(formData.get("account_name") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!id) return { ok: false, error: "ไม่พบบัญชี" };
  if (!bankName) return { ok: false, error: "กรุณาเลือกธนาคาร" };
  if (!accountNumber) return { ok: false, error: "กรุณาใส่เลขบัญชี" };
  if (!accountName) return { ok: false, error: "กรุณาใส่ชื่อบัญชี" };

  return withActor(user.id, async () => {
    const existing = await db.bankAccount.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "ไม่พบบัญชี" };

    await db.bankAccount.update({
      where: { id },
      data: { bankName, accountNumber, accountName, ...(label ? { label } : {}) },
    });

    revalidatePath("/checkout/address");
    revalidatePath("/account/bank-accounts");
    return { ok: true, id };
  });
}

export async function deleteBankAccount(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ไม่พบบัญชี" };

  return withActor(user.id, async () => {
    const existing = await db.bankAccount.findFirst({
      where: { id, userId: user.id },
      select: { id: true, isDefault: true },
    });
    if (!existing) return { ok: false, error: "ไม่พบบัญชี" };

    await db.bankAccount.delete({ where: { id } });

    if (existing.isDefault) {
      const next = await db.bankAccount.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (next) {
        await db.bankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    revalidatePath("/checkout/address");
    revalidatePath("/account/bank-accounts");
    return { ok: true };
  });
}

export async function setDefaultBankAccount(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ไม่พบบัญชี" };

  return withActor(user.id, async () => {
    const existing = await db.bankAccount.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "ไม่พบบัญชี" };

    await db.bankAccount.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    await db.bankAccount.update({ where: { id }, data: { isDefault: true } });

    revalidatePath("/checkout/address");
    revalidatePath("/account/bank-accounts");
    return { ok: true };
  });
}
