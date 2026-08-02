"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleSavedProduct } from "@/app/actions/saved";
import { getMe } from "./HeaderUserSlot";

type Props = {
  productId: string;
  /**
   * Optimistic initial saved state from server. When undefined (ISR/cached
   * pages that cannot read session server-side) the component self-fetches
   * from /api/me on the client.
   */
  initialSaved?: boolean;
  /**
   * Whether the viewer is logged in. When undefined the component self-fetches
   * from /api/me on the client.
   */
  isLoggedIn?: boolean;
  variant?: "card" | "detail";
};

export default function SaveButton({
  productId,
  initialSaved,
  isLoggedIn,
  variant = "card",
}: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved ?? false);
  const [bump, setBump] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Tracks whether we have real auth data (either from props or self-fetch)
  const [loggedIn, setLoggedIn] = useState(isLoggedIn ?? false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Props already provided by server — nothing to fetch
    if (isLoggedIn !== undefined && initialSaved !== undefined) {
      setLoggedIn(isLoggedIn);
      setSaved(initialSaved);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getMe().then((d) => {
      const li = !!d.user;
      setLoggedIn(li);
      if (li && d.user) {
        setSaved(d.user.savedProductIds.includes(productId));
      }
    });
  }, [isLoggedIn, initialSaved, productId]);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    // optimistic
    setSaved((s) => {
      if (!s) setBump(true);
      return !s;
    });
    startTransition(async () => {
      const res = await toggleSavedProduct(productId);
      if (!res.ok) {
        setSaved((s) => !s); // revert
      } else {
        setSaved(res.saved);
      }
    });
  }

  if (variant === "detail") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={saved ? "นำออกจากรายการบันทึก" : "บันทึกชุดนี้"}
        disabled={isPending}
        style={{
          width: 48,
          padding: 0,
          border: `1px solid ${saved ? "var(--save)" : "var(--line)"}`,
          background: "var(--surface)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: saved ? "var(--save)" : "var(--ink-2)",
          cursor: isPending ? "wait" : "pointer",
          transition:
            "color var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease)",
        }}
      >
        <span
          className={bump ? "pop" : undefined}
          onAnimationEnd={() => setBump(false)}
          style={{ display: "inline-flex" }}
        >
          <HeartIcon filled={saved} size={18} />
        </span>
      </button>
    );
  }

  // card variant — overlay
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? "นำออก" : "บันทึก"}
      disabled={isPending}
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        width: 32,
        height: 32,
        borderRadius: 999,
        background: "oklch(0.99 0.007 88 / 0.93)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: saved ? "var(--save)" : "var(--ink-2)",
        cursor: isPending ? "wait" : "pointer",
        zIndex: 2,
        transition: "color var(--dur-1) var(--ease)",
      }}
    >
      <span
        className={bump ? "pop" : undefined}
        onAnimationEnd={() => setBump(false)}
        style={{ display: "inline-flex" }}
      >
        <HeartIcon filled={saved} size={16} />
      </span>
    </button>
  );
}

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
