import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 16, ...rest }: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "currentColor",
  ...rest,
});

export const PlayIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8Z" />
  </svg>
);

export const PauseIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.4" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.4" />
  </svg>
);

export const NextIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6.2v11.6a1 1 0 0 0 1.53.85L12 14v3.8a1 1 0 0 0 1.53.85l8.3-5.8a1 1 0 0 0 0-1.7l-8.3-5.8A1 1 0 0 0 12 6.2V10L4.53 5.35A1 1 0 0 0 3 6.2Z" />
  </svg>
);

export const PrevIcon = (p: P) => (
  <svg {...base(p)} style={{ transform: "scaleX(-1)", ...p.style }}>
    <path d="M3 6.2v11.6a1 1 0 0 0 1.53.85L12 14v3.8a1 1 0 0 0 1.53.85l8.3-5.8a1 1 0 0 0 0-1.7l-8.3-5.8A1 1 0 0 0 12 6.2V10L4.53 5.35A1 1 0 0 0 3 6.2Z" />
  </svg>
);

export const MusicIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 3.5v11.25a3.25 3.25 0 1 1-2-3V7.4l-8 1.7v7.65a3.25 3.25 0 1 1-2-3V5.9a1 1 0 0 1 .79-.98l10-2.13A1 1 0 0 1 19 3.5Z" />
  </svg>
);

export const GearIcon = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const SparkleIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2.5c.4 0 .75.27.86.66l1.1 3.9a4.5 4.5 0 0 0 3.08 3.08l3.9 1.1a.9.9 0 0 1 0 1.72l-3.9 1.1a4.5 4.5 0 0 0-3.08 3.08l-1.1 3.9a.9.9 0 0 1-1.72 0l-1.1-3.9a4.5 4.5 0 0 0-3.08-3.08l-3.9-1.1a.9.9 0 0 1 0-1.72l3.9-1.1a4.5 4.5 0 0 0 3.08-3.08l1.1-3.9A.9.9 0 0 1 12 2.5Z" />
  </svg>
);
