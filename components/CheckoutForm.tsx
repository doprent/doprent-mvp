"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBooking } from "@/app/actions/bookings";
import { addAddress, updateAddress } from "@/app/actions/addresses";
import { addBankAccount } from "@/app/actions/bank-accounts";
import { startProgress, doneProgress } from "@/lib/progress";
import { priceForNights } from "@/lib/pricing";
import type { Address, BankAccount, PriceTier } from "@/lib/types";
import { fmtThai } from "@/lib/date-th";
import type { BusinessHours } from "@/lib/hours";
import type { IdCardItem } from "@/app/actions/id-cards";
import IdCardPicker from "@/components/IdCardPicker";

type Props = {
  productId: string;
  startDate: string;
  endDate: string;
  /** Optional pickup/return time-of-day "HH:MM"; null = full day. */
  startTime?: string | null;
  endTime?: string | null;
  days: number;
  pricePerDay: number;
  priceTiers?: PriceTier[] | null;
  deposit: number;
  addresses: Address[];
  bankAccounts: BankAccount[];
  variantId?: string | null;
  /** Shipping methods chosen on the calendar page (display only here). */
  outboundMethod: "express" | "standard";
  returnMethod: "express" | "standard";
  shopHours?: BusinessHours | null;
  shopIsOpen?: boolean;
  /** ID card photos already uploaded by this user. */
  idCards?: IdCardItem[];
};

export default function CheckoutForm({
  productId,
  startDate,
  endDate,
  startTime,
  endTime,
  days,
  pricePerDay,
  priceTiers,
  deposit,
  addresses: initialAddresses,
  bankAccounts: initialBankAccounts,
  variantId,
  outboundMethod,
  returnMethod,
  shopHours,
  idCards = [],
}: Props) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [selectedId, setSelectedId] = useState<string>(
    initialAddresses.find((a) => a.is_default)?.id ?? initialAddresses[0]?.id ?? ""
  );
  const [showAdd, setShowAdd] = useState(initialAddresses.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Bank account selection (deposit refund)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(initialBankAccounts);
  const [selectedBankId, setSelectedBankId] = useState<string>(
    initialBankAccounts.find((b) => b.is_default)?.id ?? initialBankAccounts[0]?.id ?? ""
  );
  const [showAddBank, setShowAddBank] = useState(initialBankAccounts.length === 0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedIdCardPath, setSelectedIdCardPath] = useState<string>(
    idCards[0]?.path ?? ""
  );

  const { perDay: effPerDay, total: rental } = priceForNights(priceTiers ?? null, pricePerDay, days);

  async function onAddAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    startProgress();
    const fd = new FormData(e.currentTarget);
    const res = await addAddress(fd);
    doneProgress();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const newAddr: Address = {
      id: res.id,
      user_id: "",
      recipient_name: String(fd.get("recipient_name") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      address_text: String(fd.get("address_text") ?? ""),
      line_id: String(fd.get("line_id") ?? "").trim() || null,
      is_default: addresses.length === 0,
      created_at: new Date().toISOString(),
    };
    setAddresses((prev) => [...prev, newAddr]);
    setSelectedId(res.id);
    setShowAdd(false);
  }

  async function onEditAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    startProgress();
    const fd = new FormData(e.currentTarget);
    const res = await updateAddress(fd);
    doneProgress();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const id = String(fd.get("id") ?? "");
    setAddresses((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              recipient_name: String(fd.get("recipient_name") ?? ""),
              phone: String(fd.get("phone") ?? ""),
              address_text: String(fd.get("address_text") ?? ""),
              line_id: String(fd.get("line_id") ?? "").trim() || null,
            }
          : a
      )
    );
    setEditingId(null);
  }

  async function onAddBank(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    startProgress();
    const fd = new FormData(e.currentTarget);
    const res = await addBankAccount(fd);
    doneProgress();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const newBank: BankAccount = {
      id: res.id,
      user_id: "",
      label: String(fd.get("label") ?? "บัญชีหลัก"),
      bank_name: String(fd.get("bank_name") ?? ""),
      account_number: String(fd.get("account_number") ?? ""),
      account_name: String(fd.get("account_name") ?? ""),
      is_default: bankAccounts.length === 0,
      created_at: new Date().toISOString(),
    };
    setBankAccounts((prev) => [...prev, newBank]);
    setSelectedBankId(res.id);
    setShowAddBank(false);
  }

  async function onConfirm() {
    if (!selectedId) {
      setError("กรุณาเลือกที่อยู่จัดส่ง");
      return;
    }
    if (!selectedBankId) {
      setError("กรุณาเลือกบัญชีธนาคารสำหรับรับเงินมัดจำคืน");
      return;
    }
    if (!selectedIdCardPath) {
      setError("กรุณาแนบรูปถ่ายบัตรประชาชน");
      return;
    }
    setError("");
    setBusy(true);
    startProgress();
    const fd = new FormData();
    fd.set("product_id", productId);
    fd.set("address_id", selectedId);
    fd.set("bank_account_id", selectedBankId);
    fd.set("start_date", startDate);
    fd.set("end_date", endDate);
    if (startTime) fd.set("start_time", startTime);
    if (endTime) fd.set("end_time", endTime);
    if (variantId) fd.set("variant_id", variantId);
    fd.set("outbound_method", outboundMethod);
    fd.set("return_method", returnMethod);
    fd.set("id_card_path", selectedIdCardPath);
    const res = await createBooking(fd);
    if (!res.ok) {
      doneProgress();
      setBusy(false);
      setError(res.error);
      return;
    }
    router.push(`/account/bookings/${res.id}`);
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {/* Shop hours for the first rental day (pickup day) — shown only when the
          seller configured hours. */}
      {shopHours ? (() => {
        const dow = new Date(`${startDate}T00:00:00`).getDay();
        const d = shopHours[dow];
        return (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 12px",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>เวลาทำการวันรับชุด</span>
            <span style={{ color: "var(--ink)" }}>
              {fmtThai(startDate)} · {d && d.open ? `${d.from}–${d.to}` : "ปิด"}
            </span>
          </div>
        );
      })() : null}

      {/* ═══ Shipping summary (chosen on the calendar page; read-only here) ═══ */}
      <section
        style={{
          padding: "12px 14px",
          border: "1px solid var(--line)",
          borderRadius: 10,
          background: "var(--surface)",
          fontSize: 13,
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>การจัดส่ง (ขาไป)</span>
          <span style={{ color: "var(--ink)" }}>{outboundMethod === "express" ? "ส่งด่วน" : "ส่งพัสดุ"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>การส่งคืน (ขากลับ)</span>
          <span style={{ color: "var(--ink)" }}>{returnMethod === "express" ? "ส่งด่วน" : "ส่งพัสดุ"}</span>
        </div>
      </section>

      {/* ═══ 1. Address selection ═══ */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          <StepNum n={1} /> ที่อยู่จัดส่ง <Req />
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {addresses.map((a) =>
            editingId === a.id ? (
              <form
                key={a.id}
                onSubmit={onEditAddress}
                style={{
                  padding: 16,
                  border: "1px solid var(--accent)",
                  borderRadius: 10,
                  display: "grid",
                  gap: 10,
                  background: "var(--surface)",
                }}
              >
                <input type="hidden" name="id" value={a.id} />
                <div>
                  <label htmlFor={`recipient-name-${a.id}`} style={addressLabelStyle}>ชื่อผู้รับ <Req /></label>
                  <input id={`recipient-name-${a.id}`} name="recipient_name" defaultValue={a.recipient_name} placeholder="เช่น สมชาย ใจดี" className="input" required />
                </div>
                <div>
                  <label htmlFor={`phone-${a.id}`} style={addressLabelStyle}>เบอร์โทร <Req /></label>
                  <input id={`phone-${a.id}`} name="phone" type="tel" defaultValue={a.phone} placeholder="เช่น 0812345678" className="input" required />
                </div>
                <div>
                  <label htmlFor={`address-${a.id}`} style={addressLabelStyle}>ที่อยู่จัดส่ง <Req /></label>
                  <textarea
                    id={`address-${a.id}`}
                    name="address_text"
                    defaultValue={a.address_text}
                    placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์"
                    className="input" style={{ minHeight: 72, resize: "vertical" }}
                    required
                  />
                </div>
                <div>
                  <label htmlFor={`line-${a.id}`} style={addressLabelStyle}>LINE ID (ไม่บังคับ)</label>
                  <input id={`line-${a.id}`} name="line_id" defaultValue={a.line_id ?? ""} placeholder="@line_id หรือไม่ใส่ก็ได้" className="input" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-dark" disabled={busy}>
                    บันทึกการแก้ไข
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                  >
                    ยกเลิก
                  </button>
                </div>
              </form>
            ) : (
              <div key={a.id} style={{ position: "relative" }}>
                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: 14,
                    paddingRight: 48,
                    border: `1px solid ${selectedId === a.id ? "var(--accent)" : "var(--line)"}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    background: selectedId === a.id ? "var(--accent-soft)" : "var(--surface)",
                  }}
                >
                  <input
                    type="radio"
                    name="addr"
                    checked={selectedId === a.id}
                    onChange={() => setSelectedId(a.id)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                    <b>{a.recipient_name}</b> · {a.phone}
                    {a.is_default ? (
                      <span style={{ color: "var(--accent-2)", fontSize: 12 }}> (ค่าเริ่มต้น)</span>
                    ) : null}
                    <br />
                    <span style={{ color: "var(--ink-2)" }}>{a.address_text}</span>
                  </span>
                </label>
                <button
                  type="button"
                  aria-label="แก้ไขที่อยู่"
                  title="แก้ไขที่อยู่"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingId(a.id);
                    setShowAdd(false);
                  }}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: 10,
                    transform: "translateY(-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    color: "var(--ink-2)",
                    cursor: "pointer",
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
              </div>
            )
          )}
        </div>

        {showAdd ? (
          <form
            onSubmit={onAddAddress}
            style={{
              marginTop: 12,
              padding: 16,
              border: "1px solid var(--line)",
              borderRadius: 10,
              display: "grid",
              gap: 10,
              background: "var(--surface)",
            }}
          >
            <div>
              <label htmlFor="new-recipient-name" style={addressLabelStyle}>ชื่อผู้รับ <Req /></label>
              <input id="new-recipient-name" name="recipient_name" placeholder="เช่น สมชาย ใจดี" className="input" required />
            </div>
            <div>
              <label htmlFor="new-phone" style={addressLabelStyle}>เบอร์โทร <Req /></label>
              <input id="new-phone" name="phone" type="tel" placeholder="เช่น 0812345678" className="input" required />
            </div>
            <div>
              <label htmlFor="new-address" style={addressLabelStyle}>ที่อยู่จัดส่ง <Req /></label>
              <textarea
                id="new-address"
                name="address_text"
                placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์"
                className="input" style={{ minHeight: 72, resize: "vertical" }}
                required
              />
            </div>
            <div>
              <label htmlFor="new-line-id" style={addressLabelStyle}>LINE ID (ไม่บังคับ)</label>
              <input id="new-line-id" name="line_id" placeholder="@line_id หรือไม่ใส่ก็ได้" className="input" />
            </div>
            <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="is_default" /> ตั้งเป็นที่อยู่เริ่มต้น
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-dark" disabled={busy}>
                บันทึกที่อยู่
              </button>
              {addresses.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAdd(false)}
                  disabled={busy}
                >
                  ยกเลิก
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowAdd(true)}
            style={{ marginTop: 12 }}
          >
            ＋ เพิ่มที่อยู่ใหม่
          </button>
        )}
      </section>

      {/* ═══ 2. Bank account selection (deposit refund) ═══ */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          <StepNum n={2} /> บัญชีรับเงินมัดจำคืน <Req />
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 10 }}>
          เลือกบัญชีธนาคารที่ร้านจะโอนคืนมัดจำเมื่อส่งคืนชุดเรียบร้อย
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {bankAccounts.map((b) => (
            <label
              key={b.id}
              style={{
                display: "flex",
                gap: 10,
                padding: 14,
                border: `1px solid ${selectedBankId === b.id ? "var(--accent)" : "var(--line)"}`,
                borderRadius: 10,
                cursor: "pointer",
                background: selectedBankId === b.id ? "var(--accent-soft)" : "var(--surface)",
              }}
            >
              <input
                type="radio"
                name="bank"
                checked={selectedBankId === b.id}
                onChange={() => setSelectedBankId(b.id)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                <b>{b.account_name}</b> · {bankLabel(b.bank_name)}
                {b.is_default ? (
                  <span style={{ color: "var(--accent-2)", fontSize: 12 }}> (ค่าเริ่มต้น)</span>
                ) : null}
                <br />
                <span style={{ color: "var(--ink-2)" }}>{maskBankNum(b.account_number)}</span>
              </span>
            </label>
          ))}
        </div>

        {showAddBank ? (
          <form
            onSubmit={onAddBank}
            style={{
              marginTop: 12,
              padding: 16,
              border: "1px solid var(--line)",
              borderRadius: 10,
              display: "grid",
              gap: 10,
              background: "var(--surface)",
            }}
          >
            <div>
              <label htmlFor="new-bank-name" style={addressLabelStyle}>ธนาคาร <Req /></label>
              <select id="new-bank-name" name="bank_name" className="input" required defaultValue="">
                <option value="" disabled>เลือกธนาคาร</option>
                {THAI_BANKS_CHECKOUT.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-account-number" style={addressLabelStyle}>เลขบัญชี <Req /></label>
              <input
                id="new-account-number"
                name="account_number"
                placeholder="เช่น 0123456789"
                className="input"
                inputMode="numeric"
                pattern="[0-9]{10,15}"
                title="เลขบัญชี 10-15 หลัก"
                required
              />
            </div>
            <div>
              <label htmlFor="new-account-name" style={addressLabelStyle}>ชื่อบัญชี <Req /></label>
              <input id="new-account-name" name="account_name" placeholder="เช่น สมชาย ใจดี" className="input" required />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-dark" disabled={busy}>
                บันทึกบัญชี
              </button>
              {bankAccounts.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAddBank(false)}
                  disabled={busy}
                >
                  ยกเลิก
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowAddBank(true)}
            style={{ marginTop: 12 }}
          >
            ＋ เพิ่มบัญชีใหม่
          </button>
        )}
      </section>

      {/* ═══ 3. Price summary ═══ */}
      <section
        style={{
          padding: 16,
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "var(--surface)",
          fontSize: 14,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          <StepNum n={3} /> สรุปการจอง
        </h2>
        <Row label={`ค่าเช่า (฿${effPerDay.toLocaleString()} × ${days} วัน)`} value={`฿${rental.toLocaleString()}`} />
        <Row label="ค่ามัดจำ" value={`฿${deposit.toLocaleString()}`} />
        <Row label="ค่าจัดส่ง" value="รอร้านคำนวณ" muted />
        <div style={{ borderTop: "1px solid var(--line)", margin: "10px 0" }} />
        <Row label="ยอดเบื้องต้น" value={`฿${(rental + deposit).toLocaleString()}`} bold />
        <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
          วันที่ {fmtThai(startDate)}{startTime ? ` ${startTime}` : ""} ถึง {fmtThai(endDate)}{endTime ? ` ${endTime}` : ""}
          {startTime && endTime ? "" : " · ทั้งวัน"} · ร้านจะใส่ค่าจัดส่งแล้วคุณค่อยจ่ายผ่าน QR PromptPay
        </p>
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6, padding: "6px 10px", background: "var(--bg)", borderRadius: 6 }}>
          {outboundMethod === "express" ? "ขาไป: ส่งด่วน · ร้านนัดเวลารับ–ส่ง" : "ขาไป: ส่งพัสดุ · ร้านเลือกขนส่ง"}
          {" · "}
          {returnMethod === "express" ? "ขากลับ: ส่งด่วน" : "ขากลับ: ส่งพัสดุ"}
        </div>
      </section>

      {/* ═══ 4. ID card photo ═══ */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          <StepNum n={4} /> ภาพถ่ายบัตรประชาชน <Req />
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 12 }}>
          ร้านต้องการบัตรประชาชนเพื่อยืนยันตัวตนผู้เช่า
        </p>
        <IdCardPicker
          initialCards={idCards}
          inputName="id_card_path"
          onSelect={setSelectedIdCardPath}
        />
      </section>

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

      {/* Validation hints */}
      {!selectedId && (
        <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          กรุณาเลือกหรือเพิ่มที่อยู่จัดส่ง
        </div>
      )}
      {selectedId && !selectedBankId && (
        <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          กรุณาเลือกหรือเพิ่มบัญชีธนาคาร
        </div>
      )}
      {selectedId && selectedBankId && !selectedIdCardPath && (
        <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          กรุณาแนบรูปถ่ายบัตรประชาชน
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={onConfirm}
        disabled={busy || !selectedId || !selectedBankId || !selectedIdCardPath}
        style={{ padding: "14px 20px", fontSize: 15 }}
      >
        {busy ? "กำลังส่งคำขอ…" : "ยืนยันจอง"}
      </button>
    </div>
  );
}

const THAI_BANKS_CHECKOUT = [
  { value: "PROMPTPAY", label: "พร้อมเพย์ (PromptPay)" },
  { value: "KBANK", label: "กสิกรไทย (KBANK)" },
  { value: "BBL", label: "กรุงเทพ (BBL)" },
  { value: "SCB", label: "ไทยพาณิชย์ (SCB)" },
  { value: "KTB", label: "กรุงไทย (KTB)" },
  { value: "BAY", label: "กรุงศรี (BAY)" },
  { value: "TTB", label: "ทหารไทยธนชาต (TTB)" },
  { value: "GSB", label: "ออมสิน (GSB)" },
  { value: "BAAC", label: "ธ.ก.ส. (BAAC)" },
  { value: "KKP", label: "เกียรตินาคินภัทร (KKP)" },
  { value: "TISCO", label: "ทิสโก้ (TISCO)" },
  { value: "CIMB", label: "ซีไอเอ็มบี (CIMB)" },
  { value: "UOB", label: "ยูโอบี (UOB)" },
  { value: "LHBANK", label: "แลนด์ แอนด์ เฮ้าส์ (LH Bank)" },
  { value: "OTHER", label: "อื่นๆ" },
] as const;

function bankLabel(value: string): string {
  return THAI_BANKS_CHECKOUT.find((b) => b.value === value)?.label ?? value;
}

function maskBankNum(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 4) return num;
  return "xxx-x-" + digits.slice(-4);
}

const addressLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--ink-2)",
  marginBottom: 5,
};

function StepNum({ n }: { n: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "var(--accent)",
        color: "var(--accent-ink)",
        fontSize: 12,
        fontWeight: 700,
        marginRight: 8,
        verticalAlign: "middle",
      }}
    >
      {n}
    </span>
  );
}

function Req() {
  return <span style={{ color: "var(--danger)", fontWeight: 400, fontSize: 13 }}>*</span>;
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ color: muted ? "var(--ink-3)" : "var(--ink-2)" }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: muted ? "var(--ink-3)" : "var(--ink)" }}>
        {value}
      </span>
    </div>
  );
}
