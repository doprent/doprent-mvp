"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editBookingAddress } from "@/app/actions/addresses";

type Props = {
  bookingId: string;
  /** Current values to pre-fill the form. */
  recipientName: string | null;
  phone: string | null;
  addressText: string | null;
};

export default function EditAddressForm({
  bookingId,
  recipientName,
  phone,
  addressText,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await editBookingAddress(bookingId, fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(true);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div style={{ marginTop: 6 }}>
        {success ? (
          <p style={{ fontSize: 13, color: "var(--success)", marginBottom: 6 }}>
            บันทึกที่อยู่ใหม่แล้ว ✓
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-outline"
          style={{ fontSize: 13, padding: "6px 14px" }}
          onClick={() => setOpen(true)}
        >
          แก้ไขที่อยู่
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 10, display: "grid", gap: 10 }}>
      <div>
        <label style={{ fontSize: 13, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>
          ชื่อผู้รับ
        </label>
        <input
          name="recipient_name"
          defaultValue={recipientName ?? ""}
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
          defaultValue={phone ?? ""}
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
          ที่อยู่จัดส่ง
        </label>
        <textarea
          name="address_text"
          defaultValue={addressText ?? ""}
          required
          disabled={busy}
          className="input"
          style={{ width: "100%", fontSize: 14, minHeight: 72, resize: "vertical" }}
          placeholder="บ้านเลขที่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
        />
      </div>

      {error ? (
        <div
          style={{
            padding: "9px 12px",
            background: "var(--danger-soft)",
            color: "var(--danger)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
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
          {busy ? "กำลังบันทึก…" : "บันทึก"}
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
