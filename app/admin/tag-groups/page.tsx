import type { Metadata } from "next";
import { db } from "@/lib/db";
import { listTagGroups } from "@/lib/tags";
import BindingRow, { type BindingRowData } from "./BindingRow";
import AddBinding from "./AddBinding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ผูกกลุ่มแท็ก · Admin",
  robots: { index: false, follow: false },
};

export default async function TagGroupBindingsPage() {
  const [productTypes, allGroups] = await Promise.all([
    db.productType.findMany({
      orderBy: { label: "asc" },
      select: {
        id: true,
        key: true,
        label: true,
        tagGroupBindings: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            sortOrder: true,
            isRequired: true,
            selectionMode: true,
            isActive: true,
            tagGroup: {
              select: {
                id: true,
                key: true,
                label: true,
                tags: {
                  where: { isActive: true },
                  select: { id: true, key: true, label: true, imageUrl: true },
                  orderBy: { key: "asc" as const },
                },
              },
            },
          },
        },
      },
    }),
    listTagGroups(),
  ]);

  return (
    <div>
      <h1
        className="page-title"
        style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}
      >
        ผูกกลุ่มแท็กกับประเภทสินค้า
      </h1>
      <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 28 }}>
        กำหนดว่าประเภทสินค้าแต่ละชนิดแสดงกลุ่มแท็กใดบ้างในฟอร์มลงสินค้า —
        เรียงลำดับ, ตั้งจำเป็น, และยกเลิกการผูกได้ที่นี่
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {productTypes.map((pt) => {
          const boundGroupIds = new Set(pt.tagGroupBindings.map((b) => b.tagGroup.id));
          const availableGroups = allGroups.filter((g) => !boundGroupIds.has(g.id));

          const bindings: BindingRowData[] = pt.tagGroupBindings.map((b) => ({
            id: b.id,
            sortOrder: b.sortOrder,
            isRequired: b.isRequired,
            selectionMode: b.selectionMode as "single" | "multi",
            isActive: b.isActive,
            tagGroup: { id: b.tagGroup.id, key: b.tagGroup.key, label: b.tagGroup.label },
            occasionTags: b.tagGroup.key === "occasion"
              ? b.tagGroup.tags.map((tag) => ({
                  id: tag.id,
                  key: tag.key,
                  label: tag.label,
                  imageUrl: tag.imageUrl ?? null,
                }))
              : undefined,
          }));

          return (
            <section
              key={pt.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                background: "var(--surface)",
                overflow: "hidden",
              }}
            >
              {/* Section header */}
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--line)",
                  background: "var(--bg)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{pt.label}</span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      color: "var(--ink-3)",
                      fontFamily: "monospace",
                    }}
                  >
                    {pt.key}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                  }}
                >
                  {bindings.length === 0
                    ? "ยังไม่มีกลุ่มแท็กที่ผูกไว้"
                    : `${bindings.length} กลุ่ม`}
                </span>
              </div>

              {/* Binding rows */}
              <div style={{ padding: "12px 16px" }}>
                {bindings.length === 0 ? (
                  <div
                    style={{
                      padding: "18px 0",
                      textAlign: "center",
                      color: "var(--ink-3)",
                      fontSize: 13,
                    }}
                  >
                    ยังไม่ได้ผูกกลุ่มแท็ก
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {bindings.map((b) => (
                      <BindingRow key={b.id} binding={b} />
                    ))}
                  </div>
                )}

                {/* Add binding affordance */}
                <AddBinding
                  productTypeId={pt.id}
                  availableGroups={availableGroups}
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
