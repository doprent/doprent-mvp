"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProduct, updateProduct } from "@/app/actions/seller";
import { requestTag } from "@/app/actions/seller-tags";
import type { BoundTagGroup } from "@/lib/tag-groups";
import { type Size, SIZES, sizeLabel } from "@/lib/types";
import { type TierEntry } from "@/lib/pricing-tiers";
import { prepareImageFileForUpload } from "@/lib/image";
import RequiredMark from "@/components/RequiredMark";
import ToggleSwitch from "@/components/ToggleSwitch";
import Labeled from "@/components/ui/Labeled";
import TierEditor from "@/app/sell/(authed)/products/TierEditor";

/** ตัวเลือกประเภทสินค้า */
type ProductTypeOption = { id: string; key: string; label: string };
/** กลุ่มแท็กสำหรับ dropdown ขอเพิ่มแท็ก */
type TagGroupOption = { id: string; key: string; label: string };
/** คำขอเพิ่มแท็กของร้านนี้ */
type ShopTagRequest = {
  id: string;
  requestedLabel: string;
  requestedKey: string | null;
  status: string;
  reviewNotes: string | null;
  tagGroup: { label: string; key: string };
};

// Canonical size list (XXXS … 4XL, Free size) lives in lib/types — shared with
// the browse filter so the form offers exactly the sizes a shopper can filter by.

type VariantRow = {
  size: Size;
  quantity: number;
  available: boolean;
  bustCm: number | null;
  waistCm: number | null;
  lengthCm: number | null;
};

type InitialData = {
  name: string;
  designer: string | null;
  size: Size; // back-compat legacy
  color?: string | null;
  price_per_day: number; // back-compat
  deposit: number;
  description: string | null;
  line_url: string;
  images: string[];
  available: boolean;
  selectedByGroup?: Record<string, string[]>;
  policy_override?: boolean;
  lead_time_days?: number | null;
  min_rental_days?: number | null;
  max_rental_days?: number | null;
  return_window_days?: number | null;
  buffer_days_after?: number | null;
  // NEW:
  price_mode?: "shared" | "per_size";
  shared_tiers?: TierEntry[];
  per_size_tiers?: { size: Size; tiers: TierEntry[] }[];
  variants?: VariantRow[];
};

type Props =
  | {
      mode: "create";
      shopId: string;
      defaultLineUrl: string;
      productTypeId: string;
      tagGroupSections: BoundTagGroup[];
      tagGroups: TagGroupOption[];
      shopTagRequests: ShopTagRequest[];
      /** All active product types — enables the type selector (create-only). */
      productTypes?: ProductTypeOption[];
      /** Tag-group sections keyed by productTypeId (create-only, multi-type form). */
      tagGroupSectionsByType?: Record<string, BoundTagGroup[]>;
    }
  | {
      mode: "edit";
      productId: string;
      shopId: string;
      defaultLineUrl: string;
      productTypeId: string;
      tagGroupSections: BoundTagGroup[];
      tagGroups: TagGroupOption[];
      shopTagRequests: ShopTagRequest[];
      initial: InitialData;
    };

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "18px 18px 22px",
  marginBottom: 18,
};

const cardHeadStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--ink)",
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500,
  color: "var(--ink-2)", marginBottom: 6,
};


export default function ProductForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const initial = isEdit ? props.initial : null;

  // ── Product type selection (create mode only) ─────────────────────────────
  const [selectedTypeId, setSelectedTypeId] = useState(props.productTypeId);

  /** Active tag-group sections: multi-type map (create) or single-type list (edit/legacy). */
  const activeSections: BoundTagGroup[] =
    !isEdit && props.mode === "create" && props.tagGroupSectionsByType
      ? (props.tagGroupSectionsByType[selectedTypeId] ?? props.tagGroupSections)
      : props.tagGroupSections;

  function handleTypeChange(newTypeId: string) {
    const newSections: BoundTagGroup[] =
      props.mode === "create" && props.tagGroupSectionsByType
        ? (props.tagGroupSectionsByType[newTypeId] ?? [])
        : [];
    const newGroupKeys = new Set(newSections.map((g) => g.groupKey));
    // Clear tag selections that don't belong to the new type's groups
    setSelectedByGroup((curr) => {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(curr)) {
        if (newGroupKeys.has(k)) next[k] = v;
      }
      return next;
    });
    setSelectedTypeId(newTypeId);
  }

  // ── Basic fields ─────────────────────────────────────────────────────────
  const [name, setName] = useState(initial?.name ?? "");
  const [designer, setDesigner] = useState(initial?.designer ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [lineUrl, setLineUrl] = useState(initial?.line_url ?? props.defaultLineUrl);
  const [deposit, setDeposit] = useState(initial?.deposit ?? 3000);
  const [available, setAvailable] = useState(initial?.available ?? true);

  // ── Price mode ───────────────────────────────────────────────────────────
  const [priceMode, setPriceMode] = useState<"shared" | "per_size">(
    initial?.price_mode ?? "shared"
  );

  const defaultSharedTiers: TierEntry[] = initial?.shared_tiers?.length
    ? initial.shared_tiers
    : [{ minDays: 1, pricePerDay: initial?.price_per_day ?? 500 }];
  const [sharedTiers, setSharedTiers] = useState<TierEntry[]>(defaultSharedTiers);

  const buildInitialPerSizeTiers = (): Record<string, TierEntry[]> => {
    const result: Record<string, TierEntry[]> = {};
    if (initial?.per_size_tiers) {
      for (const ps of initial.per_size_tiers) {
        result[ps.size] = ps.tiers;
      }
    }
    return result;
  };
  const [perSizeTiers, setPerSizeTiers] = useState<Record<string, TierEntry[]>>(
    buildInitialPerSizeTiers()
  );

  // ── Variant rows ─────────────────────────────────────────────────────────
  const defaultVariantRows: VariantRow[] = initial?.variants?.length
    ? initial.variants
    : [{ size: (initial?.size ?? "M") as Size, quantity: 1, available: true, bustCm: null, waistCm: null, lengthCm: null }];
  const [variantRows, setVariantRows] = useState<VariantRow[]>(defaultVariantRows);
  const [showMeasurements, setShowMeasurements] = useState<Record<number, boolean>>({});

  const addVariantRow = () => {
    const usedSizes = new Set(variantRows.map((r) => r.size));
    const nextSize = SIZES.find((s) => !usedSizes.has(s));
    if (!nextSize) return;
    setVariantRows((prev) => [
      ...prev,
      { size: nextSize, quantity: 1, available: true, bustCm: null, waistCm: null, lengthCm: null },
    ]);
    // Initialize per-size tiers for new row
    if (priceMode === "per_size") {
      setPerSizeTiers((prev) => ({
        ...prev,
        [nextSize]: prev[nextSize] ?? [...sharedTiers],
      }));
    }
  };

  const removeVariantRow = (i: number) => {
    if (variantRows.length <= 1) return;
    setVariantRows((prev) => prev.filter((_, idx) => idx !== i));
    setShowMeasurements((prev) => {
      const next: Record<number, boolean> = {};
      for (const k of Object.keys(prev)) {
        const ki = parseInt(k, 10);
        if (ki < i) next[ki] = prev[ki];
        else if (ki > i) next[ki - 1] = prev[ki];
      }
      return next;
    });
  };

  const updateVariantRow = (i: number, patch: Partial<VariantRow>) =>
    setVariantRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // ── Images ───────────────────────────────────────────────────────────────
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  // ── Tag state ─────────────────────────────────────────────────────────────
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>(
    initial?.selectedByGroup ?? {},
  );

  // ── Policy override ──────────────────────────────────────────────────────
  const [policyOverride, setPolicyOverride] = useState<boolean>(initial?.policy_override ?? false);
  const [overrideLeadTime, setOverrideLeadTime] = useState<string>(
    initial?.lead_time_days != null ? String(initial.lead_time_days) : "",
  );
  const [overrideMinRental, setOverrideMinRental] = useState<string>(
    initial?.min_rental_days != null ? String(initial.min_rental_days) : "",
  );
  const [overrideMaxRental, setOverrideMaxRental] = useState<string>(
    initial?.max_rental_days != null ? String(initial.max_rental_days) : "",
  );
  const [overrideReturnWindow, setOverrideReturnWindow] = useState<string>(
    initial?.return_window_days != null ? String(initial.return_window_days) : "",
  );
  const [overrideBuffer, setOverrideBuffer] = useState<string>(
    initial?.buffer_days_after != null ? String(initial.buffer_days_after) : "",
  );

  // ── UI toggles ────────────────────────────────────────────────────────────
  const [showDetails, setShowDetails] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Tag request state ─────────────────────────────────────────────────────
  const [showTagRequest, setShowTagRequest] = useState(false);
  const [tagReqGroupId, setTagReqGroupId] = useState(props.tagGroups[0]?.id ?? "");
  const [tagReqLabel, setTagReqLabel] = useState("");
  const [tagReqKey, setTagReqKey] = useState("");
  const [tagReqSubmitting, setTagReqSubmitting] = useState(false);
  const [tagReqError, setTagReqError] = useState<string | null>(null);
  const [tagReqSuccess, setTagReqSuccess] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Bound group ids (derived from activeSections) ────────────────────────
  const boundGroupIds = new Set(activeSections.map((g) => g.groupId));
  const boundTagGroups = props.tagGroups.filter((g) => boundGroupIds.has(g.id));
  const tagReqGroupOptions = boundTagGroups.length > 0 ? boundTagGroups : props.tagGroups;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toggleTag(groupKey: string, tagKey: string, mode: "single" | "multi") {
    setSelectedByGroup((curr) => {
      const cur = curr[groupKey] ?? [];
      if (mode === "single") {
        return { ...curr, [groupKey]: cur.includes(tagKey) ? [] : [tagKey] };
      }
      return {
        ...curr,
        [groupKey]: cur.includes(tagKey)
          ? cur.filter((k) => k !== tagKey)
          : [...cur, tagKey],
      };
    });
  }

  function addUrlImage() {
    const urls = urlInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//.test(s));
    if (urls.length === 0) {
      setError("ใส่ URL รูปที่ขึ้นต้นด้วย http:// หรือ https://");
      return;
    }
    setImages((curr) => [...curr, ...urls]);
    setUrlInput("");
    setShowUrlInput(false);
    setError(null);
  }

  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const uploads: string[] = [];
    setUploadingCount(files.length);
    try {
      for (let i = 0; i < files.length; i++) {
        // Downscale + re-encode (WebP/JPEG, <=1920px, <=2MB) in the browser
        // before upload so large phone photos don't blow the 2MB server limit.
        const prepared = await prepareImageFileForUpload(files[i]);
        const fd = new FormData();
        fd.append("file", prepared);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          setError("อัปโหลดรูปไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง");
          break;
        }
        const json = await res.json();
        uploads.push(json.urls?.large ?? json.url ?? "");
      }
      setImages((curr) => [...curr, ...uploads.filter(Boolean)]);
    } catch (err) {
      // Surface the Thai 2MB / unreadable-image error thrown by prepareImageFileForUpload.
      setError((err as Error).message || "อัปโหลดรูปไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง");
    } finally {
      setUploadingCount(0);
    }
  }

  async function onTagRequest() {
    setTagReqError(null);
    setTagReqSuccess(null);
    if (!tagReqLabel.trim()) { setTagReqError("กรุณาระบุชื่อแท็ก"); return; }
    if (!tagReqGroupId) { setTagReqError("กรุณาเลือกกลุ่มแท็ก"); return; }
    setTagReqSubmitting(true);
    try {
      const res = await requestTag({
        shopId: props.shopId,
        tagGroupId: tagReqGroupId,
        requestedLabel: tagReqLabel.trim(),
        requestedKey: tagReqKey.trim() || undefined,
      });
      if (!res.ok) {
        setTagReqError(res.error ?? "ส่งคำขอไม่สำเร็จ");
      } else {
        setTagReqSuccess("ส่งคำขอแล้ว รอแอดมินอนุมัติ");
        setTagReqLabel("");
        setTagReqKey("");
        setShowTagRequest(false);
      }
    } catch (e) {
      setTagReqError((e as Error).message);
    } finally {
      setTagReqSubmitting(false);
    }
  }

  // ── Client-side tier validation ───────────────────────────────────────────
  function validateTierEntries(tiers: TierEntry[], label?: string): string | null {
    if (!tiers.length) return `${label ? label + ': ' : ''}ต้องมีอย่างน้อย 1 ช่วงราคา`;
    if (!tiers.some((t) => t.minDays === 1)) return `${label ? label + ': ' : ''}ต้องมีช่วงเริ่มต้นที่ 1 วัน`;
    for (const t of tiers) {
      if (!Number.isInteger(t.minDays) || t.minDays < 1) return `${label ? label + ': ' : ''}จำนวนวันต้องเป็นจำนวนเต็ม >= 1`;
      if (t.pricePerDay < 0) return `${label ? label + ': ' : ''}ราคาต้องไม่ติดลบ`;
    }
    const mins = tiers.map((t) => t.minDays);
    if (new Set(mins).size !== mins.length) return `${label ? label + ': ' : ''}จำนวนวัน (minDays) ซ้ำกัน`;
    return null;
  }

  // ── Form submission ───────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Validate required tag groups (use active sections for the selected type)
    for (const g of activeSections) {
      if (g.isRequired) {
        const sel = selectedByGroup[g.groupKey] ?? [];
        if (sel.length === 0) {
          setError(`กรุณาเลือก "${g.groupLabel}" อย่างน้อย 1 รายการ`);
          setSubmitting(false);
          return;
        }
      }
    }

    // Validate variant rows
    if (variantRows.length === 0) {
      setError("กรุณาเพิ่มไซซ์อย่างน้อย 1 ไซซ์");
      setSubmitting(false);
      return;
    }
    for (const vr of variantRows) {
      if (vr.quantity < 1) {
        setError(`จำนวนสต็อกของไซซ์ ${sizeLabel(vr.size)} ต้องอย่างน้อย 1`);
        setSubmitting(false);
        return;
      }
    }

    // Validate price tiers
    if (priceMode === "shared") {
      const tierErr = validateTierEntries(sharedTiers);
      if (tierErr) { setError(tierErr); setSubmitting(false); return; }
    } else {
      for (const vr of variantRows) {
        const tiers = perSizeTiers[vr.size] ?? sharedTiers;
        const tierErr = validateTierEntries(tiers, `ไซซ์ ${sizeLabel(vr.size)}`);
        if (tierErr) { setError(tierErr); setSubmitting(false); return; }
      }
    }

    const fd = new FormData();
    // In create mode, pass the selected product type ID so createProduct knows which type to use
    if (!isEdit) {
      fd.set("productTypeId", selectedTypeId);
    }
    fd.set("shop_id", props.shopId);
    fd.set("name", name);
    fd.set("designer", designer);
    fd.set("size", variantRows[0]?.size ?? "M"); // back-compat
    fd.set("variants", JSON.stringify(variantRows.map((r) => ({
      size: r.size,
      quantity: r.quantity,
      available: r.available,
      bustCm: r.bustCm,
      waistCm: r.waistCm,
      lengthCm: r.lengthCm,
    }))));
    fd.set("deposit", String(deposit));
    fd.set("price_mode", priceMode);
    if (priceMode === "shared") {
      fd.set("price_tiers", JSON.stringify(sharedTiers));
    } else {
      const perSizeData = variantRows.map((row) => ({
        size: row.size,
        tiers: perSizeTiers[row.size] ?? sharedTiers,
      }));
      fd.set("price_tiers", JSON.stringify(perSizeData));
    }
    fd.set("description", description);
    fd.set("line_url", lineUrl);
    fd.set("images", images.join("\n"));
    fd.set("tag_selections", JSON.stringify(selectedByGroup));
    fd.set("available", available ? "true" : "false");
    fd.set("policy_override", policyOverride ? "true" : "false");
    if (policyOverride) {
      fd.set("lead_time_days", overrideLeadTime);
      fd.set("min_rental_days", overrideMinRental);
      fd.set("max_rental_days", overrideMaxRental);
      fd.set("return_window_days", overrideReturnWindow);
      fd.set("buffer_days_after", overrideBuffer);
    }

    try {
      if (isEdit) {
        const res = await updateProduct(props.productId, fd);
        if (!res.ok) { setError(res.error ?? "บันทึกไม่สำเร็จ"); setSubmitting(false); return; }
      } else {
        const res = await createProduct(fd);
        if (!res.ok) { setError(res.error ?? "บันทึกไม่สำเร็จ"); setSubmitting(false); return; }
      }
      router.push("/sell/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  // ── Shared tier editor component ──────────────────────────────────────────
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column" }}>

      {/* ═══════════════════════════════════════════
          PRODUCT TYPE SELECTOR — create mode only
          ═══════════════════════════════════════════ */}
      {!isEdit && props.mode === "create" && props.productTypes && props.productTypes.length > 1 ? (
        <div style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>
            ประเภทสินค้า
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {props.productTypes.map((pt) => {
              const active = selectedTypeId === pt.id;
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => handleTypeChange(pt.id)}
                  style={{
                    padding: "8px 18px", fontSize: 14, fontWeight: active ? 600 : 400,
                    border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
                    background: active ? "var(--ink)" : "var(--surface)",
                    color: active ? "var(--on-dark)" : "var(--ink)",
                    borderRadius: 8, cursor: "pointer",
                  }}
                >
                  {pt.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════
          CARD 1 — ชุดนี้คืออะไร
          ═══════════════════════════════════════════ */}
      <div style={cardStyle}>
        <div style={cardHeadStyle}>ชุดนี้คืออะไร</div>

        {/* รูปชุด */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>รูปชุด</label>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
            อัปโหลดได้หลายรูป รูปแรกจะเป็นรูปหลัก
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {images.map((url, i) => (
              <div
                key={i}
                style={{ position: "relative", width: 80, height: 100, borderRadius: 6, overflow: "hidden", background: "var(--bg)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  type="button"
                  onClick={() => setImages((c) => c.filter((_, idx) => idx !== i))}
                  aria-label="ลบรูป"
                  style={{ position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: 999, background: "color-mix(in oklch, var(--ink) 75%, transparent)", color: "var(--on-dark)", border: "none", fontSize: 11, cursor: "pointer" }}
                >×</button>
              </div>
            ))}
            <label style={{ width: 80, height: 100, borderRadius: 6, border: "1px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11, color: "var(--ink-3)", background: "var(--surface)", textAlign: "center", padding: 8 }}>
              <input type="file" accept="image/*" multiple onChange={(e) => uploadImages(e.target.files)} style={{ display: "none" }} />
              {uploadingCount > 0 ? `กำลังขึ้น... (${uploadingCount})` : "+ อัปโหลด"}
            </label>
          </div>
          <button
            type="button" onClick={() => setShowUrlInput((s) => !s)}
            style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0, marginTop: 4 }}
          >
            {showUrlInput ? "↑ ซ่อน URL input" : "หรือใส่ลิงก์รูปจากเว็บอื่น (Unsplash, IG, ฯลฯ)"}
          </button>
          {showUrlInput ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-start" }}>
              <textarea
                value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                placeholder={"https://images.unsplash.com/photo-...\nhttps://..."}
                rows={3} className="input input-surface" style={{ flex: 1, resize: "vertical", fontSize: 12 }}
              />
              <button type="button" onClick={addUrlImage} className="btn btn-outline" style={{ padding: "10px 14px", fontSize: 12, whiteSpace: "nowrap" }}>
                + เพิ่ม
              </button>
            </div>
          ) : null}
        </div>

        {/* ชื่อชุด */}
        <div style={{ marginBottom: 14 }}>
          <Labeled label="ชื่อชุด" required>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required aria-required={true} maxLength={80} className="input input-surface" />
          </Labeled>
        </div>

        {/* แบรนด์ */}
        <Labeled label="แบรนด์ (ไม่บังคับ)">
          <input type="text" value={designer} onChange={(e) => setDesigner(e.target.value)} maxLength={60} className="input input-surface" />
        </Labeled>
      </div>

      {/* ═══════════════════════════════════════════
          CARD 2 — ไซซ์ & สต็อก
          ═══════════════════════════════════════════ */}
      <div style={cardStyle}>
        <div style={cardHeadStyle}>ไซซ์ & สต็อก</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {variantRows.map((row, i) => {
            const usedSizes = new Set(variantRows.map((r, ri) => ri !== i ? r.size : null).filter(Boolean));
            const showM = !!showMeasurements[i];
            return (
              <div key={i} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                {/* Main row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {/* Size select */}
                  <select
                    value={row.size}
                    onChange={(e) => updateVariantRow(i, { size: e.target.value as Size })}
                    className="input input-surface" style={{ width: 90, padding: "8px 6px", fontSize: 13 }}
                  >
                    {SIZES.map((s) => (
                      <option key={s} value={s} disabled={usedSizes.has(s) && s !== row.size}>{sizeLabel(s)}</option>
                    ))}
                  </select>
                  {/* Qty stepper */}
                  <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 7, overflow: "hidden" }}>
                    <button
                      type="button"
                      onClick={() => updateVariantRow(i, { quantity: Math.max(1, row.quantity - 1) })}
                      style={{ padding: "8px 10px", background: "var(--bg)", border: "none", cursor: "pointer", fontSize: 16, color: "var(--ink-2)" }}
                    >−</button>
                    <input
                      type="number" min={1} step={1} value={row.quantity}
                      onChange={(e) => updateVariantRow(i, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{ width: 48, textAlign: "center", border: "none", padding: "8px 4px", fontSize: 13, background: "var(--surface)", color: "var(--ink)", outline: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => updateVariantRow(i, { quantity: row.quantity + 1 })}
                      style={{ padding: "8px 10px", background: "var(--bg)", border: "none", cursor: "pointer", fontSize: 16, color: "var(--ink-2)" }}
                    >+</button>
                  </div>
                  {/* Expand measurements */}
                  <button
                    type="button"
                    onClick={() => setShowMeasurements((prev) => ({ ...prev, [i]: !prev[i] }))}
                    style={{ background: "none", border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "var(--ink-3)", cursor: "pointer" }}
                  >
                    {showM ? "↑ ซ่อนขนาดตัว" : "+ ขนาดตัว"}
                  </button>
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeVariantRow(i)}
                    disabled={variantRows.length <= 1}
                    aria-label="ลบไซซ์"
                    style={{ border: 0, background: "none", color: variantRows.length <= 1 ? "var(--ink-3)" : "var(--danger)", cursor: variantRows.length <= 1 ? "default" : "pointer", fontSize: 18, lineHeight: 1, opacity: variantRows.length <= 1 ? 0.35 : 1, marginLeft: "auto" }}
                  >×</button>
                </div>
                {/* Measurements */}
                {showM ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
                    {([
                      { label: "รอบอก (ซม.)", field: "bustCm" as const, value: row.bustCm },
                      { label: "รอบเอว (ซม.)", field: "waistCm" as const, value: row.waistCm },
                      { label: "ความยาว (ซม.)", field: "lengthCm" as const, value: row.lengthCm },
                    ] as const).map(({ label, field, value }) => (
                      <div key={field}>
                        <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 2 }}>{label}</div>
                        <input
                          type="number" min={1} step={1} value={value ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            updateVariantRow(i, { [field]: v === "" ? null : (parseInt(v) || null) });
                          }}
                          className="input input-surface" style={{ padding: "6px 8px", fontSize: 12 }}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {variantRows.length < SIZES.length ? (
          <button
            type="button" onClick={addVariantRow}
            style={{ marginTop: 10, fontSize: 13, color: "var(--ink-2)", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, padding: "7px 12px", cursor: "pointer" }}
          >
            + เพิ่มไซซ์
          </button>
        ) : null}

        {/* Per-size price toggle */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={priceMode === "per_size"}
              onChange={(e) => {
                const next = e.target.checked ? "per_size" : "shared";
                setPriceMode(next);
                if (next === "per_size") {
                  // Initialize per-size tiers for all current variant rows
                  setPerSizeTiers((prev) => {
                    const result = { ...prev };
                    for (const row of variantRows) {
                      if (!result[row.size]) {
                        result[row.size] = [...sharedTiers];
                      }
                    }
                    return result;
                  });
                }
              }}
              style={{ width: 16, height: 16 }}
            />
            ราคาแต่ละไซซ์ไม่เท่ากัน
          </label>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          CARD 3 — ราคาเช่า
          ═══════════════════════════════════════════ */}
      <div style={cardStyle}>
        <div style={cardHeadStyle}>ราคาเช่า (ตามจำนวนวัน)</div>

        {priceMode === "shared" ? (
          <TierEditor
            tiers={sharedTiers}
            onChange={setSharedTiers}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {variantRows.map((row) => {
              const tiers = perSizeTiers[row.size] ?? sharedTiers;
              return (
                <div key={row.size}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>
                    ไซซ์ {sizeLabel(row.size)}
                  </div>
                  <TierEditor
                    tiers={tiers}
                    onChange={(next) => setPerSizeTiers((prev) => ({ ...prev, [row.size]: next }))}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Shared deposit */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <Labeled label="ค่ามัดจำ (ใช้ร่วมทุกไซซ์) (฿)">
            <input
              type="number" min={0} step={1} value={deposit}
              onChange={(e) => setDeposit(parseInt(e.target.value) || 0)}
              className="input input-surface"
            />
          </Labeled>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          CARD 4 — รายละเอียดเพิ่มเติม (collapsible)
          ═══════════════════════════════════════════ */}
      <div style={cardStyle}>
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--ink)", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ fontSize: 12, transform: showDetails ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
          รายละเอียดเพิ่มเติม
        </button>

        {showDetails ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Description */}
            <Labeled label="รายละเอียดชุด">
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={4} maxLength={500}
                placeholder="เช่น ผ้าซาตินสีกุหลาบ ปักลูกไม้ตรงคอ จับจีบที่เอว ใส่กับเข็มขัดได้"
                className="input input-surface" style={{ resize: "vertical" }}
              />
            </Labeled>

            {/* Tag group sections (uses activeSections for the selected product type) */}
            {activeSections.length > 0 ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
                  คุณสมบัติชุด
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {activeSections.map((g) => (
                    <Labeled
                      key={g.groupId}
                      label={g.selectionMode === "single" ? g.groupLabel : `${g.groupLabel} (เลือกได้หลายอัน)`}
                      required={g.isRequired}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {g.tags.map((t) => {
                          const sel = selectedByGroup[g.groupKey] ?? [];
                          const active = sel.includes(t.key);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleTag(g.groupKey, t.key, g.selectionMode)}
                              style={{
                                padding: "6px 12px", fontSize: 13,
                                border: `1px solid ${active ? "var(--ink)" : "var(--line)"}`,
                                background: active ? "var(--ink)" : "var(--surface)",
                                color: active ? "var(--on-dark)" : "var(--ink)",
                                borderRadius: 6, cursor: "pointer",
                                display: "inline-flex", alignItems: "center",
                              }}
                            >
                              {t.swatchImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={t.swatchImageUrl} alt="" style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", display: "inline-block", marginRight: 4, verticalAlign: "middle" }} />
                              ) : t.swatchHex ? (
                                <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: t.swatchHex, marginRight: 4, verticalAlign: "middle", border: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }} />
                              ) : null}
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const grp = props.tagGroups.find((tg) => tg.id === g.groupId);
                          if (grp) setTagReqGroupId(grp.id);
                          setShowTagRequest(true);
                        }}
                        style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: 11, textDecoration: "underline", cursor: "pointer", padding: 0, marginTop: 6 }}
                      >
                        + ขอเพิ่มแท็กในกลุ่มนี้
                      </button>
                    </Labeled>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Tag request section */}
            {tagReqGroupOptions.length > 0 ? (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={labelStyle}>ขอเพิ่มแท็กใหม่</label>
                  <button
                    type="button"
                    onClick={() => { setShowTagRequest((s) => !s); setTagReqError(null); setTagReqSuccess(null); }}
                    style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}
                  >
                    {showTagRequest ? "ซ่อน" : "+ ขอเพิ่มแท็ก"}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: showTagRequest ? 12 : 0 }}>
                  คำขอจะถูกส่งให้แอดมินอนุมัติ{" "}
                  <a href="/sell/tags" style={{ color: "var(--ink-3)", textDecoration: "underline", whiteSpace: "nowrap" }}>
                    จัดการคำขอแท็กทั้งหมด →
                  </a>
                </div>
                {showTagRequest ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 8, borderLeft: "2px solid var(--line)" }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 13 }}>กลุ่มแท็ก</label>
                      <select value={tagReqGroupId} onChange={(e) => setTagReqGroupId(e.target.value)} className="input input-surface">
                        {tagReqGroupOptions.map((g) => (
                          <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 13 }}>ชื่อแท็กที่ต้องการ (ภาษาไทย) <RequiredMark /></label>
                      <input type="text" value={tagReqLabel} onChange={(e) => setTagReqLabel(e.target.value)} maxLength={80} placeholder="เช่น งานกีฬาสี" className="input input-surface" />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 13 }}>slug key (ไม่บังคับ)</label>
                      <input type="text" value={tagReqKey} onChange={(e) => setTagReqKey(e.target.value)} maxLength={48} placeholder="เช่น sport-event" className="input input-surface" />
                    </div>
                    {tagReqError ? <div style={{ fontSize: 12, color: "var(--danger)" }}>{tagReqError}</div> : null}
                    <button type="button" onClick={onTagRequest} disabled={tagReqSubmitting}
                      className="btn btn-outline" style={{ alignSelf: "flex-start", padding: "9px 16px", fontSize: 13 }}>
                      {tagReqSubmitting ? "กำลังส่ง…" : "ส่งคำขอ"}
                    </button>
                  </div>
                ) : null}
                {tagReqSuccess ? (
                  <div style={{ marginTop: 8, fontSize: 13, color: "var(--success, #16a34a)" }}>{tagReqSuccess}</div>
                ) : null}
                {props.shopTagRequests.length > 0 ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>คำขอที่ส่งไปแล้ว</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {props.shopTagRequests.slice(0, 5).map((r) => (
                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "6px 10px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--line)", gap: 8, flexWrap: "wrap" }}>
                          <span>
                            <span style={{ color: "var(--ink-3)" }}>{r.tagGroup.label} /</span>{" "}
                            <strong>{r.requestedLabel}</strong>
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                            background: r.status === "approved" ? "color-mix(in oklch, var(--success) 15%, transparent)" :
                              r.status === "rejected" ? "color-mix(in oklch, var(--danger) 12%, transparent)" :
                              "color-mix(in oklch, var(--warn) 12%, transparent)",
                            color: r.status === "approved" ? "var(--success)" :
                              r.status === "rejected" ? "var(--danger)" : "var(--warn)",
                          }}>
                            {r.status === "approved" ? "อนุมัติแล้ว" : r.status === "rejected" ? "ตีกลับ" : "รออนุมัติ"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ═══════════════════════════════════════════
          CARD 5 — ตั้งค่าขั้นสูง (collapsible)
          ═══════════════════════════════════════════ */}
      <div style={cardStyle}>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--ink)", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ fontSize: 12, transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
          ตั้งค่าขั้นสูง
        </button>

        {showAdvanced ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Available toggle — edit mode only */}
            {isEdit ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ToggleSwitch
                  checked={available}
                  onChange={(next) => setAvailable(next)}
                  label="เปิดให้เช่า"
                />
                <span style={{ fontSize: 14 }}>
                  {available ? "เปิดให้เช่า" : "หยุดให้บริการชุดนี้ชั่วคราว"}
                </span>
              </div>
            ) : null}

            {/* LINE override */}
            <Labeled label="LINE สำหรับชุดนี้" hint="ปล่อยว่างถ้าใช้ LINE หลักของร้าน">
              <input type="text" value={lineUrl} onChange={(e) => setLineUrl(e.target.value)} className="input input-surface" />
            </Labeled>

            {/* Policy override */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>เงื่อนไขการจอง (override ร้าน)</label>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>
                เปิดใช้งานเพื่อกำหนดเงื่อนไขเฉพาะสินค้าชิ้นนี้ ช่องว่าง = ใช้ค่าร้าน
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <input type="checkbox" checked={policyOverride} onChange={(e) => setPolicyOverride(e.target.checked)} />
                <span style={{ fontSize: 14 }}>กำหนดเงื่อนไขเฉพาะสินค้านี้ (override ร้าน)</span>
              </label>
              {policyOverride ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingLeft: 8, borderLeft: "2px solid var(--line)" }}>
                  <Labeled label="จองล่วงหน้าขั้นต่ำ (วัน)" hint="ว่าง = ใช้ค่าร้าน">
                    <input type="number" min={0} value={overrideLeadTime} onChange={(e) => setOverrideLeadTime(e.target.value)} placeholder="ใช้ค่าร้าน" className="input input-surface" />
                  </Labeled>
                  <Labeled label="เช่าขั้นต่ำ (วัน)" hint="ว่าง = ใช้ค่าร้าน">
                    <input type="number" min={1} value={overrideMinRental} onChange={(e) => setOverrideMinRental(e.target.value)} placeholder="ใช้ค่าร้าน" className="input input-surface" />
                  </Labeled>
                  <Labeled label="เช่าสูงสุด (วัน)" hint="ว่าง = ไม่จำกัด (ใช้ค่าร้าน)">
                    <input type="number" min={1} value={overrideMaxRental} onChange={(e) => setOverrideMaxRental(e.target.value)} placeholder="ไม่จำกัด" className="input input-surface" />
                  </Labeled>
                  <Labeled label="คืนสินค้าภายใน (วัน)" hint="ว่าง = ใช้ค่าร้าน">
                    <input type="number" min={0} value={overrideReturnWindow} onChange={(e) => setOverrideReturnWindow(e.target.value)} placeholder="ใช้ค่าร้าน" className="input input-surface" />
                  </Labeled>
                  <Labeled label="บัฟเฟอร์หลังเช่า (วัน)" hint="ว่าง = ใช้ค่าร้าน">
                    <input type="number" min={0} value={overrideBuffer} onChange={(e) => setOverrideBuffer(e.target.value)} placeholder="ใช้ค่าร้าน" className="input input-surface" />
                  </Labeled>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* ═══════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════ */}
      {error ? (
        <div style={{ padding: 12, background: "color-mix(in oklch, var(--danger) 10%, transparent)", borderRadius: 8, fontSize: 13, color: "var(--danger)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => router.push("/sell/dashboard")}
          className="btn btn-outline"
          style={{ padding: "14px 20px", fontSize: 14 }}
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={submitting || uploadingCount > 0}
          className="btn btn-primary"
          style={{ padding: "14px 28px", fontSize: 15, fontWeight: 600, flex: 1 }}
        >
          {submitting ? "กำลังบันทึก…" : isEdit ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"}
        </button>
      </div>
    </form>
  );
}
