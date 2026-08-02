"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateBinding, unbindTagGroup } from "@/app/actions/admin-tag-groups";
import { setTagImage } from "@/app/actions/admin";

export type OccasionTagItem = {
  id: string;
  key: string;
  label: string;
  imageUrl: string | null;
};

export type BindingRowData = {
  id: string;
  sortOrder: number;
  isRequired: boolean;
  selectionMode: "single" | "multi";
  isActive: boolean;
  tagGroup: { id: string; key: string; label: string };
  occasionTags?: OccasionTagItem[];
};

function OccasionTagImageManager({ tag }: { tag: OccasionTagItem }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(tag.imageUrl);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }
      const result = await setTagImage(tag.id, json.url);
      if (!result.ok) {
        setError(result.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setPreview(json.url);
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError(null);
    try {
      const result = await setTagImage(tag.id, null);
      if (!result.ok) {
        setError(result.error ?? "ลบรูปไม่สำเร็จ");
        return;
      }
      setPreview(null);
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "var(--bg)",
        borderRadius: 6,
        border: "1px solid var(--line-2)",
      }}
    >
      {/* Tag label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{tag.label}</span>
        <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>{tag.key}</span>
      </div>

      {/* Image preview */}
      {preview ? (
        <img
          src={preview}
          alt={tag.label}
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0, border: "1px solid var(--line)" }}
        />
      ) : (
        <span style={{ fontSize: 11, color: "var(--ink-3)", width: 48, textAlign: "center" }}>ไม่มีรูป</span>
      )}

      {/* Upload button */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="btn btn-outline"
        style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
      >
        {uploading ? "…" : "อัปโหลดรูป"}
      </button>

      {/* Remove button — only if image exists */}
      {preview && (
        <button
          type="button"
          disabled={uploading}
          onClick={handleRemove}
          className="btn btn-outline"
          style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger)", borderColor: "var(--danger)", flexShrink: 0 }}
        >
          ลบรูป
        </button>
      )}

      {/* Error */}
      {error && (
        <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>
      )}
    </div>
  );
}

export default function BindingRow({ binding }: { binding: BindingRowData }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnbind, setConfirmUnbind] = useState(false);

  const [sortOrder, setSortOrder] = useState(binding.sortOrder);
  const [isRequired, setIsRequired] = useState(binding.isRequired);
  const [selectionMode, setSelectionMode] = useState<"single" | "multi">(binding.selectionMode);
  const [isActive, setIsActive] = useState(binding.isActive);

  async function onUpdate(patch: Parameters<typeof updateBinding>[1]) {
    setWorking(true);
    setError(null);
    const res = await updateBinding(binding.id, patch);
    if (!res.ok) {
      setError(res.error ?? "ผิดพลาด");
    }
    setWorking(false);
    router.refresh();
  }

  async function onUnbind() {
    setWorking(true);
    setError(null);
    const res = await unbindTagGroup(binding.id);
    if (!res.ok) {
      setError(res.error ?? "ผิดพลาด");
      setWorking(false);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto auto auto auto auto",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: isActive ? "var(--surface)" : "var(--bg)",
          border: "1px solid var(--line)",
          borderRadius: binding.occasionTags?.length ? "6px 6px 0 0" : 6,
          opacity: isActive ? 1 : 0.65,
        }}
      >
        {/* Tag group label */}
        <div>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{binding.tagGroup.label}</span>
          <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>{binding.tagGroup.key}</span>
        </div>

        {/* Sort order */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>ลำดับ</span>
          <input
            type="number"
            value={sortOrder}
            min={0}
            disabled={working}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            onBlur={() => {
              if (sortOrder !== binding.sortOrder) onUpdate({ sortOrder });
            }}
            className="input"
            style={{ width: 52, textAlign: "center" }}
          />
        </div>

        {/* Selection mode */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>โหมด</span>
          <select
            value={selectionMode}
            disabled={working}
            onChange={(e) => {
              const v = e.target.value as "single" | "multi";
              setSelectionMode(v);
              onUpdate({ selectionMode: v });
            }}
            className="input input-surface"
          >
            <option value="multi">หลายตัว</option>
            <option value="single">ตัวเดียว</option>
          </select>
        </div>

        {/* isRequired toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            cursor: working ? "not-allowed" : "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={isRequired}
            disabled={working}
            onChange={(e) => {
              setIsRequired(e.target.checked);
              onUpdate({ isRequired: e.target.checked });
            }}
          />
          จำเป็น
        </label>

        {/* isActive toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            cursor: working ? "not-allowed" : "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={isActive}
            disabled={working}
            onChange={(e) => {
              setIsActive(e.target.checked);
              onUpdate({ isActive: e.target.checked });
            }}
          />
          ใช้งาน
        </label>

        {/* Unbind */}
        {confirmUnbind ? (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              disabled={working}
              onClick={onUnbind}
              className="btn btn-dark"
              style={{
                padding: "4px 10px",
                fontSize: 12,
                background: "var(--danger)",
                borderColor: "var(--danger)",
              }}
            >
              {working ? "…" : "ยืนยัน"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmUnbind(false)}
              className="btn btn-outline"
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              ยกเลิก
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={working}
            onClick={() => setConfirmUnbind(true)}
            className="btn btn-outline"
            style={{
              padding: "4px 10px",
              fontSize: 12,
              color: "var(--danger)",
              borderColor: "var(--danger)",
            }}
          >
            ยกเลิกการผูก
          </button>
        )}

        {/* Error inline */}
        {error ? (
          <span style={{ fontSize: 11, color: "var(--danger)", gridColumn: "1 / -1" }}>{error}</span>
        ) : null}
      </div>

      {/* Occasion tag image management section */}
      {binding.occasionTags && binding.occasionTags.length > 0 && (
        <div
          style={{
            border: "1px solid var(--line)",
            borderTop: "none",
            borderRadius: "0 0 6px 6px",
            padding: "10px 14px",
            background: "var(--surface)",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
            รูปภาพหน้าปกหมวดโอกาส — แสดงบนการ์ดหมวดหมู่ในหน้าแรก
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {binding.occasionTags.map((tag) => (
              <OccasionTagImageManager key={tag.id} tag={tag} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
