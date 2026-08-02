"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewAddressChange, confirmAddressChange } from "@/app/actions/addresses";

type PendingAddress = {
  recipientName: string | null;
  phone: string | null;
  addressText: string | null;
};

type Props = {
  bookingId: string;
  status: string | null;
  pending: PendingAddress | null;
  currentShippingFee: number | null;
  diff: number | null;
  slipUrl: string | null;
  reason: string | null;
};

export default function SellerAddressChange({
  bookingId,
  status,
  pending,
  currentShippingFee,
  diff,
  slipUrl,
  reason,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newFee, setNewFee] = useState<number>(currentShippingFee ?? 0);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const computedDiff = Math.max(0, newFee - (currentShippingFee ?? 0));

  async function handleApprove() {
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.append("action", "approve");
    fd.append("new_shipping_fee", String(newFee));
    const res = await reviewAddressChange(bookingId, fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  }

  async function handleReject() {
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.append("action", "reject");
    if (rejectReason) fd.append("reason", rejectReason);
    const res = await reviewAddressChange(bookingId, fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  }

  async function handleConfirmSlip() {
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.append("action", "confirm");
    const res = await confirmAddressChange(bookingId, fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  }

  async function handleRejectSlip() {
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.append("action", "reject");
    if (rejectReason) fd.append("reason", rejectReason);
    const res = await confirmAddressChange(bookingId, fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setShowRejectInput(false);
    setRejectReason("");
    router.refresh();
  }

  // ── Seller reviews the pending request ────────────────────────────────────
  if (status === "requested") {
    return (
      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
          คำขอแก้ที่อยู่จัดส่ง
        </div>

        {pending?.recipientName || pending?.addressText ? (
          <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7, marginBottom: 12, padding: "8px 10px", background: "var(--surface-2, #f5f5f5)", borderRadius: 8 }}>
            {pending.recipientName ? <div><b>ผู้รับ:</b> {pending.recipientName}{pending.phone ? ` · ${pending.phone}` : ""}</div> : null}
            {pending.addressText ? <div><b>ที่อยู่:</b> {pending.addressText}</div> : null}
          </div>
        ) : null}

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>
            ค่าจัดส่งใหม่ (บาท)
          </label>
          <input
            type="number"
            min={0}
            value={newFee}
            onChange={(e) => setNewFee(Math.max(0, Math.round(Number(e.target.value))))}
            disabled={busy}
            className="input"
            style={{ width: "100%", fontSize: 14 }}
          />
          {computedDiff > 0 ? (
            <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              ลูกค้าจะต้องจ่ายส่วนต่าง ฿{computedDiff.toLocaleString()}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "var(--success)", marginTop: 4 }}>
              ไม่มีส่วนต่าง — อนุมัติแล้วจะเปลี่ยนที่อยู่ทันที
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-dark"
            style={{ flex: 1, padding: "10px 0", fontSize: 13 }}
            disabled={busy}
            onClick={handleApprove}
          >
            {busy ? "กำลังดำเนินการ…" : "อนุมัติ"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ flex: 1, padding: "10px 0", fontSize: 13 }}
            disabled={busy}
            onClick={() => setShowRejectInput(!showRejectInput)}
          >
            ปฏิเสธ
          </button>
        </div>

        {showRejectInput ? (
          <div style={{ display: "grid", gap: 8 }}>
            <input
              type="text"
              placeholder="เหตุผล (ไม่บังคับ)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              disabled={busy}
              className="input"
              style={{ fontSize: 13 }}
            />
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 13, padding: "8px 0", color: "var(--danger)", borderColor: "var(--danger)" }}
              disabled={busy}
              onClick={handleReject}
            >
              {busy ? "กำลังดำเนินการ…" : "ยืนยันปฏิเสธ"}
            </button>
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 8, padding: "9px 12px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Waiting for renter top-up ──────────────────────────────────────────────
  if (status === "approved") {
    return (
      <div style={{ ...card, fontSize: 13, color: "var(--ink-2)" }}>
        ✓ อนุมัติแล้ว รอลูกค้าชำระส่วนต่าง ฿{(diff ?? 0).toLocaleString()}
      </div>
    );
  }

  // ── Seller reviews renter top-up slip ─────────────────────────────────────
  if (status === "paid_review") {
    return (
      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
          สลิปชำระส่วนต่างค่าจัดส่ง
        </div>
        {slipUrl ? (
          <div style={{ marginBottom: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slipUrl}
              alt="สลิปส่วนต่าง"
              style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)" }}
            />
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-dark"
            style={{ flex: 1, padding: "10px 0", fontSize: 13 }}
            disabled={busy}
            onClick={handleConfirmSlip}
          >
            {busy ? "กำลังดำเนินการ…" : "ยืนยันที่อยู่ใหม่"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ flex: 1, padding: "10px 0", fontSize: 13 }}
            disabled={busy}
            onClick={() => setShowRejectInput(!showRejectInput)}
          >
            สลิปไม่ถูกต้อง
          </button>
        </div>

        {showRejectInput ? (
          <div style={{ display: "grid", gap: 8 }}>
            <input
              type="text"
              placeholder="เหตุผล (ไม่บังคับ)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              disabled={busy}
              className="input"
              style={{ fontSize: 13 }}
            />
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 13, padding: "8px 0", color: "var(--danger)", borderColor: "var(--danger)" }}
              disabled={busy}
              onClick={handleRejectSlip}
            >
              {busy ? "กำลังดำเนินการ…" : "ยืนยันปฏิเสธสลิป"}
            </button>
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 8, padding: "9px 12px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  // ── done / rejected / null — render nothing ────────────────────────────────
  if (status === "done") {
    return (
      <div style={{ fontSize: 12, color: "var(--success)", marginTop: 6 }}>
        ✓ เปลี่ยนที่อยู่จัดส่งแล้ว
      </div>
    );
  }
  if (status === "rejected" && reason) {
    return (
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
        ✗ ปฏิเสธคำขอแก้ที่อยู่: {reason}
      </div>
    );
  }

  return null;
}

const card: React.CSSProperties = {
  padding: 16,
  border: "1px solid var(--line)",
  borderRadius: 12,
  background: "var(--surface)",
  marginBottom: 16,
};
