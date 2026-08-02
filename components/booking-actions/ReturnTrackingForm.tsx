"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startProgress, doneProgress } from "@/lib/progress";
import { submitReturnTracking } from "@/app/actions/bookings";

export default function ReturnTrackingForm({
  bookingId,
  returnMethod,
  busy: parentBusy,
  setBusy,
  setError,
  router,
}: {
  bookingId: string;
  returnMethod: string | null;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const isExpress = returnMethod === "express";
  const isStandard = returnMethod === "standard";

  // Express: tracking URL required
  // Standard: carrier + tracking number required, URL optional
  const carrierOk = !isStandard || carrier.trim().length > 0;
  const trackingNumberOk = !isStandard || trackingNumber.trim().length > 0;
  const trackingUrlOk = !isExpress || (trackingUrl.trim().length > 0 && /^https?:\/\//i.test(trackingUrl.trim()));
  const optionalUrlOk = !isStandard || trackingUrl.trim().length === 0 || /^https?:\/\//i.test(trackingUrl.trim());
  const allValid = carrierOk && trackingNumberOk && trackingUrlOk && optionalUrlOk;

  const inputCls =
    "mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";

  async function handleSubmit() {
    setBusy(true);
    setError("");
    startProgress();
    try {
      const res = await submitReturnTracking(bookingId, {
        carrier: isStandard ? carrier.trim() : undefined,
        trackingNumber: isStandard && trackingNumber.trim() ? trackingNumber.trim() : undefined,
        trackingUrl: trackingUrl.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "ส่งข้อมูลไม่สำเร็จ");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      doneProgress();
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 text-[14px] font-semibold">ส่งคืนสินค้า</div>
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
            ลิงก์ติดตามการส่งคืน <span className="text-[var(--danger)]">*</span>
            <input
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://..."
              maxLength={500}
              className={inputCls}
            />
            <p className="mt-1 text-xs font-normal text-[var(--ink-3)]">ส่งด่วน — แปะลิงก์ติดตามเพื่อให้ร้านค้าติดตามสถานะได้</p>
          </label>
        ) : null}
        {/* Fallback: if returnMethod is unknown, show generic form */}
        {!isStandard && !isExpress ? (
          <>
            <label className="text-sm font-semibold">
              เลขพัสดุ / ลิงก์ติดตาม <span className="text-[var(--danger)]">*</span>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="เลขพัสดุ หรือ ลิงก์ติดตาม"
                maxLength={500}
                className={inputCls}
              />
            </label>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={parentBusy || !allValid}
          onClick={handleSubmit}
        >
          {parentBusy ? "กำลังส่ง..." : "ยืนยันส่งคืนสินค้า"}
        </button>
      </div>
    </div>
  );
}
