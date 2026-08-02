"use client";

import { type TierEntry, tierRangeLabel, computeTotal } from "@/lib/pricing-tiers";

// Module-scope so React keeps the input DOM nodes mounted across ProductForm
// re-renders — defining it inside the component remounts the inputs on every
// keystroke and steals focus after a single character.
export default function TierEditor({
  tiers,
  onChange,
}: {
  tiers: TierEntry[];
  onChange: (tiers: TierEntry[]) => void;
}) {
  const sorted = [...tiers].sort((a, b) => a.minDays - b.minDays);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 30px", gap: 8, alignItems: "center" }}>
            {/* Start day — editable (first tier is locked at 1) */}
            <div>
              {i === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>ตั้งแต่</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>1 วัน</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>ตั้งแต่วันที่</span>
                  <input
                    type="number" min={2} step={1} value={row.minDays}
                    onChange={(e) => {
                      const next = [...sorted];
                      next[i] = { ...next[i], minDays: parseInt(e.target.value) || 0 };
                      onChange(next);
                    }}
                    aria-label="วันเริ่มต้นของช่วงราคา"
                    className="input input-surface" style={{ width: 60, textAlign: "center" }}
                  />
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                = {tierRangeLabel(sorted, i)}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>฿</span>
              <input
                type="number" min={0} step={1} value={row.pricePerDay}
                onChange={(e) => {
                  const next = [...sorted];
                  next[i] = { ...next[i], pricePerDay: parseInt(e.target.value) || 0 };
                  onChange(next);
                }}
                placeholder="฿/วัน" className="input input-surface" style={{ flex: 1 }}
              />
              <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>/วัน</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (tiers.length <= 1) return;
                onChange(sorted.filter((_, idx) => idx !== i));
              }}
              disabled={tiers.length <= 1}
              aria-label="ลบช่วงราคา"
              style={{ border: 0, background: "none", color: tiers.length <= 1 ? "var(--ink-3)" : "var(--danger)", cursor: tiers.length <= 1 ? "default" : "pointer", fontSize: 18, lineHeight: 1, opacity: tiers.length <= 1 ? 0.35 : 1, alignSelf: "start", marginTop: 4 }}
            >×</button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const maxMin = Math.max(...tiers.map((t) => t.minDays));
          const lastPrice = tiers.find((t) => t.minDays === maxMin)?.pricePerDay ?? 0;
          onChange([...tiers, { minDays: maxMin + 1, pricePerDay: lastPrice }]);
        }}
        style={{ marginTop: 10, fontSize: 13, color: "var(--ink-2)", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, padding: "7px 12px", cursor: "pointer" }}
      >
        + เพิ่มช่วงราคา
      </button>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.5 }}>
        ตั้งวันเริ่มต้นของแต่ละช่วงได้ เช่น 1–2 วัน / 3–5 วัน / 6 วันขึ้นไป · ช่วงสุดท้ายเป็นแบบเปิดท้าย (X วันขึ้นไป) เสมอ
      </div>
      {/* Live preview */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[2, 4, 7].map((n) => {
          const total = computeTotal(tiers, n);
          return (
            <div key={n} style={{ background: "var(--bg)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>เช่า {n} วัน</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>฿{total.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
