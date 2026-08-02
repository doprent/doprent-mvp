"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking, uploadSlip, requestCancelAfterPayment } from "@/app/actions/bookings";
import { escalateDispute, escalateReturnDispute, escalateDepositDispute, disputeRefundSlip, renterVerifyRefundSlip } from "@/app/actions/booking-disputes";
import { startProgress, doneProgress } from "@/lib/progress";
import { useConfirm } from "@/components/ConfirmProvider";
import type { BookingStatus } from "@/lib/types";
import Lightbox from "@/components/booking-actions/Lightbox";
import CancelRequestModal from "@/components/booking-actions/CancelRequestModal";
import ReturnTrackingForm from "@/components/booking-actions/ReturnTrackingForm";
import ReturnDisputeModal from "@/components/booking-actions/ReturnDisputeModal";
import DepositDisputeModal from "@/components/booking-actions/DepositDisputeModal";
import EscalateModal from "@/components/booking-actions/EscalateModal";
import RefundSlipDisputeModal from "@/components/booking-actions/RefundSlipDisputeModal";

type Props = {
  bookingId: string;
  status: BookingStatus;
  canPay: boolean;
  disputeReason?: string | null;
  disputeNote?: string | null;
  /** Return method chosen at checkout ("standard" | "express"). */
  returnMethod?: string | null;
  /** Whether the renter has already submitted return tracking. */
  returnShipped?: boolean;
  /** ISO string of the currentDueAt deadline (used for return dispute countdown). */
  currentDueAt?: string | null;
  /** Deposit decision from seller (for dispute UI). */
  depositDecision?: string | null;
  /** Deposit dispute note (already submitted). */
  depositDisputeNote?: string | null;
  /** Refund status (for refund slip verification). */
  refundStatus?: string | null;
  /** Refund amount (display to renter). */
  refundAmount?: number | null;
  /** Deposit total. */
  depositAmount?: number;
  /** Refund slip path (seller uploaded). */
  refundSlipPath?: string | null;
  /** Signed URL for the refund slip image. */
  refundSlipUrl?: string | null;
};

export default function RenterBookingActions({ bookingId, status, canPay, disputeReason, disputeNote, returnMethod = null, returnShipped = false, currentDueAt, depositDecision = null, depositDisputeNote = null, refundStatus = null, refundAmount = null, depositAmount = 0, refundSlipPath = null, refundSlipUrl = null }: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const pendingFile = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showEscalate, setShowEscalate] = useState(false);
  const [showCancelRequest, setShowCancelRequest] = useState(false);
  const [showReturnDispute, setShowReturnDispute] = useState(false);
  const [showDepositDispute, setShowDepositDispute] = useState(false);
  const [showRefundSlipDispute, setShowRefundSlipDispute] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    setError("");
    pendingFile.current = file;
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  function cancelPreview() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    pendingFile.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmUpload() {
    const file = pendingFile.current;
    if (!file) return;
    setBusy(true);
    setError("");
    startProgress();
    try {
      const fd = new FormData();
      fd.append("slip", file);
      const res = await uploadSlip(bookingId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      pendingFile.current = null;
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      doneProgress();
    }
  }

  async function onCancel() {
    if (!(await confirm({ message: "ยืนยันยกเลิกการจองนี้?", variant: "danger", confirmLabel: "ยกเลิกการจอง" }))) return;
    setError("");
    setBusy(true);
    startProgress();
    try {
      const res = await cancelBooking(bookingId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      doneProgress();
    }
  }

  const canCancel = status === "booking_pending" || status === "waiting_for_payment";
  const isDisputed = status === "slip_disputed";
  // Renter can REQUEST cancel (not instant) for these post-payment statuses.
  // Not allowed once renting: the dress is already out for the rental.
  const canRequestCancel =
    status === "payment_review" || status === "confirmed";
  const isCancelPending = status === "cancel_requested";

  const previewBlock = preview && (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: 12,
        background: "var(--surface)",
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        {isDisputed ? "ตรวจสอบสลิปใหม่ก่อนส่ง" : "ตรวจสอบสลิปก่อนส่ง"}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview}
        alt="slip preview"
        onClick={() => setLightbox(true)}
        style={{
          width: "100%",
          maxHeight: 320,
          objectFit: "contain",
          borderRadius: 8,
          background: "var(--bg)",
          marginBottom: 4,
          cursor: "zoom-in",
        }}
      />
      <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", marginBottom: 8 }}>
        กดที่รูปเพื่อดูขนาดเต็ม
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={cancelPreview}
          disabled={busy}
          style={{ flex: 1, padding: "10px 0" }}
        >
          เปลี่ยนรูป
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={confirmUpload}
          disabled={busy}
          style={{ flex: 1, padding: "10px 0", fontWeight: 600 }}
        >
          {busy ? "กำลังส่ง…" : isDisputed ? "ยืนยันส่งสลิปใหม่" : "ยืนยันส่งสลิป"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* ── Slip disputed: show reason + renter options ── */}
      {isDisputed && (
        <div
          style={{
            padding: 16,
            border: "1px solid var(--warn)",
            borderRadius: 12,
            background: "var(--warn-soft)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "var(--warn)" }}>
            ร้านแจ้งว่าสลิปไม่ถูกต้อง
          </div>
          {disputeReason && (
            <div
              style={{
                fontSize: 13.5,
                color: "var(--ink-2)",
                padding: "8px 12px",
                background: "var(--bg)",
                borderRadius: 8,
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              เหตุผลจากร้าน: {disputeReason}
            </div>
          )}

          {disputeNote && (
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                padding: "8px 12px",
                background: "var(--info-soft)",
                border: "1px solid color-mix(in oklch, var(--info) 30%, transparent)",
                borderRadius: 8,
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              ข้อความโต้แย้งของคุณ: {disputeNote}
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
                แอดมินจะตรวจสอบและตัดสินให้
              </div>
            </div>
          )}

          {!disputeNote && (
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 12, lineHeight: 1.5 }}>
              คุณสามารถอัปโหลดสลิปใหม่ หรือโต้แย้งให้แอดมินตัดสิน
            </div>
          )}

          {!preview && (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--line)"}`,
                borderRadius: 10,
                padding: "20px 16px",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "var(--accent-soft, rgba(0,128,128,0.04))" : "#fff",
                transition: "border-color 0.15s, background 0.15s",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 2 }}>
                อัปโหลดสลิปใหม่
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                ลากไฟล์มาวาง หรือกดเพื่อเลือก
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={onFileSelect}
                disabled={busy}
                style={{ display: "none" }}
              />
            </div>
          )}

          {previewBlock}

          {!disputeNote && !preview && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowEscalate(true)}
              disabled={busy}
              style={{ width: "100%", padding: "11px 0" }}
            >
              โต้แย้ง · ให้แอดมินตัดสิน
            </button>
          )}
        </div>
      )}

      {/* ── Normal payment upload — DropZone + confirm ── */}
      {canPay ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            แนบสลิปการโอน <span style={{ color: "var(--danger)" }}>*</span>
          </div>

          {!preview ? (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--line)"}`,
                borderRadius: 12,
                padding: "28px 16px",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "var(--accent-soft, rgba(0,128,128,0.04))" : "#fff",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block" }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือกรูป
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={onFileSelect}
                disabled={busy}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: 12,
                background: "#fff",
                marginBottom: 0,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--ink-2)" }}>
                ตรวจสอบสลิปก่อนส่ง
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="slip preview"
                onClick={() => setLightbox(true)}
                style={{
                  width: "100%",
                  maxHeight: 320,
                  objectFit: "contain",
                  borderRadius: 8,
                  background: "var(--bg)",
                  cursor: "zoom-in",
                }}
              />
              <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
                กดที่รูปเพื่อดูขนาดเต็ม
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            {preview ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={cancelPreview}
                disabled={busy}
                style={{ flex: 1, padding: "10px 0" }}
              >
                อัปโหลดใหม่
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirmUpload}
              disabled={busy || !preview}
              style={{ flex: 1, padding: "10px 0", fontWeight: 600, opacity: preview ? 1 : 0.5 }}
            >
              {busy ? "กำลังส่ง..." : "ยืนยันส่งสลิป"}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Return tracking form (renting / awaiting_return) ── */}
      {(status === "renting" || status === "awaiting_return") && !returnShipped ? (
        <ReturnTrackingForm
          bookingId={bookingId}
          returnMethod={returnMethod}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          router={router}
        />
      ) : null}

      {(status === "renting" || status === "awaiting_return") && returnShipped ? (
        <div className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--success)]">ส่งข้อมูลการส่งคืนแล้ว</span>
          <span> รอร้านค้าตรวจรับสินค้า</span>
        </div>
      ) : null}

      {/* ── Return dispute: renter can dispute "not returned" ── */}
      {status === "not_returned" && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
          <div className="mb-1 text-sm font-bold text-[var(--danger)]">
            ร้านแจ้งว่าคุณไม่ได้คืนสินค้า
          </div>
          <p className="mb-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
            หากคุณส่งคืนแล้ว สามารถโต้แย้งได้ภายใน 48 ชม. แอดมินจะตรวจสอบและตัดสินให้
          </p>
          <button
            type="button"
            className="btn btn-primary w-full py-3 text-sm font-semibold"
            onClick={() => setShowReturnDispute(true)}
            disabled={busy}
          >
            โต้แย้ง · ฉันส่งคืนแล้ว
          </button>
        </div>
      )}

      {/* ── Return dispute waiting ── */}
      {status === "return_disputed" && (
        <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] p-4">
          <div className="mb-1 text-sm font-bold text-[var(--warn)]">
            รอแอดมินตรวจสอบข้อโต้แย้ง
          </div>
          {disputeNote ? (
            <div className="my-2 rounded-lg bg-white/60 p-3 text-[13px] text-[var(--ink-2)]">
              ข้อความของคุณ: {disputeNote}
            </div>
          ) : null}
          {currentDueAt ? (
            <p className="text-xs text-[var(--ink-3)]">
              แอดมินจะตัดสินภายใน{" "}
              {new Date(currentDueAt).toLocaleString("th-TH", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Bangkok",
              })}
            </p>
          ) : null}
        </div>
      )}

      {/* ── Deposit dispute: renter can dispute partial/forfeit in "returned" status ── */}
      {status === "returned" && depositDecision && (depositDecision === "partial_refund" || depositDecision === "forfeit") && !depositDisputeNote && (
        <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] p-4">
          <div className="mb-1 text-sm font-bold text-[var(--warn)]">
            {depositDecision === "forfeit" ? "ร้านริบมัดจำทั้งหมด" : "ร้านคืนมัดจำบางส่วน"}
          </div>
          <p className="mb-1 text-[13px] text-[var(--ink-2)]">
            {depositDecision === "forfeit"
              ? `มัดจำ ${depositAmount.toLocaleString()} ฿ ถูกริบทั้งหมด`
              : `ร้านคืน ${(refundAmount ?? 0).toLocaleString()} ฿ จากมัดจำ ${depositAmount.toLocaleString()} ฿`}
          </p>
          <p className="mb-3 text-[12px] text-[var(--ink-3)]">
            หากคุณไม่เห็นด้วย สามารถโต้แย้งได้ภายใน 48 ชม. แอดมินจะตรวจสอบและตัดสินให้
          </p>
          <button
            type="button"
            className="btn btn-primary w-full py-3 text-sm font-semibold"
            onClick={() => setShowDepositDispute(true)}
            disabled={busy}
          >
            โต้แย้งการตัดสินมัดจำ
          </button>
        </div>
      )}

      {/* ── Deposit dispute already submitted ── */}
      {status === "returned" && depositDisputeNote && (
        <div className="rounded-xl border border-[var(--info)] bg-[var(--info-soft)] p-4">
          <div className="mb-1 text-sm font-bold text-[var(--info)]">ส่งข้อโต้แย้งมัดจำแล้ว</div>
          <div className="my-2 rounded-lg bg-white/60 p-3 text-[13px] text-[var(--ink-2)]">
            ข้อความของคุณ: {depositDisputeNote}
          </div>
          <p className="text-xs text-[var(--ink-3)]">รอแอดมินตรวจสอบและตัดสินให้</p>
        </div>
      )}

      {/* ── Deposit disputed status (waiting for admin) ── */}
      {status === "deposit_disputed" && (
        <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] p-4">
          <div className="mb-1 text-sm font-bold text-[var(--warn)]">
            รอแอดมินตรวจสอบข้อโต้แย้งมัดจำ
          </div>
          {depositDisputeNote ? (
            <div className="my-2 rounded-lg bg-white/60 p-3 text-[13px] text-[var(--ink-2)]">
              ข้อความของคุณ: {depositDisputeNote}
            </div>
          ) : null}
          {currentDueAt ? (
            <p className="text-xs text-[var(--ink-3)]">
              แอดมินจะตัดสินภายใน{" "}
              {new Date(currentDueAt).toLocaleString("th-TH", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Bangkok",
              })}
            </p>
          ) : null}
        </div>
      )}

      {/* ── Refund slip verification (seller uploaded, renter verifies) ── */}
      {status === "returned" && refundSlipPath && (
        <div className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-4">
          <div className="mb-2 text-sm font-bold text-[var(--success)]">
            ร้านโอนคืนมัดจำแล้ว
          </div>
          <p className="mb-2 text-[13px] text-[var(--ink-2)]">
            จำนวน {(refundAmount ?? 0).toLocaleString()} ฿ — ตรวจสอบสลิปแล้วกดยืนยัน
          </p>
          {refundSlipUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={refundSlipUrl}
              alt="สลิปคืนมัดจำ"
              className="mb-3 max-w-full rounded-lg border border-[var(--line)]"
              style={{ maxHeight: 280, objectFit: "contain" }}
            />
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              className="btn btn-outline flex-1 py-3 text-sm font-semibold text-[var(--danger)] border-[var(--danger)]"
              disabled={busy}
              onClick={() => setShowRefundSlipDispute(true)}
            >
              สลิปมีปัญหา
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1 py-3 text-sm font-semibold"
              disabled={busy}
              onClick={async () => {
                if (!(await confirm({ message: "ยืนยันว่าได้รับเงินคืนมัดจำแล้ว?", confirmLabel: "ยืนยันรับเงิน" }))) return;
                setBusy(true);
                setError("");
                startProgress();
                try {
                  const res = await renterVerifyRefundSlip(bookingId);
                  if (!res.ok) { setError(res.error); return; }
                  router.refresh();
                } finally {
                  setBusy(false);
                  doneProgress();
                }
              }}
            >
              {busy ? "กำลังยืนยัน..." : "ยืนยันรับเงิน"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-3)]">
            หากไม่ยืนยันภายใน 24 ชม. ระบบจะปิดรายการโดยอัตโนมัติ
          </p>
        </div>
      )}

      {/* ── Refund slip dispute modal ── */}
      {showRefundSlipDispute && (
        <RefundSlipDisputeModal
          busy={busy}
          onClose={() => setShowRefundSlipDispute(false)}
          onSubmit={async (reason) => {
            setShowRefundSlipDispute(false);
            setBusy(true);
            setError("");
            startProgress();
            try {
              const res = await disputeRefundSlip(bookingId, reason);
              if (!res.ok) { setError(res.error); return; }
              router.refresh();
            } finally {
              setBusy(false);
              doneProgress();
            }
          }}
        />
      )}

      {/* ── Full refund waiting (refund_pending, no slip yet) ── */}
      {status === "returned" && refundStatus === "refund_pending" && !refundSlipPath && depositDecision === "full_refund" && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">รอร้านโอนคืนมัดจำ</span>
          <span> {(refundAmount ?? depositAmount).toLocaleString()} ฿</span>
        </div>
      )}

      {canCancel ? (
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
          ยกเลิกการจอง
        </button>
      ) : null}

      {/* ── Cancel-after-payment request ── */}
      {canRequestCancel ? (
        <button
          type="button"
          className="btn btn-outline w-full py-3 text-sm text-[var(--danger)] border-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors"
          onClick={() => setShowCancelRequest(true)}
          disabled={busy}
        >
          ขอยกเลิกการจอง
        </button>
      ) : null}

      {isCancelPending ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">ส่งคำขอยกเลิกแล้ว</span>
          <span> รอแอดมินอนุมัติ</span>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--danger-soft)",
            color: "var(--danger)",
            borderRadius: 8,
            fontSize: 13.5,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* ── Lightbox (full-screen zoom) ── */}
      {lightbox && preview && (
        <Lightbox src={preview} onClose={() => setLightbox(false)} />
      )}

      {/* ── Escalate modal ── */}
      {showEscalate && (
        <EscalateModal
          busy={busy}
          onClose={() => setShowEscalate(false)}
          onSubmit={async (note) => {
            setShowEscalate(false);
            setBusy(true);
            setError("");
            startProgress();
            try {
              const res = await escalateDispute(bookingId, note);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            } finally {
              setBusy(false);
              doneProgress();
            }
          }}
        />
      )}

      {/* ── Cancel-request modal ── */}
      {showCancelRequest && (
        <CancelRequestModal
          busy={busy}
          onClose={() => setShowCancelRequest(false)}
          onSubmit={async (reason) => {
            setShowCancelRequest(false);
            setBusy(true);
            setError("");
            startProgress();
            try {
              const res = await requestCancelAfterPayment(bookingId, reason);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            } finally {
              setBusy(false);
              doneProgress();
            }
          }}
        />
      )}

      {/* ── Return dispute modal ── */}
      {showReturnDispute && (
        <ReturnDisputeModal
          busy={busy}
          onClose={() => setShowReturnDispute(false)}
          onSubmit={async (note) => {
            setShowReturnDispute(false);
            setBusy(true);
            setError("");
            startProgress();
            try {
              const res = await escalateReturnDispute(bookingId, note);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            } finally {
              setBusy(false);
              doneProgress();
            }
          }}
        />
      )}

      {/* ── Deposit dispute modal ── */}
      {showDepositDispute && (
        <DepositDisputeModal
          busy={busy}
          onClose={() => setShowDepositDispute(false)}
          onSubmit={async (note) => {
            setShowDepositDispute(false);
            setBusy(true);
            setError("");
            startProgress();
            try {
              const res = await escalateDepositDispute(bookingId, note);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            } finally {
              setBusy(false);
              doneProgress();
            }
          }}
        />
      )}
    </div>
  );
}

