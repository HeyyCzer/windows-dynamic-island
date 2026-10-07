import { Glyph } from "../../../components/Glyph";
import { Marquee } from "../../../components/Marquee";
import { useT } from "../../../core/i18n";
import { CLIPBOARD_YELLOW, type ClipItem } from "../types";
import { clipTitle } from "./ClipboardPanel";

/** Left slot of the "just copied" pill: the picture or an icon, and what it is. */
export function ClipboardCompactLeft({ item }: { item: ClipItem }) {
  const t = useT();
  return (
    <>
      {item.kind === "image" && item.thumb ? (
        <img className="clip-compact-thumb" src={item.thumb} alt="" draggable={false} />
      ) : (
        <span className="clip-compact-icon">
          <Glyph name={item.kind === "files" ? "folder" : "clipboard"} size={12} color={CLIPBOARD_YELLOW} />
        </span>
      )}
      <Marquee text={clipTitle(t, item)} className="clip-compact-title" />
    </>
  );
}

export function ClipboardCompactRight() {
  const t = useT();
  return (
    <span className="clip-compact-label">
      <Glyph name="check" size={10} /> {t("clipboard.copied")}
    </span>
  );
}
