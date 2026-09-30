import { useEffect } from "react";
import { command, isTauri } from "./bridge";

const PAD = 6;

/**
 * Keeps the backend informed about which parts of the transparent window are
 * interactive. Every element marked with `data-hit` counts; the rects follow
 * animations because they are re-measured every few frames.
 */
export function useHitRects() {
  useEffect(() => {
    if (!isTauri) return;
    let frame = 0;
    let raf = 0;
    let last = "";

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (frame++ % 3 !== 0) return;
      const rects = Array.from(document.querySelectorAll<HTMLElement>("[data-hit]")).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.left - PAD),
          y: Math.round(Math.max(0, r.top - PAD)),
          width: Math.round(r.width + PAD * 2),
          height: Math.round(r.height + PAD * 2),
        };
      });
      const key = JSON.stringify(rects);
      if (key !== last) {
        last = key;
        command("set_hit_rects", { rects });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
