"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  adminAcceptSlip,
  adminApproveCancel,
  adminDenyCancel,
  adminForceStatus,
  adminRejectSlip,
  recordRefund,
} from "@/app/actions/admin";
import { adminResolveReturnDispute } from "@/app/actions/booking-disputes";
import type { BookingStatus } from "@/lib/types";
import { BOOKING_STATUS_META } from "@/lib/bookings";
import { useConfirm, usePrompt } from "@/components/ConfirmProvider";

type Props = {
  bookingId: string;
  status: BookingStatus;
  /** Passed in from the server page so the approve form and refund form render correctly. */
  refundStatus?: string | null;
  /** Renter's dispute note (for return_disputed). */
  disputeNote?: string | null;
  /** Auto-resolve deadline ISO string (for return_disputed). */
  currentDueAt?: string | null;
};

type ActionDef = {
  label: string;
  target?: BookingStatus;
  variant: "primary" | "danger" | "outline";
  confirm?: string;
  fn?: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

const ACTIONS: Partial<Record<BookingStatus, ActionDef[]>> = {
  booking_pending: [
    { label: "เลื่อนสถานะ → รอชำระเงิน", target: "waiting_for_payment", variant: "primary", confirm: "ต้องการเลื่อนเป็นรอชำระเงิน?" },
    { label: "ปฏิเสธคำขอ", target: "rejected", variant: "danger", confirm: "ปฏิเสธคำขอจอง?" },
    { label: "ยกเลิก", target: "cancelled", variant: "outline", confirm: "ยกเลิกการจองนี้?" },
  ],
  waiting_for_payment: [
    { label: "เลื่อนสถานะ → ตรวจสลิป", target: "payment_review", variant: "primary", confirm: "เลื่อนเป็นตรวจสลิป?" },
    { label: "ยกเลิก (หมดเวลาจ่าย)", target: "cancelled", variant: "outline", confirm: "ยกเลิกการจองนี้?" },
  ],
  payment_review: [
    { label: "ยืนยันสลิป · จองสำเร็จ", target: "confirmed", variant: "primary", confirm: "ยืนยันสลิป?" },
    { label: "สลิปไม่ถูกต้อง → ให้จ่ายใหม่", target: "waiting_for_payment", variant: "outline", confirm: "ส่งกลับให้จ่ายใหม่?" },
    { label: "ยกเลิก", target: "cancelled", variant: "danger", confirm: "ยกเลิกการจองนี้?" },
  ],
  confirmed: [
    { label: "เลื่อนเป็นกำลังเช่า", target: "renting", variant: "primary", confirm: "เลื่อนเป็นกำลังเช่า?" },
    { label: "ทำเครื่องหมายรับคืนแล้ว", target: "returned", variant: "outline", confirm: "ข้ามไปรับคืนเลย?" },
    { label: "ยกเลิก (ต้องคืนเงิน)", target: "cancelled", variant: "danger", confirm: "ยกเลิกการจองที่จ่ายแล้ว? ต้องประสานคืนเงินเอง" },
  ],
  renting: [
    { label: "ทำเครื่องหมายรับคืนแล้ว", target: "returned", variant: "primary", confirm: "ยืนยันรับคืนชุดแล้ว?" },
    { label: "ยกเลิก (ต้องคืนเงิน)", target: "cancelled", variant: "danger", confirm: "ยกเลิกการจองที่จ่ายแล้ว? ต้องประสานคืนเงินเอง" },
  ],
  awaiting_return: [
    { label: "ทำเครื่องหมายรับคืนแล้ว", target: "returned", variant: "primary", confirm: "ยืนยันรับคืนชุดแล้ว?" },
    { label: "ยกเลิก (ต้องคืนเงิน)", target: "cancelled", variant: "danger", confirm: "ยกเลิกการจองที่จ่ายแล้ว? ต้องประสานคืนเงินเอง" },
  ],
  returned: [
    { label: "ปิดรายการ · เสร็จสิ้น", target: "completed", variant: "primary", confirm: "ปิดรายการเช่า?" },
  ],
  // cancel_requested is handled by a bespoke form below (needs refundAmount input).
  // Leave this entry absent so it falls through to the custom branch.
  slip_disputed: [
    { label: "สลิปถูกต้อง · ยืนยันการจอง", target: undefined, variant: "primary", confirm: "ยืนยันว่าสลิปถูกต้อง?", fn: (id) => adminAcceptSlip(id) },
    { label: "สลิปไม่ถูกต้อง · ให้จ่ายใหม่", target: undefined, variant: "danger", confirm: "ส่งกลับให้ลูกค้าอัปโหลดสลิปใหม่?", fn: (id) => adminRejectSlip(id) },
  ],
};

export default function AdminBookingActions({ bookingId, status, refundStatus, disputeNote, currentDueAt }: Props) {
  const showConfirm = useConfirm();
  const showPrompt = usePrompt();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forceTarget, setForceTarget] = useState("");
  // cancel_requested approve form state
  const [approveRefundAmount, setApproveRefundAmount] = useState("");
  const [approveRefundNote, setApproveRefundNote] = useState("");
  // refund slip upload state
  const refundFileRef = useRef<HTMLInputElement>(null);
  const [refundFileName, setRefundFileName] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError("");
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "ทำรายการไม่สำเร็จ");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const actions = ACTIONS[status];
  const meta = BOOKING_STATUS_META[status];
  const isTerminal = meta?.terminal;

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-2)" }}>Admin Actions</div>

      {actions && actions.length > 0 ? (
        actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`btn ${a.variant === "primary" ? "btn-primary btn-lg" : a.variant === "danger" ? "btn btn-dark" : "btn-outline"}`}
            style={{
              padding: "12px 18px",
              fontSize: 14,
              ...(a.variant === "danger" ? { background: "var(--danger)", borderColor: "var(--danger)" } : {}),
            }}
            disabled={busy}
            onClick={async () => {
              if (a.confirm && !(await showConfirm(a.confirm))) return;
              const note = (await showPrompt({ message: "หมายเหตุ (ไม่บังคับ)", placeholder: "ระบุหมายเหตุ..." })) ?? undefined;
              if (a.fn) {
                run(() => a.fn!(bookingId));
              } else if (a.target) {
                run(() => adminForceStatus(bookingId, a.target!, note));
              }
            }}
          >
            {a.label}
          </button>
        ))
      ) : isTerminal ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "8px 0" }}>
          สถานะนี้เป็นสถานะสุดท้าย ไม่มี action ปกติ
        </div>
      ) : null}

      {/* ── cancel_requested: approve with optional refund inputs ── */}
      {status === "cancel_requested" ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col gap-3">
          <div className="text-sm font-semibold text-[var(--ink-2)]">อนุมัติยกเลิก</div>
          <input
            type="number"
            min={0}
            placeholder="จำนวนเงินคืน (บาท) — ไม่บังคับ"
            value={approveRefundAmount}
            onChange={(e) => setApproveRefundAmount(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)]"
          />
          <input
            type="text"
            placeholder="หมายเหตุการคืนเงิน (ไม่บังคับ)"
            value={approveRefundNote}
            onChange={(e) => setApproveRefundNote(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn flex-1 text-sm"
              style={{ padding: "10px 0", background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }}
              disabled={busy}
              onClick={async () => {
                if (!(await showConfirm({ message: "อนุมัติยกเลิกการจองนี้?", variant: "danger", confirmLabel: "อนุมัติยกเลิก" }))) return;
                const note = (await showPrompt({ message: "หมายเหตุ admin (ไม่บังคับ)", placeholder: "ระบุหมายเหตุ..." })) ?? undefined;
                const amt = approveRefundAmount ? Number(approveRefundAmount) : undefined;
                const nt = approveRefundNote.trim() || undefined;
                run(() => adminApproveCancel(bookingId, note, amt, nt));
              }}
            >
              อนุมัติยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-outline flex-1 text-sm"
              style={{ padding: "10px 0" }}
              disabled={busy}
              onClick={async () => {
                if (!(await showConfirm("คืนสถานะก่อนหน้า?"))) return;
                const note = (await showPrompt({ message: "หมายเหตุ (ไม่บังคับ)", placeholder: "ระบุหมายเหตุ..." })) ?? undefined;
                run(() => adminDenyCancel(bookingId, note));
              }}
            >
              ไม่อนุมัติ · คืนสถานะเดิม
            </button>
          </div>
        </div>
      ) : null}

      {/* ── return_disputed: admin resolves ── */}
      {status === "return_disputed" ? (
        <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-[var(--warn)]">ผู้เช่าโต้แย้งการไม่คืนของ</div>
          {disputeNote ? (
            <div className="rounded-lg bg-white/60 p-3 text-[13px] text-[var(--ink-2)]">
              ข้อความผู้เช่า: {disputeNote}
            </div>
          ) : null}
          {currentDueAt ? (
            <p className="text-xs text-[var(--ink-3)]">
              จะถูกตัดสินอัตโนมัติ (ให้ผู้เช่า) เมื่อ{" "}
              {new Date(currentDueAt).toLocaleString("th-TH", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
              })}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1 text-sm"
              style={{ padding: "10px 0" }}
              disabled={busy}
              onClick={async () => {
                if (!(await showConfirm({ message: "ยอมรับ — สินค้าคืนแล้ว? (ผู้เช่าถูก)", confirmLabel: "ยอมรับ" }))) return;
                const note = (await showPrompt({ message: "หมายเหตุ (ไม่บังคับ)", placeholder: "ระบุหมายเหตุ..." })) ?? undefined;
                run(() => adminResolveReturnDispute(bookingId, "accept_return", note));
              }}
            >
              ยอมรับ (คืนแล้ว)
            </button>
            <button
              type="button"
              className="btn flex-1 text-sm"
              style={{ padding: "10px 0", background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }}
              disabled={busy}
              onClick={async () => {
                if (!(await showConfirm({ message: "ปฏิเสธ — สินค้ายังไม่คืน? (ร้านถูก, มัดจำถูกริบ)", variant: "danger", confirmLabel: "ปฏิเสธ" }))) return;
                const note = (await showPrompt({ message: "หมายเหตุ (ไม่บังคับ)", placeholder: "ระบุหมายเหตุ..." })) ?? undefined;
                run(() => adminResolveReturnDispute(bookingId, "reject_return", note));
              }}
            >
              ปฏิเสธ (ไม่คืน)
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Refund recording: upload slip when refund is required ── */}
      {refundStatus === "required" ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col gap-3">
          <div className="text-sm font-semibold text-[var(--ink-2)]">บันทึกการคืนเงิน (อัปโหลดสลิป)</div>
          <p className="text-xs text-[var(--ink-3)]">
            โอนเงินคืนให้ลูกค้าเสร็จแล้ว อัปโหลดสลิปเพื่อยืนยัน
          </p>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <span className="btn btn-outline px-3 py-2 text-xs">เลือกไฟล์สลิป</span>
            <span className="text-[var(--ink-3)]">{refundFileName || "ยังไม่ได้เลือกไฟล์"}</span>
            <input
              ref={refundFileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setRefundFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary text-sm"
            style={{ padding: "10px 0" }}
            disabled={busy || !refundFileName}
            onClick={async () => {
              const file = refundFileRef.current?.files?.[0];
              if (!file) { setError("เลือกไฟล์ก่อน"); return; }
              setError("");
              setBusy(true);
              try {
                const fd = new FormData();
                fd.append("slip", file);
                const res = await recordRefund(bookingId, fd);
                if (!res.ok) {
                  setError(res.error ?? "ทำรายการไม่สำเร็จ");
                  return;
                }
                router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "กำลังบันทึก…" : "ยืนยันบันทึกการคืนเงิน"}
          </button>
        </div>
      ) : null}

      {/* Force override dropdown — always available */}
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 13, color: "var(--ink-3)", cursor: "pointer", userSelect: "none" }}>
          บังคับเปลี่ยนสถานะ (override)
        </summary>
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={forceTarget}
            onChange={(e) => setForceTarget(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 13,
              background: "var(--bg)",
              color: "var(--ink)",
              flex: "1 1 180px",
            }}
          >
            <option value="">— เลือกสถานะ —</option>
            {(Object.keys(BOOKING_STATUS_META) as BookingStatus[])
              .filter((s) => s !== status)
              .map((s) => (
                <option key={s} value={s}>
                  {BOOKING_STATUS_META[s].label} ({s})
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: "8px 14px", fontSize: 13 }}
            disabled={busy || !forceTarget}
            onClick={async () => {
              const targetLabel = BOOKING_STATUS_META[forceTarget as BookingStatus]?.label ?? forceTarget;
              if (!(await showConfirm({ message: `บังคับเปลี่ยนจาก "${meta.label}" → "${targetLabel}"?`, variant: "danger", confirmLabel: "บังคับเปลี่ยน" }))) return;
              const note = await showPrompt({ message: "เหตุผล (บังคับกรอก)", placeholder: "ระบุเหตุผล...", required: true });
              if (!note) return;
              run(() => adminForceStatus(bookingId, forceTarget, note));
            }}
          >
            บังคับเปลี่ยน
          </button>
        </div>
      </details>

      {error ? <Err msg={error} /> : null}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "var(--danger-soft)",
        color: "var(--danger)",
        borderRadius: 8,
        fontSize: 13.5,
      }}
    >
      {msg}
    </div>
  );
}
