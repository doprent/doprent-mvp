"use client";

import { useState } from "react";
import { addAddress, updateAddress, deleteAddress, setDefaultAddress } from "@/app/actions/addresses";
import { useConfirm } from "@/components/ConfirmProvider";
import type { Address } from "@/lib/types";

type Props = { addresses: Address[] };

type Mode = { kind: "none" } | { kind: "add" } | { kind: "edit"; id: string };

/**
 * Renter address book — list, add, edit, delete and pick a default shipping
 * address. Mirrors the simplified shape used at checkout (recipient / phone /
 * free-form address text) so the two flows stay consistent. Server actions
 * persist and revalidate both /account/addresses and /checkout/address.
 */
export default function AddressManager({ addresses: initial }: Props) {
  const confirm = useConfirm();
  const [addresses, setAddresses] = useState<Address[]>(initial);
  const [mode, setMode] = useState<Mode>(initial.length === 0 ? { kind: "add" } : { kind: "none" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch("/api/addresses", { cache: "no-store" });
    if (!res.ok) return;
    const rows = await res.json();
    // API returns DB-shaped rows; map to the flattened Address used here.
    setAddresses(
      (rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        user_id: String(r.userId ?? ""),
        recipient_name: String(r.recipientName ?? ""),
        phone: String(r.phone ?? ""),
        address_text: String(r.addressLine ?? ""),
        line_id: r.lineId != null ? String(r.lineId) : null,
        is_default: Boolean(r.isDefault),
        created_at: String(r.createdAt ?? ""),
      })),
    );
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await addAddress(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
    setMode({ kind: "none" });
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await updateAddress(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
    setMode({ kind: "none" });
  }

  async function onDelete(id: string) {
    if (!(await confirm({ message: "ลบที่อยู่นี้?", variant: "danger", confirmLabel: "ลบ" }))) return;
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.set("id", id);
    const res = await deleteAddress(fd);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
  }

  async function onSetDefault(id: string) {
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.set("id", id);
    const res = await setDefaultAddress(fd);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
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

      <div style={{ display: "grid", gap: 10 }}>
        {addresses.map((a) =>
          mode.kind === "edit" && mode.id === a.id ? (
            <AddressForm
              key={a.id}
              onSubmit={onEdit}
              onCancel={() => setMode({ kind: "none" })}
              busy={busy}
              initial={a}
            />
          ) : (
            <div
              key={a.id}
              style={{
                display: "flex",
                gap: 12,
                padding: 16,
                border: `1px solid ${a.is_default ? "var(--accent)" : "var(--line)"}`,
                borderRadius: 10,
                background: a.is_default ? "var(--accent-soft)" : "var(--surface)",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 200, fontSize: 14, lineHeight: 1.55 }}>
                <b>{a.recipient_name}</b> · {a.phone}
                {a.is_default ? (
                  <span style={{ color: "var(--accent-2)", fontSize: 12 }}> (ค่าเริ่มต้น)</span>
                ) : null}
                <br />
                <span style={{ color: "var(--ink-2)" }}>{a.address_text}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {!a.is_default ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={btnSm}
                    onClick={() => onSetDefault(a.id)}
                    disabled={busy}
                  >
                    ตั้งเป็นค่าเริ่มต้น
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-outline"
                  style={btnSm}
                  onClick={() => setMode({ kind: "edit", id: a.id })}
                  disabled={busy}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ ...btnSm, color: "var(--danger)" }}
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
        <AddressForm
          onSubmit={onAdd}
          onCancel={addresses.length > 0 ? () => setMode({ kind: "none" }) : undefined}
          busy={busy}
        />
      ) : mode.kind === "none" ? (
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => setMode({ kind: "add" })}
          style={{ justifySelf: "start" }}
        >
          ＋ เพิ่มที่อยู่ใหม่
        </button>
      ) : null}
    </div>
  );
}

function AddressForm({
  onSubmit,
  onCancel,
  busy,
  initial,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  busy: boolean;
  initial?: Address;
}) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        padding: 16,
        border: "1px solid var(--line)",
        borderRadius: 10,
        display: "grid",
        gap: 10,
        background: "var(--surface)",
      }}
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input
        name="recipient_name"
        placeholder="ชื่อผู้รับ"
        defaultValue={initial?.recipient_name ?? ""}
        className="input"
        required
      />
      <input
        name="phone"
        placeholder="เบอร์โทร"
        defaultValue={initial?.phone ?? ""}
        className="input"
        required
      />
      <textarea
        name="address_text"
        placeholder="ที่อยู่จัดส่ง (บ้านเลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์)"
        defaultValue={initial?.address_text ?? ""}
        className="input" style={{ minHeight: 72, resize: "vertical" }}
        required
      />
      <input
        name="line_id"
        placeholder="LINE ID (ไม่บังคับ)"
        defaultValue={initial?.line_id ?? ""}
        className="input"
      />
      {!initial ? (
        <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="is_default" /> ตั้งเป็นที่อยู่เริ่มต้น
        </label>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-dark" disabled={busy}>
          {busy ? "กำลังบันทึก…" : "บันทึกที่อยู่"}
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

const btnSm: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 12px",
};
