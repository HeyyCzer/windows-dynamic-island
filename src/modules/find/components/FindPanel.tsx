import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Glyph } from "../../../components/Glyph";
import { command, providerAction } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { FIND_PROVIDER, FIND_YELLOW, focusRequest, type FindState } from "../types";

/** Typing highlights the matches on the screen; Enter takes the mouse to the next one. */
export function FindPanel({ state }: { state: FindState | undefined }) {
  const t = useT();
  const island = useIsland();
  const focusPending = focusRequest.use();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const scanning = !!state?.scanning;

  // Leaving the page ends the search: the highlights go away.
  useEffect(
    () => () => {
      providerAction(FIND_PROVIDER, "clear");
      island.keepOpen(false, "find");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Global shortcut: take the keyboard.
  useEffect(() => {
    if (!focusPending) return;
    focusRequest.set(false);
    takeKeyboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPending]);

  // The highlights follow what's typed.
  useEffect(() => {
    const timer = window.setTimeout(() => providerAction(FIND_PROVIDER, "search", { query }), 80);
    return () => window.clearTimeout(timer);
  }, [query]);

  function takeKeyboard() {
    island.keepOpen(true, "find");
    command("focus_island");
    window.setTimeout(() => input.current?.focus(), 30);
  }

  function step(action: "next" | "prev") {
    providerAction(FIND_PROVIDER, action);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      step(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? "prev" : "next");
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      providerAction(FIND_PROVIDER, "clear");
      input.current?.blur();
      command("restore_focus");
      island.collapse();
    }
  }

  // The buttons leave the keyboard in the field.
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  const count = state?.count ?? 0;
  const counter = scanning
    ? "…"
    : !query.trim() || !state?.scanned
      ? ""
      : count
        ? t("find.counter", { n: (state.current ?? 0) + 1, total: count })
        : t("find.counter", { n: 0, total: 0 });
  const hint =
    state?.error === "noOcr"
      ? t("find.noOcr")
      : state?.error
        ? state.error
        : scanning
          ? t("find.reading")
          : query.trim() && state?.scanned && !count
            ? t("find.none")
            : t("find.hint");

  return (
    <div className="find-panel" onClick={(e) => e.stopPropagation()}>
      <div className="find-field" data-no-drag>
        <Glyph name="search" size={14} color={FIND_YELLOW} />
        <input
          ref={input}
          value={query}
          placeholder={t("find.placeholder")}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onMouseDown={takeKeyboard}
          onFocus={() => {
            island.keepOpen(true, "find");
            // A new search reads the screen as it is now.
            if (!scanning) providerAction(FIND_PROVIDER, "scan");
          }}
          onBlur={() => island.keepOpen(false, "find")}
        />
        <span className={`find-count ${query.trim() && state?.scanned && !count ? "is-none" : ""}`}>{counter}</span>
        <button className="find-btn" title={t("find.prev")} disabled={!count} onMouseDown={keepFocus} onClick={() => step("prev")}>
          <Glyph name="chevron-up" size={12} />
        </button>
        <button className="find-btn" title={t("find.next")} disabled={!count} onMouseDown={keepFocus} onClick={() => step("next")}>
          <Glyph name="chevron-down" size={12} />
        </button>
        <button
          className="find-btn"
          title={t("find.rescan")}
          disabled={scanning}
          onMouseDown={keepFocus}
          onClick={() => providerAction(FIND_PROVIDER, "scan")}
        >
          <Glyph name="refresh" size={12} />
        </button>
      </div>
      <div className={`find-hint ${state?.error ? "is-error" : ""}`}>{hint}</div>
    </div>
  );
}
