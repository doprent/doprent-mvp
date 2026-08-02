"use client";

import { useState } from "react";
import { addBankAccount, updateBankAccount, deleteBankAccount, setDefaultBankAccount } from "@/app/actions/bank-accounts";
import { useConfirm } from "@/components/ConfirmProvider";
import type { BankAccount } from "@/lib/types";

type Props = { bankAccounts: BankAccount[] };

type Mode = { kind: "none" } | { kind: "add" } | { kind: "edit"; id: string };

const THAI_BANKS = [
  { value: "PROMPTPAY", label: "พร้อมเพย์ (PromptPay)" },
  { value: "KBANK", label: "กสิกรไทย (KBANK)" },
  { value: "BBL", label: "กรุงเทพ (BBL)" },
  { value: "SCB", label: "ไทยพาณิชย์ (SCB)" },
  { value: "KTB", label: "กรุงไทย (KTB)" },
  { value: "BAY", label: "กรุงศรี (BAY)" },
  { value: "TTB", label: "ทหารไทยธนชาต (TTB)" },
  { value: "GSB", label: "ออมสิน (GSB)" },
  { value: "BAAC", label: "ธ.ก.ส. (BAAC)" },
  { value: "KKP", label: "เกียรตินาคินภัทร (KKP)" },
  { value: "TISCO", label: "ทิสโก้ (TISCO)" },
  { value: "CIMB", label: "ซีไอเอ็มบี (CIMB)" },
  { value: "UOB", label: "ยูโอบี (UOB)" },
  { value: "LHBANK", label: "แลนด์ แอนด์ เฮ้าส์ (LH Bank)" },
  { value: "OTHER", label: "อื่นๆ" },
] as const;

/** Mask account number: xxx-x-xxxxx-0 (show only last digit). */
function maskAccountNumber(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 2) return num;
  return digits.slice(0, -1).replace(/./g, "x") + digits.slice(-1);
}

/** Find the Thai label for a bank value. */
function bankLabel(value: string): string {
  return THAI_BANKS.find((b) => b.value === value)?.label ?? value;
}

/**
 * Renter bank-account book -- list, add, edit, delete and pick a default bank
 * account for deposit refunds. Server actions persist and revalidate both
 * /account/bank-accounts and checkout flows.
 */
export default function BankAccountManager({ bankAccounts: initial }: Props) {
  const confirm = useConfirm();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(initial);
  const [mode, setMode] = useState<Mode>(initial.length === 0 ? { kind: "add" } : { kind: "none" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch("/api/bank-accounts", { cache: "no-store" });
    if (!res.ok) return;
    const rows = await res.json();
    setBankAccounts(
      (rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        user_id: String(r.userId ?? ""),
        label: String(r.label ?? ""),
        bank_name: String(r.bankName ?? ""),
        account_number: String(r.accountNumber ?? ""),
        account_name: String(r.accountName ?? ""),
        is_default: Boolean(r.isDefault),
        created_at: String(r.createdAt ?? ""),
      })),
    );
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await addBankAccount(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
    setMode({ kind: "none" });
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await updateBankAccount(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
    setMode({ kind: "none" });
  }

  async function onDelete(id: string) {
    if (!(await confirm({ message: "ลบบัญชีธนาคารนี้?", variant: "danger", confirmLabel: "ลบ" }))) return;
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.set("id", id);
    const res = await deleteBankAccount(fd);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
  }

  async function onSetDefault(id: string) {
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.set("id", id);
    const res = await setDefaultBankAccount(fd);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
  }

  return (
    <div className="grid gap-3.5">
      {error ? (
        <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="grid gap-2.5">
        {bankAccounts.map((a) =>
          mode.kind === "edit" && mode.id === a.id ? (
            <BankAccountForm
              key={a.id}
              onSubmit={onEdit}
              onCancel={() => setMode({ kind: "none" })}
              busy={busy}
              initial={a}
            />
          ) : (
            <div
              key={a.id}
              className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 ${
                a.is_default
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--line)] bg-[var(--surface)]"
              }`}
            >
              <div className="min-w-[200px] flex-1 text-sm leading-relaxed">
                <b>{a.account_name}</b> · {bankLabel(a.bank_name)} · {maskAccountNumber(a.account_number)}
                {a.is_default ? (
                  <span className="ml-1 text-xs text-[var(--accent-2)]"> (ค่าเริ่มต้น)</span>
                ) : null}
                {a.label ? (
                  <>
                    <br />
                    <span className="text-[var(--ink-2)]">{a.label}</span>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!a.is_default ? (
                  <button
                    type="button"
                    className="btn btn-outline text-[13px] px-3 py-1.5"
                    onClick={() => onSetDefault(a.id)}
                    disabled={busy}
                  >
                    ตั้งเป็นค่าเริ่มต้น
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-outline text-[13px] px-3 py-1.5"
                  onClick={() => setMode({ kind: "edit", id: a.id })}
                  disabled={busy}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="btn btn-outline text-[13px] px-3 py-1.5 text-[var(--danger)]"
                  onClick={() => onDelete(a.id)}
                  disabled={busy}
                >
                  ลบ
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {mode.kind === "add" ? (
        <BankAccountForm
          onSubmit={onAdd}
          onCancel={bankAccounts.length > 0 ? () => setMode({ kind: "none" }) : undefined}
          busy={busy}
        />
      ) : mode.kind === "none" ? (
        <button
          type="button"
          className="btn btn-outline justify-self-start"
          onClick={() => setMode({ kind: "add" })}
        >
          + เพิ่มบัญชีธนาคารใหม่
        </button>
      ) : null}
    </div>
  );
}

function BankAccountForm({
  onSubmit,
  onCancel,
  busy,
  initial,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  busy: boolean;
  initial?: BankAccount;
}) {
  const [selectedBank, setSelectedBank] = useState(initial?.bank_name ?? "");
  const isPromptPay = selectedBank === "PROMPTPAY";

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <select
        name="bank_name"
        defaultValue={initial?.bank_name ?? ""}
        className="input"
        required
        onChange={(e) => setSelectedBank(e.target.value)}
      >
        <option value="" disabled>
          เลือกธนาคาร / พร้อมเพย์
        </option>
        {THAI_BANKS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      <input
        name="account_number"
        placeholder={isPromptPay ? "หมายเลขพร้อมเพย์ (เบอร์โทร / เลขบัตรประชาชน)" : "เลขบัญชี"}
        defaultValue={initial?.account_number ?? ""}
        className="input"
        required
      />
      <input
        name="account_name"
        placeholder={isPromptPay ? "ชื่อบัญชีพร้อมเพย์" : "ชื่อบัญชี (ตรงกับหน้าสมุดบัญชี)"}
        defaultValue={initial?.account_name ?? ""}
        className="input"
        required
      />
      <input
        name="label"
        placeholder="ป้ายชื่อ เช่น บัญชีส่วนตัว (ไม่บังคับ)"
        defaultValue={initial?.label ?? ""}
        className="input"
      />
      {!initial ? (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="is_default" /> ตั้งเป็นบัญชีเริ่มต้น
        </label>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-dark" disabled={busy}>
          {busy ? "กำลังบันทึก..." : "บันทึกบัญชี"}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
        ) : null}
      </div>
    </form>
  );
}
