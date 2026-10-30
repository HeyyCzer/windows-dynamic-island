import { Fragment, type ReactNode } from "react";

/** Just enough Markdown for chat answers: **bold**, `code`, bullet lists and headings. */
export function Formatted({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return (
    <>
      {lines.map((raw, i) => {
        const trimmed = raw.trimStart();
        let line = raw;
        let heading = false;
        if (trimmed.startsWith("#")) {
          line = trimmed.replace(/^#+\s*/, "");
          heading = true;
        } else if (/^[-*] /.test(trimmed)) {
          line = `${" ".repeat(raw.length - trimmed.length)}•  ${trimmed.slice(2)}`;
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are derived from the text, never reordered
          <Fragment key={i}>
            {i > 0 && <br />}
            {heading ? <strong>{inline(line)}</strong> : inline(line)}
          </Fragment>
        );
      })}
    </>
  );
}

function inline(line: string): ReactNode[] {
  return line
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((part, i) => {
      // biome-ignore lint/suspicious/noArrayIndexKey: parts are derived from the line, never reordered
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      // biome-ignore lint/suspicious/noArrayIndexKey: parts are derived from the line, never reordered
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      // biome-ignore lint/suspicious/noArrayIndexKey: parts are derived from the line, never reordered
      return <Fragment key={i}>{part}</Fragment>;
    });
}
