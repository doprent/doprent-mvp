"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  acceptBooking,
  confirmSlip,
  disputeSlip,
  markRenting,
  markCompleted,
  markReturned,
  rejectBooking,
} from "@/app/actions/bookings";
import { sellerUploadRefundSlip } from "@/app/actions/booking-disputes";
import { startProgress, doneProgress } from "@/lib/progress";
import type { BookingStatus } from "@/lib/types";
import type { PaymentChannel } from "@/lib/payments";
import SlipConfirmCountdown from "@/components/SlipConfirmCountdown";
import { useConfirm } from "@/components/ConfirmProvider";

/** A channel the shop has configured, with a human-readable preview line. */
export type ChannelOption = {
  method: PaymentChannel;
  label: string;
  /** e.g. PromptPay number, or "ธนาคารกสิกร · 123-4-56789-0 · ชื่อบัญชี" */
  detail: string;
};

type Props = {
  bookingId: string;
  status: BookingStatus;
  /** Channels the shop has set up + the shop's default — used by the accept flow. */
  channels?: ChannelOption[];
  defaultMethod?: PaymentChannel | null;
  /** "standard" | "express" — drives the carrier prompt on the ship step. */
  deliveryMethod?: string | null;
  /** Whether the renter has submitted return tracking info. */
  returnShipped?: boolean;
  /** Return tracking info from the renter (display to seller). */
  returnTracking?: {
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  } | null;
  /** First product slug — used for redirect after not_returned. */
  firstProductId?: string | null;
  /** Deposit amount — used to cap the deduction field. */
  depositAmount?: number;
  /** When the slip will be auto-confirmed (ISO string). Shown as countdown in payment_review. */
  slipConfirmDueAt?: string | null;
  /** Refund status for the returned state — drives refund slip upload UI. */
  refundStatus?: string | null;
  /** Renter's bank account snapshot (displayed when seller needs to upload refund slip). */
  refundBankName?: string | null;
  refundAccountNumber?: string | null;
  refundAccountName?: string | null;
  /** Booking end date — used to compute default nextAvailableDate. */
  endDate?: string | null;
  /** Deposit decision made by seller (for display in returned state). */
  depositDecision?: string | null;
  /** Whether refund slip has been uploaded. */
  refundSlipPath?: string | null;
};

export default function SellerBookingActions({ bookingId, status, channels = [], defaultMethod = null, deliveryMethod = null, returnShipped = false, returnTracking = null, firstProductId = null, depositAmount = 0, slipConfirmDueAt = null, refundStatus = null, refundBankName = null, refundAccountNumber = null, refundAccountName = null, endDate = null, depositDecision = null, refundSlipPath = null }: Props) {
  const router = useRouter();
  const [fee, setFee] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  // Only let the seller pick when BOTH channels are configured.
  const canChoose = channels.length >= 2;
  const [method, setMethod] = useState<PaymentChannel | null>(
    canChoose ? (defaultMethod ?? channels[0]?.method ?? null) : null,
  );

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) {
    setError("");
    setBusy(true);
    startProgress();
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "ทำรายการไม่สำเร็จ");
        return;
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
      doneProgress();
    }
  }

  if (status === "booking_pending") {
    const feeNum = Number(fee);
    const feeValid = fee !== "" && Number.isFinite(feeNum) && feeNum >= 0;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          ค่าจัดส่ง (฿)
          <input
            type="number"
            min={0}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="เช่น 80"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 15,
              fontFamily: "inherit",
              background: "var(--bg)",
              color: "var(--ink)",
              boxSizing: "border-box",
            }}
          />
        </label>

        {canChoose ? (
          <div style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>ช่องทางรับเงินสำหรับการจองนี้</span>
            <div style={{ display: "grid", gap: 8 }}>
              {channels.map((c) => {
                const active = method === c.method;
                return (
                  <label
                    key={c.method}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "11px 13px",
                      border: `1.5px solid ${active ? "var(--primary, #2e9c65)" : "var(--line)"}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      background: active ? "var(--success-soft, rgba(46,156,101,0.07))" : "var(--bg)",
                    }}
                  >
                    <input
                      type="radio"
                      name="payment-channel"
                      checked={active}
                      onChange={() => setMethod(c.method)}
                      style={{ marginTop: 2, accentColor: "var(--primary, #2e9c65)" }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 14 }}>
                        {c.label}
                        {defaultMethod === c.method ? (
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--ink-3)", background: "var(--surface)", border: "1px solid var(--line)", padding: "1px 6px", borderRadius: 999 }}>
                            ค่าเริ่มต้น
                          </span>
                        ) : null}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-3)", marginTop: 2, wordBreak: "break-word" }}>
                        {c.detail}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : channels.length === 1 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            จะเก็บเงินผ่าน <b style={{ color: "var(--ink-2)" }}>{channels[0].label}</b> — {channels[0].detail}
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy || !feeValid}
          onClick={() => run(() => acceptBooking(bookingId, feeNum, canChoose ? method : undefined))}
          style={{ padding: "13px 18px" }}
        >
          รับจอง (ใส่ค่าส่งแล้ว)
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => run(() => rejectBooking(bookingId))}
        >
          ปฏิเสธคำขอ
        </button>
        {error ? <Err msg={error} /> : null}
      </div>
    );
  }

  if (status === "payment_review") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {slipConfirmDueAt && <SlipConfirmCountdown dueAt={slipConfirmDueAt} />}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy}
          onClick={() => run(() => confirmSlip(bookingId))}
          style={{ padding: "13px 18px" }}
        >
          ยืนยันสลิป · จองสำเร็จ
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => setShowDisputeModal(true)}
        >
          สลิปไม่ถูกต้อง
        </button>
        {error ? <Err msg={error} /> : null}
        {showDisputeModal && (
          <DisputeModal
            busy={busy}
            onClose={() => setShowDisputeModal(false)}
            onSubmit={(reason) => {
              setShowDisputeModal(false);
              run(() => disputeSlip(bookingId, reason));
            }}
          />
        )}
      </div>
    );
  }

  if (status === "confirmed") {
    const isExpress = deliveryMethod === "express";
    const isStandard = deliveryMethod === "standard";
    const isShipping = isStandard || isExpress;

    // Express: tracking URL required
    // Standard: carrier + tracking number required, URL optional
    const carrierOk = !isStandard || carrier.trim().length > 0;
    const trackingNumberOk = !isStandard || trackingNumber.trim().length > 0;
    const trackingUrlOk = !isExpress || (trackingUrl.trim().length > 0 && /^https?:\/\//i.test(trackingUrl.trim()));
    const optionalUrlOk = !isStandard || trackingUrl.trim().length === 0 || /^https?:\/\//i.test(trackingUrl.trim());
    const allValid = carrierOk && trackingNumberOk && trackingUrlOk && optionalUrlOk;

    const inputCls =
      "mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
    return (
      <div className="grid gap-3">
        {isStandard ? (
          <>
            <label className="text-sm font-semibold">
              ผู้ให้บริการขนส่ง <span className="text-[var(--danger)]">*</span>
              <input
                type="text"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="เช่น Flash Express, Kerry, ไปรษณีย์ไทย"
                maxLength={80}
                className={inputCls}
              />
            </label>
            <label className="text-sm font-semibold">
              เลขพัสดุ <span className="text-[var(--danger)]">*</span>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="เช่น TH1234567890"
                maxLength={120}
                className={inputCls}
              />
            </label>
            <label className="text-sm font-semibold">
              ลิงก์ติดตามการจัดส่ง <span className="text-xs font-normal text-[var(--ink-3)]">(ถ้ามี)</span>
              <input
                type="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://..."
                maxLength={500}
                className={inputCls}
              />
            </label>
          </>
        ) : null}
        {isExpress ? (
          <label className="text-sm font-semibold">
            ลิงก์ติดตามการจัดส่ง <span className="text-[var(--danger)]">*</span>
            <input
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://..."
              maxLength={500}
              className={inputCls}
            />
            <p className="mt-1 text-xs font-normal text-[var(--ink-3)]">ส่งด่วน — แปะลิงก์ติดตามเพื่อให้ผู้เช่าติดตามสถานะได้</p>
          </label>
        ) : null}
        {/* Validation hints */}
        {isStandard && !carrierOk ? (
          <p className="text-xs text-[var(--danger)]">กรุณากรอกชื่อผู้ให้บริการขนส่ง</p>
        ) : isStandard && !trackingNumberOk ? (
          <p className="text-xs text-[var(--danger)]">กรุณากรอกเลขพัสดุ</p>
        ) : isStandard && !optionalUrlOk ? (
          <p className="text-xs text-[var(--danger)]">ลิงก์ติดตามต้องขึ้นต้นด้วย http:// หรือ https://</p>
        ) : isExpress && !trackingUrlOk ? (
          <p className="text-xs text-[var(--danger)]">กรุณาแปะลิงก์ติดตาม (เริ่มด้วย http:// หรือ https://)</p>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy || !allValid}
          onClick={() =>
            run(() =>
              markRenting(bookingId, {
                carrier: isStandard ? carrier.trim() : undefined,
                trackingNumber: isStandard && trackingNumber.trim() ? trackingNumber.trim() : undefined,
                trackingUrl: isShipping && trackingUrl.trim() ? trackingUrl.trim() : undefined,
              }),
            )
          }
        >
          ส่งชุดแล้ว · เริ่มเช่า
        </button>
        {error ? <Err msg={error} /> : null}
      </div>
    );
  }

  if (status === "renting" || status === "awaiting_return") {
    return (
      <div className="grid gap-3">
        {returnShipped && returnTracking ? (
          <div className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3">
            <div className="mb-1 text-sm font-semibold text-[var(--success)]">ลูกค้าส่งคืนแล้ว</div>
            <div className="grid gap-1 text-sm text-[var(--ink-2)]">
              {returnTracking.carrier ? <div>ขนส่ง: <span className="font-medium text-[var(--ink)]">{returnTracking.carrier}</span></div> : null}
              {returnTracking.trackingNumber ? <div>เลขพัสดุ: <span className="font-medium text-[var(--ink)]">{returnTracking.trackingNumber}</span></div> : null}
              {returnTracking.trackingUrl ? (
                <div>
                  ลิงก์:{" "}
                  <a href={returnTracking.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--accent)] underline break-all">
                    {returnTracking.trackingUrl}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span className="text-sm font-semibold text-[var(--ink)]">รอลูกค้าส่งคืนสินค้า</span>
            </div>
            <p className="text-[13px] text-[var(--ink-3)] ml-6">ลูกค้ายังไม่ได้กรอกข้อมูลการส่งคืน</p>
          </div>
        )}

        {returnShipped ? (
          <ReturnPanel
            busy={busy}
            error={error}
            depositAmount={depositAmount}
            endDate={endDate}
            onSubmit={(condition, note, deduction, depDecision, refAmt, nextDate) => {
              const redirectToUnits = condition === "not_returned" && firstProductId
                ? () => router.push(`/sell/products/${firstProductId}/units`)
                : undefined;
              run(() => markReturned(bookingId, condition, note, deduction, depDecision, refAmt, nextDate), redirectToUnits);
            }}
          />
        ) : endDate && new Date(endDate) <= new Date() ? (
          <NotReturnedPanel
            busy={busy}
            error={error}
            onSubmit={() => {
              const redirectToUnits = firstProductId
                ? () => router.push(`/sell/products/${firstProductId}/units`)
                : undefined;
              run(() => markReturned(bookingId, "not_returned"), redirectToUnits);
            }}
          />
        ) : null}
      </div>
    );
  }

  if (status === "returned") {
    // Refund pending — seller needs to upload refund slip
    if (refundStatus === "refund_pending" && !refundSlipPath) {
      return (
        <div className="grid gap-3">
          {/* Renter bank account info */}
          {refundAccountName && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="mb-2 text-sm font-semibold text-[var(--ink)]">บัญชีลูกค้าสำหรับคืนมัดจำ</div>
              <div className="grid gap-1 text-sm text-[var(--ink-2)]">
                <div>ชื่อบัญชี: <span className="font-medium text-[var(--ink)]">{refundAccountName}</span></div>
                {refundBankName && <div>ธนาคาร: <span className="font-medium text-[var(--ink)]">{refundBankName}</span></div>}
                {refundAccountNumber && <div>เลขบัญชี: <span className="font-medium text-[var(--ink)]">{refundAccountNumber}</span></div>}
              </div>
            </div>
          )}
          <RefundSlipUpload
            bookingId={bookingId}
            busy={busy}
            error={error}
            run={run}
          />
        </div>
      );
    }

    // Refund slip uploaded — waiting for renter verification
    if (refundSlipPath) {
      return (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2.5 text-[13px] text-[var(--accent)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span className="font-medium">อัปโหลดสลิปคืนมัดจำแล้ว รอลูกค้ายืนยัน (24 ชม.)</span>
          </div>
        </div>
      );
    }

    // Forfeited or no refund needed — just close
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy}
          onClick={() => run(() => markCompleted(bookingId))}
          style={{ padding: "13px 18px" }}
        >
          ปิดรายการ
        </button>
        {error ? <Err msg={error} /> : null}
      </div>
    );
  }

  if (status === "deposit_disputed") {
    return (
      <div className="grid gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-[13px] text-[var(--warn)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span className="font-medium">ลูกค้าโต้แย้งการตัดสินมัดจำ รอแอดมินตัดสิน</span>
        </div>
      </div>
    );
  }

  return null;
}

function DisputeModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--bg, #fff)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 420,
          padding: "22px 20px 18px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          สลิปไม่ถูกต้อง
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 14 }}>
          กรุณาระบุเหตุผล เพื่อส่งให้แอดมินตรวจสอบ
        </p>
        <textarea
          ref={inputRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น ยอดไม่ตรง, สลิปเบลอ, ชื่อไม่ตรง..."
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
            background: "var(--surface)",
            color: "var(--ink)",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            style={{ flex: 1, padding: "10px 0" }}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !reason.trim()}
            onClick={() => onSubmit(reason.trim())}
            style={{ flex: 1, padding: "10px 0", fontWeight: 600 }}
          >
            ยืนยันส่ง
          </button>
        </div>
      </div>
    </div>
  );
}

type ReturnChoice = "complete" | "damaged" | "not_returned";
type DepositDecision = "full_refund" | "partial_refund" | "forfeit";

/** Compute a default nextAvailableDate: endDate + 3 days (transit + cleaning). */
function defaultNextAvailable(endDate: string | null): string {
  if (!endDate) return "";
  const d = new Date(endDate + "T00:00:00+07:00");
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function ReturnPanel({
  busy,
  error,
  depositAmount = 0,
  endDate = null,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  depositAmount?: number;
  endDate?: string | null;
  onSubmit: (
    condition: ReturnChoice,
    damageNote?: string,
    deductionAmount?: number,
    depositDecision?: DepositDecision,
    refundAmount?: number,
    nextAvailableDate?: string,
  ) => void;
}) {
  const [choice, setChoice] = useState<ReturnChoice>("complete");
  const [note, setNote] = useState("");
  // Deposit decision (shown for all conditions when deposit > 0, except not_returned)
  const [depDecision, setDepDecision] = useState<DepositDecision>("full_refund");
  const [partialAmount, setPartialAmount] = useState("");
  // Next available date — seller can override
  const [nextDate, setNextDate] = useState(defaultNextAvailable(endDate));

  const hasDeposit = depositAmount > 0;

  const options: { value: ReturnChoice; label: string; hint: string }[] = [
    { value: "complete", label: "คืนของแบบสมบูรณ์", hint: "ได้รับชุดคืนครบถ้วน สภาพดี" },
    { value: "damaged", label: "มีความเสียหาย", hint: "ได้รับชุดคืนแต่มีความเสียหาย — ระบุรายละเอียด" },
    { value: "not_returned", label: "ลูกค้าไม่ส่งคืนของ", hint: "ยังไม่ได้รับชุดคืน — หักมัดจำทั้งหมด" },
  ];

  const partialNum = Number(partialAmount);
  const partialValid = depDecision !== "partial_refund" || (partialAmount !== "" && Number.isFinite(partialNum) && partialNum >= 1 && partialNum < depositAmount);
  const damageNoteOk = choice !== "damaged" || note.trim().length > 0;
  const canSubmit = !busy && damageNoteOk && partialValid;

  // Compute refund amount based on decision
  function computeRefundAmount(): number | undefined {
    if (!hasDeposit) return undefined;
    if (choice === "not_returned") return 0;
    switch (depDecision) {
      case "full_refund": return depositAmount;
      case "partial_refund": return partialNum;
      case "forfeit": return 0;
    }
  }

  // Compute deduction amount
  function computeDeduction(): number | undefined {
    if (!hasDeposit) return undefined;
    if (choice === "not_returned") return depositAmount;
    switch (depDecision) {
      case "full_refund": return 0;
      case "partial_refund": return depositAmount - partialNum;
      case "forfeit": return depositAmount;
    }
  }

  const inputCls =
    "mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";

  return (
    <div className="grid gap-3">
      {/* Condition selector */}
      <div className="grid gap-2">
        {options.map((opt) => {
          const active = choice === opt.value;
          return (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3"
              style={{
                borderColor: active ? "var(--accent)" : "var(--line)",
                background: active ? "var(--accent-soft)" : "var(--bg)",
              }}
            >
              <input
                type="radio"
                name="return-condition"
                checked={active}
                onChange={() => { setChoice(opt.value); if (opt.value === "complete") setDepDecision("full_refund"); }}
                style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer" }}
              />
              <span>
                <span className="block text-[14px] font-semibold text-[var(--ink)]">{opt.label}</span>
                <span className="block text-[12px] text-[var(--ink-2)]">{opt.hint}</span>
              </span>
            </label>
          );
        })}
      </div>

      {/* Damage note (damaged only) */}
      {choice === "damaged" ? (
        <label className="text-sm font-semibold">
          ระบุความเสียหายที่พบ <span className="text-[var(--danger)]">*</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น มีรอยเปื้อน / ตะเข็บขาด / ซิปเสีย"
            rows={3}
            maxLength={1000}
            className={inputCls}
          />
        </label>
      ) : null}

      {/* Deposit decision (all conditions except not_returned, when deposit > 0) */}
      {hasDeposit && choice !== "not_returned" ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="mb-2 text-sm font-semibold text-[var(--ink)]">
            การคืนมัดจำ <span className="text-xs font-normal text-[var(--ink-3)]">(มัดจำ {depositAmount.toLocaleString()} ฿)</span>
          </div>
          <div className="grid gap-2">
            {([
              { value: "full_refund" as const, label: "คืนมัดจำเต็มจำนวน", hint: `คืน ${depositAmount.toLocaleString()} ฿` },
              { value: "partial_refund" as const, label: "คืนบางส่วน", hint: "ระบุจำนวนที่จะคืน" },
              { value: "forfeit" as const, label: "ริบมัดจำทั้งหมด", hint: "หักมัดจำ 100%" },
            ]).map((opt) => {
              const active = depDecision === opt.value;
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--line)",
                    background: active ? "var(--accent-soft)" : "var(--bg)",
                  }}
                >
                  <input
                    type="radio"
                    name="deposit-decision"
                    checked={active}
                    onChange={() => setDepDecision(opt.value)}
                    style={{ width: 14, height: 14, marginTop: 2, cursor: "pointer" }}
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-[var(--ink)]">{opt.label}</span>
                    <span className="block text-[11px] text-[var(--ink-3)]">{opt.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {depDecision === "partial_refund" ? (
            <label className="mt-2 block text-sm font-semibold">
              จำนวนที่จะคืน (฿)
              <input
                type="number"
                min={1}
                max={depositAmount - 1}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder={`1 ถึง ${(depositAmount - 1).toLocaleString()}`}
                className={inputCls}
              />
              {partialAmount !== "" && !partialValid ? (
                <p className="mt-1 text-xs text-[var(--danger)]">จำนวนต้องอยู่ระหว่าง 1 ถึง {(depositAmount - 1).toLocaleString()} ฿</p>
              ) : null}
            </label>
          ) : null}

          {(depDecision === "partial_refund" || depDecision === "forfeit") ? (
            <p className="mt-2 text-[11px] text-[var(--warn)]">
              ลูกค้าสามารถโต้แย้งได้ภายใน 48 ชม. หลังบันทึก
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Not returned = auto-forfeit info */}
      {hasDeposit && choice === "not_returned" ? (
        <div className="rounded-lg bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] text-[var(--danger)]">
          มัดจำ {depositAmount.toLocaleString()} ฿ จะถูกหักทั้งหมด · ลูกค้าสามารถโต้แย้งได้ภายใน 48 ชม.
        </div>
      ) : null}

      {/* Next available date (for complete/damaged only) */}
      {choice !== "not_returned" ? (
        <label className="text-sm font-semibold">
          วันที่สินค้าพร้อมให้เช่าอีกครั้ง
          <span className="ml-1 text-xs font-normal text-[var(--ink-3)]">(เปลี่ยนได้)</span>
          <input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-[var(--ink-3)]">
            ปฏิทินจะบล็อกวันก่อนวันนี้ไม่ให้จอง (ค่าเริ่มต้น = วันสิ้นสุดเช่า + 3 วัน)
          </p>
        </label>
      ) : null}

      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={!canSubmit}
        onClick={() => onSubmit(
          choice,
          choice === "damaged" ? note.trim() : undefined,
          computeDeduction(),
          hasDeposit && choice !== "not_returned" ? depDecision : (choice === "not_returned" ? "forfeit" : undefined),
          computeRefundAmount(),
          choice !== "not_returned" && nextDate ? nextDate : undefined,
        )}
        style={{ padding: "13px 18px" }}
      >
        บันทึกการรับคืน
      </button>
      {error ? <Err msg={error} /> : null}
    </div>
  );
}

/** Minimal panel for marking "not returned" when the renter hasn't shipped yet. */
function NotReturnedPanel({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onSubmit: () => void;
}) {
  const confirm = useConfirm();
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn text-sm font-semibold"
        style={{
          padding: "12px 18px",
          background: "var(--danger)",
          borderColor: "var(--danger)",
          color: "#fff",
          borderRadius: 10,
        }}
        disabled={busy}
        onClick={async () => {
          if (await confirm({ message: "ยืนยันว่าลูกค้าไม่ส่งคืนสินค้า? มัดจำจะถูกหักทั้งหมด", variant: "danger", confirmLabel: "ยืนยัน" })) {
            onSubmit();
          }
        }}
      >
        ลูกค้าไม่ส่งคืนของ · หักมัดจำทั้งหมด
      </button>
      {error ? <Err msg={error} /> : null}
    </div>
  );
}

/** Refund slip upload form — seller uploads proof of deposit refund transfer. */
function RefundSlipUpload({
  bookingId,
  busy,
  error,
  run,
}: {
  bookingId: string;
  busy: boolean;
  error: string;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    pendingFile.current = file;
    setPreview(URL.createObjectURL(file));
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function cancelPreview() {
    pendingFile.current = null;
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function confirmUpload() {
    const file = pendingFile.current;
    if (!file) return;
    const fd = new FormData();
    fd.set("slip", file);
    run(() => sellerUploadRefundSlip(bookingId, fd));
  }

  return (
    <div className="grid gap-3">
      <div className="text-sm font-semibold text-[var(--ink)]">อัปโหลดสลิปคืนมัดจำ</div>
      <p className="text-xs text-[var(--ink-3)]">
        โอนเงินตามบัญชีข้างบน แล้วอัปโหลดสลิปเป็นหลักฐาน ลูกค้าจะมีเวลา 24 ชม. ยืนยัน
      </p>

      {!preview ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed py-7 px-4 text-center cursor-pointer transition-colors ${dragOver ? "border-[var(--accent)] bg-[var(--accent-soft,rgba(0,128,128,0.04))]" : "border-[var(--line)] bg-white"}`}
        >
          <div className="mb-2">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="text-[13px] text-[var(--ink-2)] leading-relaxed">
            ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือกรูป
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={onFileSelect}
            disabled={busy}
            className="hidden"
          />
        </div>
      ) : (
        <div className="rounded-[10px] border border-[var(--line)] bg-white p-3">
          <div className="text-[13px] font-semibold text-[var(--ink-2)] mb-2">
            ตรวจสอบสลิปก่อนส่ง
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="สลิปคืนมัดจำ"
            className="w-full max-h-[320px] object-contain rounded-lg bg-[var(--bg)]"
          />
          <div className="text-center text-[11.5px] text-[var(--ink-3)] mt-1">
            กดที่รูปเพื่อดูขนาดเต็ม
          </div>
        </div>
      )}

      <div className="flex gap-2.5">
        {preview ? (
          <button
            type="button"
            className="btn btn-outline flex-1 py-2.5"
            onClick={cancelPreview}
            disabled={busy}
          >
            เลือกรูปใหม่
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary flex-1 py-2.5 font-semibold"
          onClick={confirmUpload}
          disabled={busy || !preview}
          style={{ opacity: preview ? 1 : 0.5 }}
        >
          {busy ? "กำลังส่ง…" : "ยืนยันส่งสลิป"}
        </button>
      </div>
      {error ? <Err msg={error} /> : null}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13.5px] text-[var(--danger)]">
      {msg}
    </div>
  );
}
