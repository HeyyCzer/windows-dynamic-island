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
