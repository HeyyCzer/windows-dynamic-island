import { useRef, type PointerEvent } from "react";
import { Glyph } from "../../../components/Glyph";
import { providerAction } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { draggingFiles, useIsland } from "../../../core/island";
import { attachFiles, requestAskFocus, useAskEnabled } from "../../ask/store";
import { SHELF_PROVIDER, shelfAction, type ShelfItem, type ShelfState } from "../actions";

const DRAG_THRESHOLD = 5;

/** Files dropped on the island; drag them out to any app, double-click to open. */
export function ShelfPanel({ state }: { state: ShelfState | undefined }) {
  const t = useT();
  const dragging = draggingFiles.use();
  const items = state?.items ?? [];

  return (
    <div className="shelf-panel" onClick={(e) => e.stopPropagation()}>
      <div className="shelf-head">
        <span className="shelf-hint">{items.length ? t("shelf.hint") : t("shelf.empty")}</span>
        {items.length > 0 && (
          <button className="shelf-clear" onClick={() => providerAction(SHELF_PROVIDER, "clear")}>
            {t("shelf.clear")}
          </button>
        )}
      </div>
      <div className={`shelf-items ${dragging ? "is-dropping" : ""}`} data-scroll>
        {items.map((item) => (
          <Tile key={item.path} item={item} />
        ))}
        {!items.length && (
          <div className="shelf-drop">
            <Glyph name="download" size={22} />
            <span>{t("shelf.drop")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ item }: { item: ShelfItem }) {
  const t = useT();
  const island = useIsland();
  const askEnabled = useAskEnabled();
  const press = useRef<{ x: number; y: number; id: number } | null>(null);

  // Drag it out to any app (Explorer, WhatsApp, an e-mail…): the OS takes
  // over the drag once the pointer has moved a little with the button down.
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.stopPropagation();
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId || (e.buttons & 1) === 0) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
    press.current = null;
    shelfAction("drag", item.path);
  };

  return (
    <div
      className="shelf-tile"
      title={item.path}
      data-no-drag
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (press.current = null)}
      onDoubleClick={() => shelfAction("open", item.path)}
    >
      <div className={`shelf-icon ${item.thumb ? "is-picture" : ""}`}>
        {item.thumb ? <img src={item.thumb} alt="" draggable={false} /> : <FileIcon item={item} />}
      </div>
      <span className="shelf-name">{item.name}</span>
      {askEnabled && (
        <button
          className="shelf-btn ask"
          title={t("shelf.ask")}
          onClick={() => {
            attachFiles([item.path]);
            requestAskFocus();
            island.expand("ask");
          }}
        >
          <Glyph name="chat" size={10} />
        </button>
      )}
      <button className="shelf-btn remove" title={t("shelf.remove")} onClick={() => shelfAction("remove", item.path)}>
        ×
      </button>
    </div>
  );
}

/** A generic document / folder icon with the extension on it. */
function FileIcon({ item }: { item: ShelfItem }) {
  if (item.isDir) return <Glyph name="folder" size={30} color="#64D2FF" />;
  return (
    <span className="shelf-doc">
      <span className="shelf-ext">{item.ext.slice(0, 4) || "?"}</span>
    </span>
  );
}
