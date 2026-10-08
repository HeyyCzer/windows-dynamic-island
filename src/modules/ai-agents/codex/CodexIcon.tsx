/** Rounded terminal with a `>_` prompt, in Codex's accent. */
export function CodexIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="3.5" width="19" height="17" rx="5" stroke="currentColor" strokeWidth="2" />
      <path d="M7.5 9.5l3 2.5-3 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
