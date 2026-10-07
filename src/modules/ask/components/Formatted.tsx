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
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      return <Fragment key={i}>{part}</Fragment>;
    });
}
