import { useLayoutEffect, useRef, useState } from "react";

/** Single-line text that scrolls back and forth when it doesn't fit. */
export function Marquee({ text, className }: { text: string; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      setOverflow(Math.max(0, inner.current.scrollWidth - outer.current.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={outer} className={`marquee ${overflow ? "is-scrolling" : ""} ${className ?? ""}`}>
      <span
        ref={inner}
        style={
          overflow
            ? ({
                "--marquee-distance": `-${overflow}px`,
                "--marquee-duration": `${Math.max(6, overflow / 18)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}
