"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestAddressChange, payAddressChangeDiff } from "@/app/actions/addresses";

type PendingAddress = {
  recipientName: string | null;
  phone: string | null;
  addressText: string | null;
};

type Props = {
  bookingId: string;
  status: string | null;
  pending: PendingAddress | null;
  diff: number | null;
  diffQrDataUrl: string | null;
  reason: string | null;
};

export default function RenterAddressChange({
  bookingId,
  status,
  pending,
  diff,
  diffQrDataUrl,
  reason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await requestAddressChange(bookingId, fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function onSlip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("slip", file);
      const res = await payAddressChangeDiff(bookingId, fd);
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  // ── Waiting for shop review ────────────────────────────────────────────────
  if (status === "requested") {
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 4 }}>
          ✉️ ส่งคำขอแก้ที่อยู่แล้ว รอร้านอนุมัติ
        </p>
        {pending?.recipientName || pending?.addressText ? (
          <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
            {pending.recipientName ? <div>{pending.recipientName}{pending.phone ? ` · ${pending.phone}` : ""}</div> : null}
            {pending.addressText ? <div>{pending.addressText}</div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Approved — renter must pay the diff ───────────────────────────────────
  if (status === "approved") {
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 13, color: "var(--success)", marginBottom: 8 }}>
          ✓ ร้านอนุมัติแล้ว — กรุณาชำระส่วนต่างค่าจัดส่ง ฿{(diff ?? 0).toLocaleString()}
        </p>
        {diffQrDataUrl ? (
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={diffQrDataUrl}
              alt="PromptPay QR ส่วนต่างค่าจัดส่ง"
              width={200}
              height={200}
              style={{ display: "block", margin: "0 auto", borderRadius: 8 }}
            />
          </div>
        ) : null}
        <label
          className="btn btn-primary"
          style={{ display: "block", textAlign: "center", cursor: "pointer", padding: "10px 0" }}
        >
          {busy ? "กำลังอัปโหลด…" : "จ่ายแล้ว · อัปโหลดสลิป"}
          <input
            type="file"
            accept="image/*"
            onChange={onSlip}
            disabled={busy}
            style={{ display: "none" }}
          />
        </label>
        {error ? (
          <div style={{ marginTop: 8, padding: "9px 12px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Slip uploaded — waiting for seller confirmation ────────────────────────
  if (status === "paid_review") {
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
          📤 อัปสลิปแล้ว รอร้านยืนยันที่อยู่ใหม่
        </p>
      </div>
    );
  }

  // ── null / "none" / "done" / "rejected" — show request button ─────────────
  if (!open) {
    return (
      <div style={{ marginTop: 6 }}>
        {status === "rejected" && reason ? (
          <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 6 }}>
            ❌ ร้านไม่อนุมัติ: {reason}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-outline"
          style={{ fontSize: 13, padding: "6px 14px" }}
          onClick={() => { setError(""); setOpen(true); }}
        >
          ขอแก้ที่อยู่จัดส่ง
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleRequest} style={{ marginTop: 10, display: "grid", gap: 10 }}>
      <div>
        <label style={{ fontSize: 13, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>
          ชื่อผู้รับ
        </label>
        <input
          name="recipient_name"
          required
          disabled={busy}
          className="input"
          style={{ width: "100%", fontSize: 14 }}
          placeholder="ชื่อ-นามสกุล"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>
          เบอร์โทร
        </label>
        <input
          name="phone"
          required
          disabled={busy}
          className="input"
          style={{ width: "100%", fontSize: 14 }}
          placeholder="0812345678"
          type="tel"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>
          ที่อยู่จัดส่งใหม่
        </label>
        <textarea
          name="address_text"
          required
          disabled={busy}
          className="input"
          style={{ width: "100%", fontSize: 14, minHeight: 72, resize: "vertical" }}
          placeholder="บ้านเลขที่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
        />
      </div>

      {error ? (
        <div style={{ padding: "9px 12px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="submit"
          className="btn btn-dark"
          style={{ flex: 1, padding: "10px 0" }}
          disabled={busy}
        >
          {busy ? "กำลังส่งคำขอ…" : "ส่งคำขอ"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          style={{ flex: 1, padding: "10px 0" }}
          disabled={busy}
          onClick={() => { setOpen(false); setError(""); }}
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
