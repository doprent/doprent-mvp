"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { productPath } from "@/lib/product-url";

export type HeroItem = {
  slug: string;
  tag_code?: string;
  name: string;
  image: string | null;
  price: number;
};

/**
 * Hero coverflow — a 3D "rack" of dresses the visitor can rotate through.
 *
 * - Auto-advances every ~3.8s (paused on hover / drag / reduced-motion).
 * - Drag or swipe horizontally, or use the arrow keys / on-screen arrows.
 * - Click the centre card to open that dress; click a side card to bring it
 *   to the front.
 *
 * Only transform + opacity are animated (never layout props), eased with an
 * exponential curve — no bounce. Honours prefers-reduced-motion by disabling
 * auto-rotation and transitions.
 */
export default function HeroCarousel({ items }: { items: HeroItem[] }) {
  const router = useRouter();
  const n = items.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const next = useCallback(() => setActive((i) => (i + 1) % n), [n]);
  const prev = useCallback(() => setActive((i) => (i - 1 + n) % n), [n]);

  // Auto-rotate (respects reduced-motion + pause state).
  useEffect(() => {
    if (n <= 1 || paused) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion:reduce)").matches) return;
    const t = setInterval(next, 3800);
    return () => clearInterval(t);
  }, [n, paused, next]);

  // Drag / swipe.
  const dragX = useRef<number | null>(null);
  const onDown = (x: number) => {
    dragX.current = x;
    setPaused(true);
  };
  const onUp = (x: number) => {
    if (dragX.current != null) {
      const dx = x - dragX.current;
      if (Math.abs(dx) > 42) (dx < 0 ? next : prev)();
    }
    dragX.current = null;
    setPaused(false);
  };

  if (!n) return <div className="hc-wrap" aria-hidden />;

  return (
    <div
      ref={wrapRef}
      className="hc-wrap rise rise-3"
      role="group"
      aria-roledescription="carousel"
      aria-label="ชุดเด่นพร้อมเช่า"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={(e) => onDown(e.clientX)}
      onPointerUp={(e) => onUp(e.clientX)}
      onPointerCancel={() => { dragX.current = null; setPaused(false); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); next(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
        else if (e.key === "Enter") { const it = items[active]; router.push(it.tag_code ? productPath({ slug: it.slug, tag_code: it.tag_code }) : `/product/${it.slug}`); }
      }}
    >
      <div className="hc-stage">
        {items.map((it, i) => {
          let off = i - active;
          if (off > n / 2) off -= n;
          if (off < -n / 2) off += n;
          const abs = Math.abs(off);
          const visible = abs <= 2;
          const isCenter = off === 0;
          const style: React.CSSProperties = {
            transform: `translate(-50%,-50%) translateX(${off * 44}%) translateZ(${-abs * 70}px) rotateY(${off * -32}deg) scale(${1 - abs * 0.12})`,
            zIndex: 50 - abs * 10,
            opacity: visible ? 1 - abs * 0.34 : 0,
            pointerEvents: visible ? "auto" : "none",
          };
          return (
            <button
              key={it.slug + i}
              type="button"
              className={`hc-card${isCenter ? " is-center" : ""}`}
              style={style}
              aria-hidden={!visible}
              aria-label={isCenter ? `เปิดดู ${it.name}` : `ไปที่ ${it.name}`}
              tabIndex={isCenter ? 0 : -1}
              onClick={() => {
                if (isCenter) router.push(it.tag_code ? productPath({ slug: it.slug, tag_code: it.tag_code }) : `/product/${it.slug}`);
                else setActive(i);
              }}
            >
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image} alt={it.name} draggable={false} loading={abs <= 1 ? "eager" : "lazy"} />
              ) : (
                <span className="hc-ph" aria-hidden />
              )}
              <span className="hc-cap" aria-hidden={!isCenter}>
                <span className="hc-name">{it.name}</span>
                <span className="hc-price">฿{it.price.toLocaleString()} <small>/วัน</small></span>
              </span>
            </button>
          );
        })}

        <span className="hc-vchip" aria-hidden>
          <span className="ck">
            <svg viewBox="0 0 24 24"><polyline points="4,12 10,18 20,6" /></svg>
          </span>
          ร้านนี้ตรวจสอบแล้ว
        </span>
      </div>

      {n > 1 ? (
        <div className="hc-ctrl">
          <button type="button" className="hc-arrow" aria-label="ชุดก่อนหน้า" onClick={prev}>
            <svg viewBox="0 0 24 24"><polyline points="15,5 8,12 15,19" /></svg>
          </button>
          <div className="hc-dots" role="tablist" aria-label="เลือกชุด">
            {items.map((it, i) => (
              <button
                key={it.slug + "dot"}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`ชุดที่ ${i + 1}`}
                className={`hc-dot${i === active ? " is-on" : ""}`}
                onClick={() => setActive(i)}
              />
            ))}
          </div>
          <button type="button" className="hc-arrow" aria-label="ชุดถัดไป" onClick={next}>
            <svg viewBox="0 0 24 24"><polyline points="9,5 16,12 9,19" /></svg>
          </button>
        </div>
      ) : null}

      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: HC_CSS }}
      />
    </div>
  );
}

const HC_CSS = `
.hc-wrap{position:relative;height:460px;display:flex;flex-direction:column;outline:none}
.hc-wrap:focus-visible{box-shadow:0 0 0 3px color-mix(in oklch,var(--accent) 40%,transparent);border-radius:18px}
.hc-stage{position:relative;flex:1;perspective:1200px;touch-action:pan-y;cursor:grab}
.hc-stage:active{cursor:grabbing}
.hc-card{position:absolute;left:50%;top:50%;width:60%;aspect-ratio:3/4;border:0;padding:0;border-radius:16px;overflow:hidden;background:var(--surface);transform-origin:center;transition:transform .6s cubic-bezier(0.22,1,0.36,1),opacity .5s cubic-bezier(0.22,1,0.36,1),box-shadow .4s ease;box-shadow:0 18px 44px -22px oklch(0.3 0.05 80/.45);cursor:pointer;will-change:transform,opacity}
.hc-card.is-center{box-shadow:0 30px 60px -24px oklch(0.3 0.05 80/.55)}
.hc-card img{width:100%;height:100%;object-fit:cover;-webkit-user-drag:none;user-select:none}
.hc-card .hc-ph{display:block;width:100%;height:100%;background:linear-gradient(150deg,oklch(0.6 0.08 168),oklch(0.42 0.07 168))}
.hc-card::after{content:"";position:absolute;inset:0;background:linear-gradient(160deg,transparent 50%,oklch(0.2 0.04 80/.18))}
.hc-cap{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:16px 16px 14px;text-align:left;background:linear-gradient(to top,oklch(0.2 0.03 80/.66),transparent);color:var(--on-dark,#fff);opacity:0;transform:translateY(8px);transition:opacity .45s var(--ease,ease),transform .45s var(--ease,ease)}
.hc-card.is-center .hc-cap{opacity:1;transform:translateY(0)}
.hc-cap .hc-name{font-size:16px;font-weight:600;line-height:1.2;text-shadow:0 1px 8px oklch(0.2 0.03 80/.5)}
.hc-cap .hc-price{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}
.hc-cap .hc-price small{font-weight:400;opacity:.85}
.hc-vchip{position:absolute;bottom:14px;left:14px;z-index:60;display:flex;align-items:center;gap:8px;background:var(--bg);padding:8px 13px 8px 10px;border-radius:999px;font-size:12.5px;font-weight:500;color:var(--ink);box-shadow:0 8px 24px -10px oklch(0.3 0.05 80/.5);pointer-events:none}
.hc-vchip .ck{width:19px;height:19px;border-radius:50%;background:var(--accent);display:grid;place-items:center;flex-shrink:0}
.hc-vchip .ck svg{width:10px;height:10px;stroke:var(--accent-ink);stroke-width:3;fill:none}
.hc-ctrl{display:flex;align-items:center;justify-content:center;gap:14px;padding-top:14px}
.hc-arrow{width:36px;height:36px;border-radius:999px;border:1px solid var(--line);background:var(--bg);display:grid;place-items:center;cursor:pointer;color:var(--ink-2);transition:border-color .25s ease,color .25s ease}
.hc-arrow:hover{border-color:var(--ink);color:var(--ink)}
.hc-arrow svg{width:17px;height:17px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.hc-dots{display:flex;align-items:center;gap:7px}
.hc-dot{width:7px;height:7px;border-radius:999px;border:0;padding:0;background:color-mix(in oklch,var(--ink) 22%,transparent);cursor:pointer;transition:width .35s var(--ease,ease),background .25s ease}
.hc-dot.is-on{width:22px;background:var(--accent)}
@media (max-width:900px){
  .hc-wrap{height:360px;order:-1}
  .hc-card{width:64%}
}
@media (max-width:600px){
  .hc-wrap{height:330px}
  .hc-card{width:72%}
}
@media (prefers-reduced-motion:reduce){
  .hc-card,.hc-cap,.hc-dot{transition:none}
}
`;
