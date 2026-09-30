import { useEffect, useState } from "react";

const FALLBACK = "rgb(160, 164, 255)";
const cache = new Map<string, string>();

/** Picks a vivid color from the album art to tint the visualizer and glow. */
export function useAccentColor(src: string | null | undefined) {
  const [color, setColor] = useState(() => (src && cache.get(src)) || FALLBACK);

  useEffect(() => {
    if (!src) return setColor(FALLBACK);
    const cached = cache.get(src);
    if (cached) return setColor(cached);

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const c = extract(img);
      cache.set(src, c);
      if (!cancelled) setColor(c);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return color;
}

function extract(img: HTMLImageElement) {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return FALLBACK;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Weight each pixel by saturation so muddy/grey areas don't dominate.
  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    const sat = max === 0 ? 0 : (max - min) / max;
    const weight = sat * sat * (max / 255) + 0.01;
    r += pr * weight;
    g += pg * weight;
    b += pb * weight;
    total += weight;
  }
  if (!total) return FALLBACK;
  return boost(r / total, g / total, b / total);
}

/** Push lightness/saturation up so the color reads well on black. */
function boost(r: number, g: number, b: number) {
  const max = Math.max(r, g, b, 1);
  const scale = Math.min(235 / max, 2.2);
  const avg = (r + g + b) / 3;
  const sat = 1.25;
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, (avg + (c - avg) * sat) * scale)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
