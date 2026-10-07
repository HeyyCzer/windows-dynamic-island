import { useRef, useState, type PointerEvent } from "react";
import { Glyph } from "../../../components/Glyph";
import { providerAction } from "../../../core/bridge";
import { useT, type Translate } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { formatAgo, useNow } from "../../ai-agents/common/format";
import { attachFiles, draftRequest, requestAskFocus } from "../../ask/store";
import { addToShelf } from "../../shelf/actions";
import { CLIPBOARD_PROVIDER, CLIPBOARD_YELLOW, clipAction, type ClipboardState, type ClipItem } from "../types";

const DRAG_THRESHOLD = 5;
/** How long "Copied!" / "Kept" stays on a row. */
const FEEDBACK_MS = 1400;

/** What the item is, on one line ("Picture 1920×1080", "3 files", the text). */
export function clipTitle(t: Translate, item: ClipItem): string {
  if (item.kind === "image") {
    return item.screenshot ? t("clipboard.screenshot") : t("clipboard.picture", { w: item.width ?? 0, h: item.height ?? 0 });
  }
  if (item.kind === "files") return item.names.length === 1 ? item.names[0] : t("clipboard.files", { n: item.names.length });
  return item.preview ?? "";
}

/**
 * The latest picture, shown big while it's fresh (a screenshot that just
 * opened the island), then the history. `hero` comes from the module view so
 * the panel size matches.
 */
export function ClipboardPanel({ state, hero }: { state: ClipboardState | undefined; hero: boolean }) {
  const t = useT();
  const items = state?.items ?? [];
  const [first, ...rest] = items;

  return (
    <div className="clip-panel" onClick={(e) => e.stopPropagation()}>
      <div className="clip-head">
        <span className="clip-hint">{items.length ? t("clipboard.hint") : t("clipboard.empty")}</span>
        {items.length > 0 && (
          <button className="clip-clear" onClick={() => providerAction(CLIPBOARD_PROVIDER, "clear")}>
            {t("clipboard.clear")}
          </button>
        )}
      </div>
      {hero && first ? (
        <>
          <Hero item={first} />
          <ul className="clip-list" data-scroll>
            {rest.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        </>
      ) : (
        <ul className="clip-list" data-scroll>
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
          {!items.length && (
            <li className="clip-empty">
              <Glyph name="clipboard" size={22} />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Actions shared by rows and the hero, with a short confirmation. */
function useItemActions(item: ClipItem) {
  const island = useIsland();
  const [done, setDone] = useState<"copied" | "kept" | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flash = (what: "copied" | "kept") => {
    setDone(what);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(null), FEEDBACK_MS);
  };

  return {
    done,
    copy: () => clipAction("copy", item.id).then(() => flash("copied")),
    keep: async () => {
      const paths = await clipAction<string[]>("keep", item.id);
      if (paths?.length) {
        await addToShelf(paths);
        flash("kept");
      }
    },
    ask: async () => {
      if (item.kind === "text") {
        const text = await clipAction<string>("text", item.id);
        if (text) draftRequest.set(text);
      } else if (item.kind === "image" && item.path) {
        await attachFiles([item.path]);
      } else {
        const paths = await clipAction<string[]>("keep", item.id);
        if (paths?.length) await attachFiles(paths);
      }
      requestAskFocus();
      island.expand("ask");
    },
    open: () => clipAction("open", item.id),
    remove: () => clipAction("remove", item.id),
  };
}

/** Drag a picture or files out of the island to any app. */
function useDragOut(item: ClipItem) {
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  if (item.kind === "text") return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest("button")) return;
      press.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerMove: (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId || (e.buttons & 1) === 0) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
      press.current = null;
      clipAction("drag", item.id);
    },
    onPointerUp: () => (press.current = null),
  };
}

function Visual({ item, size }: { item: ClipItem; size: number }) {
  if (item.kind === "image" && item.thumb) {
    return <img className="clip-thumb" src={item.thumb} alt="" draggable={false} style={{ width: size, height: size }} />;
  }
  return (
    <span className="clip-icon" style={{ width: size, height: size }}>
      <Glyph name={item.kind === "files" ? "folder" : "text"} size={size * 0.42} color={item.kind === "files" ? "#64D2FF" : CLIPBOARD_YELLOW} />
    </span>
  );
}

function Meta({ item }: { item: ClipItem }) {
  const t = useT();
  const now = useNow(30_000);
  const parts = [
    item.kind === "text" && item.chars != null && item.chars > 40 ? t("clipboard.chars", { n: item.chars }) : null,
    item.kind === "files" && item.names.length > 1 ? item.names.slice(0, 3).join(", ") : null,
    item.source,
    formatAgo(t, item.copiedAt, now),
  ].filter(Boolean);
  return <span className="clip-meta">{parts.join(" · ")}</span>;
}

function Row({ item }: { item: ClipItem }) {
  const t = useT();
  const a = useItemActions(item);
  const drag = useDragOut(item);

  return (
    <li className="clip-row" title={t("clipboard.copy")} data-no-drag onClick={a.copy} {...drag}>
      <Visual item={item} size={36} />
      <div className="clip-texts">
        <span className={`clip-title ${item.kind === "text" ? "is-text" : ""}`}>{clipTitle(t, item)}</span>
        {a.done ? <span className="clip-done">✓ {t(a.done === "copied" ? "clipboard.copiedAgain" : "clipboard.kept")}</span> : <Meta item={item} />}
      </div>
      <div className="clip-actions">
        <IconButton icon="chat" label={t("clipboard.ask")} onClick={a.ask} />
        {item.kind !== "text" && <IconButton icon="folder" label={t("clipboard.keep")} onClick={a.keep} />}
        <IconButton icon="×" label={t("clipboard.remove")} onClick={a.remove} />
      </div>
    </li>
  );
}

function Hero({ item }: { item: ClipItem }) {
  const t = useT();
  const a = useItemActions(item);
  const drag = useDragOut(item);

  return (
    <div className="clip-hero" data-no-drag {...drag}>
      {item.thumb && <img className="clip-hero-img" src={item.thumb} alt="" draggable={false} />}
      <div className="clip-hero-side">
        <span className="clip-title">{clipTitle(t, item)}</span>
        {a.done ? <span className="clip-done">✓ {t(a.done === "copied" ? "clipboard.copiedAgain" : "clipboard.kept")}</span> : <Meta item={item} />}
        <div className="clip-hero-buttons">
          <button className="clip-pill" title={t("clipboard.copy")} onClick={a.copy}>
            <Glyph name="copy" size={11} /> {t("clipboard.short.copy")}
          </button>
          <button className="clip-pill" title={t("clipboard.ask")} onClick={a.ask}>
            <Glyph name="chat" size={11} /> {t("clipboard.short.ask")}
          </button>
          <button className="clip-pill" title={t("clipboard.keep")} onClick={a.keep}>
            <Glyph name="folder" size={11} /> {t("clipboard.short.keep")}
          </button>
          <button className="clip-pill" title={t("clipboard.open")} onClick={a.open}>
            <Glyph name="open" size={11} /> {t("clipboard.open")}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      className="clip-btn"
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon.length === 1 ? icon : <Glyph name={icon} size={11} />}
    </button>
  );
}
