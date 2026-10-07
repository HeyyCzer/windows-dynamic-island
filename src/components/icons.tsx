import { useId, type SVGProps } from "react";

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

/** The app icon (same artwork as `src-tauri/app-icon.svg`). */
export function AppLogo({ size = 16, ...rest }: P) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="64 64 896 896" aria-hidden {...rest}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2d5c" />
          <stop offset="1" stopColor="#0d0e1c" />
        </linearGradient>
      </defs>
      <rect x="64" y="64" width="896" height="896" rx="220" fill={`url(#${gradient})`} />
      <rect x="212" y="400" width="600" height="224" rx="112" fill="#000" stroke="#8f94ff" strokeWidth="24" strokeOpacity=".7" />
      <circle cx="324" cy="512" r="56" fill="#d97757" />
    </svg>
  );
}

export const InfoIcon = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 16.5v-5M12 8h.01" />
  </svg>
);

export const GitHubIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.84c-2.92.63-3.54-1.4-3.54-1.4-.48-1.22-1.17-1.54-1.17-1.54-.95-.65.08-.64.08-.64 1.05.08 1.6 1.08 1.6 1.08.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.18 0-1.14.4-2.08 1.08-2.81-.11-.27-.47-1.34.1-2.78 0 0 .88-.28 2.89 1.07a10 10 0 0 1 5.26 0c2-1.35 2.88-1.07 2.88-1.07.58 1.44.22 2.51.11 2.78.67.73 1.08 1.67 1.08 2.8 0 4.03-2.46 4.91-4.8 5.17.38.33.71.97.71 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z" />
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

export const IssueIcon = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const RefreshIcon = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.5" />
    <path d="M20 3.5v5h-5" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const PaletteIcon = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
