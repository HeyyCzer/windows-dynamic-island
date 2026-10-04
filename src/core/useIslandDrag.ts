import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useMotionValue, useMotionValueEvent, useSpring, useTransform, useVelocity } from "motion/react";
import { command, useTauriEvent } from "./bridge";
import { ISLAND_OFFSET_KEY, positionSettings, readSetting, setSetting, useSettings } from "./settings";

/** Pixels the pointer must travel before a press becomes a drag (not a click). */
const DRAG_THRESHOLD = 5;
/** Gap kept between the island (plus its bubbles) and the screen edges. */
const EDGE_MARGIN = 12;
/** How much of the overshoot past an edge shows while dragging. */
const RUBBER = 0.22;
/** Releases this close to the middle snap back to it. */
const CENTER_SNAP = 28;
/** Seconds of release velocity added to where the island lands. */
const FLING = 0.1;

/** Island position along the top edge: a bit of lag behind the pointer, bouncy on return. */
const follow = { stiffness: 480, damping: 30, mass: 0.85 };
/** Jelly settle of the squash & stretch. */
const wobble = { stiffness: 520, damping: 16, mass: 0.6 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const rubber = (v: number, min: number, max: number) =>
  v > max ? max + (v - max) * RUBBER : v < min ? min + (v - min) * RUBBER : v;

interface Options {
  /** Target shell width (the live, animated width is tracked via `onShellUpdate`). */
  width: number;
  /** Space taken beyond the shell on each side (ears, bubbles). */
  leftExtra: number;
  rightExtra: number;
  /** False while the island is open: it only drifts back to the center once collapsed. */
  canReturn: boolean;
  onDragChange?: (dragging: boolean) => void;
}

/**
 * Horizontal dragging of the island along the top edge of the screen, with a
 * squash & stretch deformation driven by its speed. Returns motion values for
 * the shell's `style` plus the pointer handlers.
 *
 * `x` is the offset from the center the user chose; what's rendered is that
 * offset clamped to the screen for the island's current (animated) width, so
 * expanding next to an edge grows inward instead of off-screen.
 */
export function useIslandDrag({ width, leftExtra, rightExtra, canReturn, onDragChange }: Options) {
  const settings = useSettings();
  const returnToCenter = readSetting(settings, positionSettings.returnToCenter);
  const returnDelay = readSetting(settings, positionSettings.returnDelay);
  const stored = Number(settings[ISLAND_OFFSET_KEY]) || 0;

  const target = useMotionValue(0);
  const x = useSpring(target, follow);
  const liveWidth = useMotionValue(width);
  const stageWidth = useMotionValue(typeof window === "undefined" ? 0 : window.innerWidth);
  const left = useMotionValue(leftExtra);
  const right = useMotionValue(rightExtra);
  left.set(leftExtra);
  right.set(rightExtra);
  // 1 while dragging / gliding (deforms and allows rubber-banding), 0 at rest.
  const moving = useMotionValue(0);

  useEffect(() => {
    const onResize = () => stageWidth.set(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [stageWidth]);

  const limits = useCallback(
    (w: number) => {
      const half = stageWidth.get() / 2 - w / 2 - EDGE_MARGIN;
      return { min: Math.min(0, -(half - left.get())), max: Math.max(0, half - right.get()) };
    },
    [stageWidth, left, right],
  );

  const offset = useTransform(() => {
    const { min, max } = limits(liveWidth.get());
    return moving.get() ? rubber(x.get(), min, max) : clamp(x.get(), min, max);
  });

  // --- squash & stretch ------------------------------------------------------
  const velocity = useVelocity(offset);
  const stretch = useSpring(
    useTransform(() => moving.get() * Math.min(Math.abs(velocity.get()) / 2600, 0.3)),
    wobble,
  );
  // Hanging from the top edge, the bottom trails behind the movement.
  const skewX = useSpring(
    useTransform(() => moving.get() * clamp(-velocity.get() / 190, -11, 11)),
    wobble,
  );
  const scaleX = useTransform(stretch, (s) => 1 + s);
  const scaleY = useTransform(stretch, (s) => 1 - s * 0.5);

  // Back to rest once the glide settles.
  const dragging = useRef(false);
  useMotionValueEvent(x, "change", (v) => {
    if (!dragging.current && moving.get() && Math.abs(v - target.get()) < 0.5 && Math.abs(x.getVelocity()) < 20) {
      moving.set(0);
    }
  });

  const [parked, setParked] = useState(false);

  /** Glide to an offset (animated, deforming). */
  const glideTo = useCallback(
    (to: number) => {
      // Start from what's on screen, which may be clamped narrower than `x`.
      if (!moving.get()) x.jump(offset.get());
      moving.set(1);
      target.set(to);
      setParked(to !== 0);
    },
    [moving, x, offset, target],
  );

  const recenter = useCallback(() => {
    glideTo(0);
    setSetting(ISLAND_OFFSET_KEY, 0);
  }, [glideTo]);
  useTauriEvent("island://recenter", recenter);

  // Return to the middle after a while (only once collapsed).
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    if (!returnToCenter || !parked || isDragging || !canReturn) return;
    const id = window.setTimeout(recenter, Math.max(0, returnDelay) * 1000);
    return () => window.clearTimeout(id);
  }, [returnToCenter, returnDelay, parked, isDragging, canReturn, recenter]);

  // Staying put: restore the saved spot (on launch, or changed by another window).
  useEffect(() => {
    if (returnToCenter || dragging.current || Math.abs(stored - target.get()) < 0.5) return;
    glideTo(stored);
  }, [stored, returnToCenter, glideTo, target]);

  // --- pointer -----------------------------------------------------------------
  const suppressClick = useRef(false);
  const onDragChangeRef = useRef(onDragChange);
  onDragChangeRef.current = onDragChange;

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as Element).closest("input, textarea, select, [data-no-drag]")) return;

      const el = e.currentTarget;
      const pointerId = e.pointerId;
      const startX = e.clientX;
      let origin = 0;
      let active = false;
      let lastX = startX;
      let lastT = performance.now();
      let speed = 0;

      const move = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        if (!active) {
          if (Math.abs(dx) < DRAG_THRESHOLD) return;
          active = true;
          dragging.current = true;
          if (!moving.get()) x.jump(offset.get());
          moving.set(1);
          origin = offset.get() - dx;
          try {
            el.setPointerCapture(pointerId);
          } catch {
            /* pointer already gone */
          }
          setIsDragging(true);
          onDragChangeRef.current?.(true);
          command("set_dragging", { dragging: true });
        }
        const now = performance.now();
        const dt = Math.max(1, now - lastT);
        speed = speed * 0.6 + ((ev.clientX - lastX) / dt) * 1000 * 0.4;
        lastX = ev.clientX;
        lastT = now;
        const { min, max } = limits(liveWidth.get());
        target.set(rubber(origin + dx, min, max));
      };

      const end = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (!active) return;

        dragging.current = false;
        setIsDragging(false);
        onDragChangeRef.current?.(false);
        command("set_dragging", { dragging: false });
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        // A pause before letting go cancels the fling.
        if (performance.now() - lastT > 80) speed = 0;

        const { min, max } = limits(liveWidth.get());
        let to = clamp(origin + (lastX - startX) + speed * FLING, min, max);
        if (Math.abs(to) < CENTER_SNAP) to = 0;
        target.set(to);
        setParked(to !== 0);
        setSetting(ISLAND_OFFSET_KEY, Math.round(to));

        // The click that follows pointerup must not expand / press buttons.
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [limits, liveWidth, moving, offset, target, x],
  );

  const onClickCapture = useCallback((e: MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  /** Pass to the shell's `onUpdate` so clamping follows the animated width. */
  const onShellUpdate = useCallback(
    (latest: Record<string, unknown>) => {
      if (typeof latest.width === "number") liveWidth.set(latest.width);
    },
    [liveWidth],
  );

  return {
    style: { x: offset, scaleX, scaleY, skewX, transformOrigin: "50% 0" },
    dragging: isDragging,
    onPointerDown,
    onClickCapture,
    onShellUpdate,
  };
}
