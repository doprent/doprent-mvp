"use client";

import RequiredMark from "@/components/RequiredMark";

/**
 * Shared label wrapper used in seller forms (ProductForm, EditBoutiqueForm).
 * Renders a labelled <div> with an optional RequiredMark and hint text.
 */
export default function Labeled({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--ink-2)",
          marginBottom: 6,
        }}
      >
        {label}
        {required ? <RequiredMark /> : null}
        {hint ? (
          <span style={{ fontWeight: 400, color: "var(--ink-3)", marginLeft: 4 }}>
            — {hint}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
