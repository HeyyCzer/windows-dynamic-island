/** Starburst glyph in Claude's orange. */
export function ClaudeIcon({ size }: { size: number }) {
  const rays = 10;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {Array.from({ length: rays }, (_, i) => (
        <rect
          key={i}
          x="11"
          y="1.5"
          width="2"
          height="10.5"
          rx="1"
          transform={`rotate(${(360 / rays) * i + (i % 2 ? 8 : 0)} 12 12)`}
          style={{ transformBox: "view-box" }}
          opacity={i % 2 ? 0.85 : 1}
        />
      ))}
    </svg>
  );
}
