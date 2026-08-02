"use client";

import { useState, useRef, useEffect } from "react";

export default function EscalateModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
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
          โต้แย้ง · ให้แอดมินตัดสิน
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 14, lineHeight: 1.5 }}>
          อธิบายเหตุผลของคุณ แอดมินจะตรวจสอบสลิปและตัดสินให้
        </p>
        <textarea
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น ยอดตรง, โอนจากบัญชีอื่น, สลิปถูกต้องแล้ว..."
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
            disabled={busy || !note.trim()}
            onClick={() => onSubmit(note.trim())}
            style={{ flex: 1, padding: "10px 0", fontWeight: 600 }}
          >
            ส่งให้แอดมิน
          </button>
        </div>
      </div>
    </div>
  );
}
