"use client";

import { useState, useRef, useEffect } from "react";

export default function CancelRequestModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
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
          ขอยกเลิกการจอง
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 14, lineHeight: 1.5 }}>
          คำขอของคุณจะถูกส่งให้แอดมินพิจารณา ระบุเหตุผลให้ชัดเจนเพื่อให้การพิจารณาเร็วขึ้น
        </p>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น เปลี่ยนใจ, มีเหตุฉุกเฉิน, วันงานเปลี่ยน..."
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
        <p className="mt-2 text-xs text-[var(--ink-3)]">
          หมายเหตุ: การยกเลิกหลังชำระเงินแล้วอาจมีเงื่อนไขการคืนเงินตามนโยบายร้าน
        </p>
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
            style={{
              flex: 1,
              padding: "10px 0",
              fontWeight: 600,
              background: "var(--danger)",
              borderColor: "var(--danger)",
            }}
          >
            ส่งคำขอยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
