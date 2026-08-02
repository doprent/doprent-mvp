"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { updateShop } from "@/app/actions/seller";
import type { Color } from "@/lib/types";
import RequiredMark from "@/components/RequiredMark";
import Labeled from "@/components/ui/Labeled";
import { prepareImageFileForUpload } from "@/lib/image";
import {
  type BusinessHours,
  WEEKDAYS_MON_FIRST,
  parseBusinessHours,
  defaultBusinessHours,
  serializeBusinessHours,
  closedWeekdaysFromHours,
  DEFAULT_FROM,
  DEFAULT_TO,
} from "@/lib/hours";

type ClosedDateRow = { date: string; note: string };

const COLORS: Array<{ key: Color; label: string }> = [
  { key: "rose", label: "กุหลาบ" },
  { key: "ivory", label: "งาช้าง" },
  { key: "green", label: "เขียว" },
  { key: "black", label: "ดำ" },
  { key: "navy", label: "กรมท่า" },
  { key: "red", label: "แดง" },
  { key: "blue", label: "ฟ้า" },
  { key: "purple", label: "ม่วง" },
];

type Props = {
  areas: Array<{ key: string; th: string }>;
  boutique: {
    id: string;
    name: string;
    area_key: string | null;
    area_label: string;
    line_url: string;
    instagram: string | null;
    facebook?: string | null;
    twitter?: string | null;
    tiktok?: string | null;
    promptpay_id?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_account_name?: string | null;
    bankbook_image_path?: string | null;
    default_payment_method?: "promptpay" | "bank" | null;
    delivery_info?: string | null;
    since_year: number | null;
    tag: string | null;
    story: string | null;
    owner_name: string | null;
    address: string | null;
    hours: string | null;
    cover_color: Color;
    logo_url?: string | null;
    // Booking policy (optional — absent = use DB defaults)
    lead_time_days?: number;
    min_rental_days?: number;
    max_rental_days?: number | null;
    return_window_days?: number;
    buffer_days_after?: number;
    buffer_days_before?: number;
    closed_weekdays?: number[];
    closed_dates?: ClosedDateRow[];
  };
};

export default function EditBoutiqueForm({ areas, boutique }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Weekly business hours — structured schedule (toggle + open/close per day).
  // Seeds from the stored JSON; legacy free-text falls back to a default schedule
  // (with existing closed weekdays preserved) and the old text is shown as a note.
  const parsedHours = parseBusinessHours(boutique.hours);
  const legacyHoursText = !parsedHours && boutique.hours?.trim() ? boutique.hours.trim() : null;
  // Never configured (null / empty, no legacy text either) → seed every day CLOSED
  // so the form honestly reflects "not set yet" instead of masquerading as open
  // 10:00–19:00. A warning banner prompts the seller to configure and save.
  const hoursUnset = !parsedHours && !legacyHoursText;
  const [hoursDays, setHoursDays] = useState<BusinessHours>(
    parsedHours ??
      (hoursUnset
        ? defaultBusinessHours([0, 1, 2, 3, 4, 5, 6])
        : defaultBusinessHours(boutique.closed_weekdays ?? [])),
  );

  function setDayOpen(idx: number, open: boolean) {
    setHoursDays((prev) => prev.map((d, i) => (i === idx ? { ...d, open } : d)));
  }
  function setDayTime(idx: number, field: "from" | "to", value: string) {
    setHoursDays((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  }
  // Open 24 hours = 00:00–23:59 (toggle back to the default window).
  function setDay24h(idx: number, on: boolean) {
    setHoursDays((prev) =>
      prev.map((d, i) =>
        i === idx
          ? on
            ? { ...d, open: true, from: "00:00", to: "23:59" }
            : { ...d, from: DEFAULT_FROM, to: DEFAULT_TO }
          : d,
      ),
    );
  }
  // Quick presets — set which weekdays are open (keeps each day's existing
  // from/to times; uses the default window for days currently with no time).
  function applyOpenDays(openIdx: number[]) {
    const open = new Set(openIdx);
    setHoursDays((prev) =>
      prev.map((d, i) => ({
        open: open.has(i),
        from: d.from || DEFAULT_FROM,
        to: d.to || DEFAULT_TO,
      })),
    );
  }
  const presetEveryDay = () => applyOpenDays([0, 1, 2, 3, 4, 5, 6]);
  const presetWeekdays = () => applyOpenDays([1, 2, 3, 4, 5]);
  const presetNone = () => applyOpenDays([]);

  // Booking policy state
  const [closedDates, setClosedDates] = useState<ClosedDateRow[]>(boutique.closed_dates ?? []);
  const [newDateInput, setNewDateInput] = useState("");
  const [newNoteInput, setNewNoteInput] = useState("");

  // Payment / bankbook state
  const [bankAccountNumber, setBankAccountNumber] = useState(boutique.bank_account_number ?? "");
  const [bankbookKey, setBankbookKey] = useState<string>(boutique.bankbook_image_path ?? "");
  const [bankbookUploading, setBankbookUploading] = useState(false);
  const [bankbookError, setBankbookError] = useState<string | null>(null);
  const [promptpayId, setPromptpayId] = useState(boutique.promptpay_id ?? "");
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<"promptpay" | "bank" | "">(
    boutique.default_payment_method ?? "",
  );
  const bankbookInputRef = useRef<HTMLInputElement>(null);

  // Shop logo (PUBLIC image — reuses the generic /api/upload endpoint).
  const [logoUrl, setLogoUrl] = useState<string>(boutique.logo_url ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoFile(file: File) {
    setLogoError(null);
    setLogoUploading(true);
    try {
      const prepared = await prepareImageFileForUpload(file);
      const fd = new FormData();
      fd.append("file", prepared);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "อัปโหลดไม่สำเร็จ");
      }
      const j = (await res.json()) as { url: string };
      setLogoUrl(j.url);
    } catch (e) {
      setLogoError((e as Error).message);
    } finally {
      setLogoUploading(false);
    }
  }

  function addClosedDate() {
    if (!newDateInput) return;
    if (closedDates.some((cd) => cd.date === newDateInput)) return;
    setClosedDates((prev) =>
      [...prev, { date: newDateInput, note: newNoteInput }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    setNewDateInput("");
    setNewNoteInput("");
  }

  function removeClosedDate(date: string) {
    setClosedDates((prev) => prev.filter((cd) => cd.date !== date));
  }

  async function handleBankbookFile(file: File) {
    setBankbookError(null);
    setBankbookUploading(true);
    try {
      const prepared = await prepareImageFileForUpload(file);
      const fd = new FormData();
      fd.append("file", prepared);
      const res = await fetch("/api/upload/bankbook", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "อัปโหลดไม่สำเร็จ");
      }
      const j = (await res.json()) as { key: string };
      setBankbookKey(j.key);
    } catch (e) {
      setBankbookError((e as Error).message);
    } finally {
      setBankbookUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const areaKey = String(fd.get("area_key") ?? "");
      const matched = areas.find((a) => a.key === areaKey);
      if (matched) fd.set("area_label", `${matched.key} · ${matched.th}`);

      // Business hours → JSON in `hours`; closed weekdays derive from the schedule
      // (the "ปิด" toggle is the single source of truth, synced to booking logic).
      fd.set("hours", serializeBusinessHours(hoursDays));
      fd.set("closed_weekdays", JSON.stringify(closedWeekdaysFromHours(hoursDays)));
      fd.set("closed_dates", JSON.stringify(closedDates));

      // Ensure latest bankbook key is in FormData
      fd.set("bankbook_image_path", bankbookKey);

      // HARD-BLOCK: bank account number filled but no bankbook attached
      const acctNum = String(fd.get("bank_account_number") ?? "").trim();
      if (acctNum && !bankbookKey) {
        setError("กรุณาแนบรูปหน้าสมุดบัญชีเพื่อยืนยันเลขบัญชี");
        setSubmitting(false);
        return;
      }

      const res = await updateShop(boutique.id, fd);
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        setSubmitting(false);
        return;
      }
      setSaved(true);
      setSubmitting(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  // Soft warning: no payment channel at all
  const noPaymentChannel = !promptpayId.trim() && !bankAccountNumber.trim();

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Labeled label="ชื่อร้าน" required>
        <input type="text" name="name" defaultValue={boutique.name} required aria-required={true} className="input input-surface" />
      </Labeled>
      <Labeled label="ผู้ดูแล">
        <input type="text" name="owner_name" defaultValue={boutique.owner_name ?? ""} className="input input-surface" />
      </Labeled>
      <Labeled label="ย่าน">
        <select name="area_key" defaultValue={boutique.area_key ?? ""} className="input input-surface">
          <option value="">— เลือกย่าน —</option>
          {areas.map((a) => (
            <option key={a.key} value={a.key}>
              {a.th} ({a.key})
            </option>
          ))}
        </select>
        <input type="hidden" name="area_label" defaultValue={boutique.area_label} />
      </Labeled>
      <Labeled label="LINE" required>
        <input type="text" name="line_url" defaultValue={boutique.line_url} required aria-required={true} className="input input-surface" />
      </Labeled>
      <Labeled label="Instagram">
        <input type="text" name="instagram" defaultValue={boutique.instagram ?? ""} className="input input-surface" />
      </Labeled>
      <Labeled label="Facebook">
        <input type="text" name="facebook" defaultValue={boutique.facebook ?? ""} placeholder="facebook.com/..." className="input input-surface" />
      </Labeled>
      <Labeled label="X / Twitter">
        <input type="text" name="twitter" defaultValue={boutique.twitter ?? ""} placeholder="@..." className="input input-surface" />
      </Labeled>
      <Labeled label="TikTok">
        <input type="text" name="tiktok" defaultValue={boutique.tiktok ?? ""} placeholder="@..." className="input input-surface" />
      </Labeled>

      <Labeled label="ที่อยู่ร้าน">
        <input type="text" name="address" defaultValue={boutique.address ?? ""} className="input input-surface" />
      </Labeled>
      <div id="hours" style={{ scrollMarginTop: 80 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          วันและเวลาทำการ
        </label>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10, lineHeight: 1.5 }}>
          เปิด/ปิดแต่ละวัน แล้วกำหนดเวลาเปิด–ปิด — วันที่ปิดจะไม่รับจองอัตโนมัติ
        </div>

        {legacyHoursText ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            ข้อมูลเดิม: “{legacyHoursText}” — ตั้งเวลาใหม่ด้านล่างแล้วกดบันทึกเพื่ออัปเดต
          </div>
        ) : null}

        {hoursUnset ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--warn-ink, #92400e)",
              background: "var(--warn-soft, #fef3c7)",
              border: "1px solid var(--warn-line, #fde68a)",
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            ยังไม่ได้ตั้งเวลาทำการ — ทุกวันถูกตั้งเป็น “ปิด” ไว้ก่อน กรุณาเปิดวันที่ให้บริการแล้วกำหนดเวลา จากนั้นกดบันทึก เพื่อให้ลูกค้าเห็นเวลาเปิด–ปิด และเปิดรับส่งด่วนภายในวันได้
          </div>
        ) : null}

        {/* Hidden field carries the serialized schedule (set in onSubmit too). */}
        <input type="hidden" name="hours" value={serializeBusinessHours(hoursDays)} readOnly />

        {/* Quick presets — one tap to set common weekly patterns. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" onClick={presetEveryDay} className="btn btn-outline" style={{ fontSize: 13, padding: "6px 12px" }}>
            เปิดทุกวัน
          </button>
          <button type="button" onClick={presetWeekdays} className="btn btn-outline" style={{ fontSize: 13, padding: "6px 12px" }}>
            จันทร์–ศุกร์
          </button>
          <button type="button" onClick={presetNone} className="btn btn-outline" style={{ fontSize: 13, padding: "6px 12px" }}>
            ปิดทุกวัน
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WEEKDAYS_MON_FIRST.map(({ idx, th }) => {
            const day = hoursDays[idx];
            const open = day?.open ?? false;
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "8px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: open ? "var(--surface)" : "var(--bg)",
                }}
              >
                {/* Toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={open}
                  aria-label={`${th} ${open ? "เปิด" : "ปิด"}`}
                  onClick={() => setDayOpen(idx, !open)}
                  style={{
                    position: "relative",
                    width: 42,
                    height: 24,
                    borderRadius: 999,
                    border: 0,
                    cursor: "pointer",
                    flexShrink: 0,
                    background: open ? "var(--primary, #2e9c65)" : "var(--line)",
                    transition: "background .15s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: open ? 20 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--on-dark)",
                      transition: "left .15s",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                    }}
                  />
                </button>

                <span style={{ width: 72, fontSize: 14, fontWeight: 500, flexShrink: 0 }}>{th}</span>

                {open ? (
                  (() => {
                    const is24 = day.from === "00:00" && day.to === "23:59";
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {is24 ? (
                          <span style={{ fontSize: 13, color: "var(--ink-2)", padding: "7px 0" }}>เปิด 24 ชั่วโมง</span>
                        ) : (
                          <>
                            <input
                              type="time"
                              value={day.from}
                              onChange={(e) => setDayTime(idx, "from", e.target.value)}
                              className="input input-surface" style={{ width: 120, padding: "7px 10px" }}
                            />
                            <span style={{ color: "var(--ink-3)" }}>–</span>
                            <input
                              type="time"
                              value={day.to}
                              onChange={(e) => setDayTime(idx, "to", e.target.value)}
                              className="input input-surface" style={{ width: 120, padding: "7px 10px" }}
                            />
                          </>
                        )}
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)", cursor: "pointer", userSelect: "none" }}>
                          <input
                            type="checkbox"
                            checked={is24}
                            onChange={(e) => setDay24h(idx, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: "pointer" }}
                          />
                          24 ชั่วโมง
                        </label>
                      </div>
                    );
                  })()
                ) : (
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>ปิด</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Labeled label="ปีที่เปิดบริการ">
        <input
          type="number"
          name="since_year"
          defaultValue={boutique.since_year ?? ""}
          min={1980}
          max={new Date().getFullYear()}
          className="input input-surface" style={{ width: 140 }}
        />
      </Labeled>
      <Labeled label="Tagline">
        <input type="text" name="tag" defaultValue={boutique.tag ?? ""} maxLength={80} className="input input-surface" />
      </Labeled>
      <Labeled label="เกี่ยวกับร้าน">
        <textarea
          name="story"
          defaultValue={boutique.story ?? ""}
          rows={4}
          maxLength={500}
          className="input input-surface" style={{ resize: "vertical" }}
        />
      </Labeled>
      <Labeled label="สีหลักของร้าน">
        <select name="cover_color" defaultValue={boutique.cover_color} className="input input-surface">
          {COLORS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Labeled>

      {/* Shop logo — public image shown on the shop card / shop page.
          Falls back to the gradient cover color when not uploaded. */}
      <div>
        <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          โลโก้ร้าน
        </label>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8, lineHeight: 1.5 }}>
          แสดงบนการ์ดร้านในหน้ารวมร้าน — ถ้าไม่อัปโหลด จะใช้พื้นสีหลักของร้านแทน (รองรับ JPG / PNG / WebP ไม่เกิน 2MB)
        </div>

        {/* Hidden field carries the uploaded URL into the form submission. */}
        <input type="hidden" name="logo_url" value={logoUrl} readOnly />

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="โลโก้ร้าน"
              style={{
                width: 64,
                height: 64,
                objectFit: "contain",
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--surface)",
                padding: 4,
              }}
            />
          ) : null}

          <label
            style={{
              display: "inline-block",
              padding: "9px 14px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: 13,
              background: "var(--surface)",
              cursor: logoUploading ? "wait" : "pointer",
              color: "var(--ink)",
            }}
          >
            {logoUploading ? "กำลังอัปโหลด…" : logoUrl ? "เปลี่ยนโลโก้" : "เลือกรูปโลโก้"}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              disabled={logoUploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await handleLogoFile(f);
              }}
            />
          </label>

          {logoUrl ? (
            <button
              type="button"
              onClick={() => {
                setLogoUrl("");
                if (logoInputRef.current) logoInputRef.current.value = "";
              }}
              style={{
                border: 0,
                background: "none",
                color: "var(--ink-3)",
                cursor: "pointer",
                fontSize: 12,
                textDecoration: "underline",
              }}
            >
              ลบโลโก้
            </button>
          ) : null}
        </div>

        {logoError ? (
          <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{logoError}</div>
        ) : null}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* ช่องทางรับชำระเงิน                              */}
      {/* ═══════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>ช่องทางรับชำระเงิน</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "var(--danger-soft, #FEF2F2)",
            border: "1px solid var(--danger, #DC2626)",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }} aria-hidden>⚠️</span>
          <div style={{ fontSize: 13.5, color: "var(--danger, #DC2626)", fontWeight: 700, lineHeight: 1.5 }}>
            ต้องมีอย่างน้อย 1 ช่องทาง (PromptPay หรือบัญชีธนาคาร) จึงจะลงขายสินค้าได้
          </div>
        </div>

        {/* Soft warning when no channel */}
        {noPaymentChannel && (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--warn-soft)",
              border: "1px solid var(--warn)",
              borderRadius: 6,
              fontSize: 13,
              color: "var(--warn-ink)",
              marginBottom: 14,
            }}
          >
            ⚠️ ยังไม่มีช่องทางรับชำระเงิน — ต้องเพิ่มก่อนจึงจะลงขายสินค้าได้
          </div>
        )}

        <Labeled label="PromptPay (เบอร์มือถือ / เลขบัตร ปชช.) — สำหรับรับเงินจองผ่าน QR">
          <input
            type="text"
            name="promptpay_id"
            value={promptpayId}
            onChange={(e) => setPromptpayId(e.target.value)}
            placeholder="เช่น 0812345678"
            className="input input-surface"
          />
        </Labeled>
        {/* Bold PromptPay remark */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            marginTop: 6,
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          ชื่อบัญชี PromptPay ต้องตรงกับชื่อในบัตรประชาชน/เอกสารนิติบุคคลที่ใช้ยืนยันร้าน (KYC)
        </div>

        <Labeled label="ธนาคาร (ไม่บังคับ)">
          <select name="bank_name" defaultValue={boutique.bank_name ?? ""} className="input input-surface">
            <option value="">— ไม่ระบุ —</option>
            <option value="ธ.กสิกรไทย">ธ.กสิกรไทย</option>
            <option value="ธ.ไทยพาณิชย์">ธ.ไทยพาณิชย์</option>
            <option value="ธ.กรุงเทพ">ธ.กรุงเทพ</option>
            <option value="ธ.กรุงไทย">ธ.กรุงไทย</option>
            <option value="ธ.กรุงศรีอยุธยา">ธ.กรุงศรีอยุธยา</option>
            <option value="ธ.ทหารไทยธนชาต">ธ.ทหารไทยธนชาต</option>
            <option value="ธ.ออมสิน">ธ.ออมสิน</option>
            <option value="อื่นๆ">อื่นๆ</option>
          </select>
        </Labeled>
        <div style={{ marginTop: 14 }}>
          <Labeled label="เลขบัญชี (ไม่บังคับ)">
            <input
              type="text"
              name="bank_account_number"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              inputMode="numeric"
              maxLength={20}
              placeholder="เช่น 123-4-56789-0"
              className="input input-surface"
            />
          </Labeled>
        </div>
        <div style={{ marginTop: 14 }}>
          <Labeled label="ชื่อบัญชี (ไม่บังคับ)">
            <input
              type="text"
              name="bank_account_name"
              defaultValue={boutique.bank_account_name ?? ""}
              maxLength={100}
              placeholder="เช่น นางสาว วรรณิษา ใจดี"
              className="input input-surface"
            />
          </Labeled>
        </div>

        {/* Bankbook upload (always shown; required when account number is present) */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
            รูปหน้าสมุดบัญชี{bankAccountNumber.trim() ? <RequiredMark /> : " (ไม่บังคับ)"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8, lineHeight: 1.5 }}>
            จำเป็นต้องแนบเมื่อระบุเลขบัญชี — เก็บเป็นความลับ ผู้ดูแลระบบเท่านั้นที่เห็นได้
          </div>

          {/* Hidden input carries the key */}
          <input type="hidden" name="bankbook_image_path" value={bankbookKey} readOnly />

          {bankbookKey ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "var(--success-soft, #F0FDF4)",
                border: "1px solid var(--success, #22C55E)",
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <span style={{ color: "var(--success, #16A34A)", fontWeight: 600 }}>✓ แนบแล้ว</span>
              <button
                type="button"
                style={{
                  marginLeft: "auto",
                  border: 0,
                  background: "none",
                  color: "var(--ink-3)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "2px 6px",
                  borderRadius: 4,
                  textDecoration: "underline",
                }}
                onClick={() => {
                  setBankbookKey("");
                  if (bankbookInputRef.current) bankbookInputRef.current.value = "";
                }}
              >
                เปลี่ยนรูป
              </button>
            </div>
          ) : null}

          <label
            style={{
              display: "inline-block",
              padding: "9px 14px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: 13,
              background: "var(--surface)",
              cursor: bankbookUploading ? "wait" : "pointer",
              color: "var(--ink)",
            }}
          >
            {bankbookUploading ? "กำลังอัปโหลด…" : bankbookKey ? "เปลี่ยนรูปสมุดบัญชี" : "เลือกรูปสมุดบัญชี"}
            <input
              ref={bankbookInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              disabled={bankbookUploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await handleBankbookFile(f);
              }}
            />
          </label>

          {bankbookError ? (
            <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{bankbookError}</div>
          ) : null}
        </div>

        {/* Default channel — only relevant when BOTH channels are configured.
            Carried in a hidden input so the server only stores it when both
            channels exist (else it's left blank → null). */}
        {promptpayId.trim() && bankAccountNumber.trim() ? (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>ช่องทางรับเงินเริ่มต้น</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10, lineHeight: 1.5 }}>
              คุณกรอกทั้งสองช่องทาง เลือกว่าจะใช้อันไหนเป็นค่าเริ่มต้นตอนยอมรับการจอง
              (ยังเปลี่ยนเป็นรายครั้งได้ตอนรับจอง)
            </div>
            <input type="hidden" name="default_payment_method" value={defaultPaymentMethod} />
            <div style={{ display: "grid", gap: 8 }}>
              {([
                { v: "promptpay", label: "PromptPay", detail: promptpayId.trim() },
                {
                  v: "bank",
                  label: "โอนเข้าบัญชีธนาคาร",
                  detail: [boutique.bank_name, bankAccountNumber.trim()].filter((s) => s && String(s).trim()).join(" · "),
                },
              ] as const).map((o) => {
                const active = defaultPaymentMethod === o.v;
                return (
                  <label
                    key={o.v}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "10px 12px",
                      border: `1.5px solid ${active ? "var(--primary, #2e9c65)" : "var(--line)"}`,
                      borderRadius: 9,
                      cursor: "pointer",
                      background: active ? "var(--success-soft, rgba(46,156,101,0.07))" : "var(--bg)",
                    }}
                  >
                    <input
                      type="radio"
                      name="default_payment_method_radio"
                      checked={active}
                      onChange={() => setDefaultPaymentMethod(o.v)}
                      style={{ marginTop: 2, accentColor: "var(--primary, #2e9c65)" }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{o.label}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginTop: 2, wordBreak: "break-word" }}>
                        {o.detail || "—"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* เงื่อนไขการจองเช่า                              */}
      {/* ═══════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>เงื่อนไขการจองเช่า</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
          กำหนดข้อจำกัดที่ใช้กับสินค้าทุกชิ้นในร้านโดยค่าเริ่มต้น (แต่ละสินค้าสามารถ override ได้)
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <Labeled label="จองล่วงหน้า (วัน)">
            <input
              type="number"
              name="lead_time_days"
              min={0}
              defaultValue={boutique.lead_time_days ?? 0}
              className="input input-surface"
            />
          </Labeled>
          <Labeled label="เช่าขั้นต่ำ (วัน)">
            <input
              type="number"
              name="min_rental_days"
              min={1}
              defaultValue={boutique.min_rental_days ?? 1}
              className="input input-surface"
            />
          </Labeled>
          <Labeled label="เช่าสูงสุด (วัน)">
            <input
              type="number"
              name="max_rental_days"
              min={1}
              defaultValue={boutique.max_rental_days ?? ""}
              placeholder="ไม่จำกัด"
              className="input input-surface"
            />
          </Labeled>
          <Labeled label="คืนสินค้าภายใน (วัน)">
            <input
              type="number"
              name="return_window_days"
              min={0}
              defaultValue={boutique.return_window_days ?? 2}
              className="input input-surface"
            />
          </Labeled>
          <Labeled label="ขนส่งก่อนเช่า (วัน)">
            <input
              type="number"
              name="buffer_days_before"
              min={0}
              defaultValue={boutique.buffer_days_before ?? 0}
              className="input input-surface"
            />
          </Labeled>
          <Labeled label="ขนส่งหลังเช่า (วัน)">
            <input
              type="number"
              name="buffer_days_after"
              min={0}
              defaultValue={boutique.buffer_days_after ?? 1}
              className="input input-surface"
            />
          </Labeled>
        </div>

        {/* วันปิดประจำสัปดาห์ย้ายไปคุมที่ "วันและเวลาทำการ" ด้านบนแล้ว
            (toggle ปิดวันไหน = บล็อกการจองวันนั้นโดยอัตโนมัติ) */}
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
          วันปิดประจำสัปดาห์กำหนดได้ที่หัวข้อ “วันและเวลาทำการ” ด้านบน — วันที่ปิดจะไม่รับจองอัตโนมัติ
        </div>

        {/* Closed specific dates */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>วันหยุดพิเศษ / วันปิดร้านแบบระบุวัน</div>
          {closedDates.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {closedDates.map((cd) => (
                <div
                  key={cd.date}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 500, minWidth: 100 }}>{cd.date}</span>
                  {cd.note ? <span style={{ color: "var(--ink-3)" }}>{cd.note}</span> : null}
                  <button
                    type="button"
                    onClick={() => removeClosedDate(cd.date)}
                    style={{ marginLeft: "auto", border: 0, background: "none", color: "var(--ink-3)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                    aria-label="ลบวัน"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 10 }}>ยังไม่มีวันหยุดพิเศษ</div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              type="date"
              value={newDateInput}
              onChange={(e) => setNewDateInput(e.target.value)}
              className="input input-surface" style={{ width: 160 }}
            />
            <input
              type="text"
              value={newNoteInput}
              onChange={(e) => setNewNoteInput(e.target.value)}
              placeholder="หมายเหตุ เช่น วันสงกรานต์"
              className="input input-surface" style={{ flex: 1, minWidth: 160 }}
            />
            <button
              type="button"
              onClick={addClosedDate}
              className="btn btn-outline"
              style={{ padding: "10px 14px", fontSize: 13, whiteSpace: "nowrap" }}
            >
              + เพิ่มวัน
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            background: "var(--danger-soft)",
            border: "1px solid var(--danger)",
            borderRadius: 6,
            color: "var(--danger)",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}
      {saved ? (
        <div
          style={{
            padding: 12,
            background: "var(--success-soft)",
            border: "1px solid var(--success)",
            borderRadius: 6,
            color: "var(--success)",
            fontSize: 14,
          }}
        >
          ✓ บันทึกเรียบร้อย
        </div>
      ) : null}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "12px 0",
          marginTop: 6,
          background: "var(--bg)",
          borderTop: "1px solid var(--line)",
        }}
      >
        <button type="submit" className="btn btn-dark" disabled={submitting} style={{ padding: "12px 22px" }}>
          {submitting ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => router.push("/sell/dashboard")}
          style={{ padding: "12px 22px" }}
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}


