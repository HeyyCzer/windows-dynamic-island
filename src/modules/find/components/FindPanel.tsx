import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { Glyph } from "../../../components/Glyph";
import { command, providerAction } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { useShortcutKeys } from "../../../core/shortcuts";
import { FIND_PROVIDER, FIND_YELLOW, type FindState, focusRequest } from "../store";

/** Typing highlights the matches on the screen; Enter takes the mouse to the next one. */
export function FindPanel({ state }: { state: FindState | undefined }) {
	const t = useT();
	const hotkey = useShortcutKeys("find");
	const island = useIsland();
	const focusPending = focusRequest.use();
	const [query, setQuery] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const scanning = !!state?.scanning;

	// Leaving the page ends the search: the highlights go away.
	// biome-ignore lint/correctness/useExhaustiveDependencies: unmount only
	useEffect(
		() => () => {
			providerAction(FIND_PROVIDER, "clear");
			island.keepOpen(false, "find");
		},
		[],
	);

	// Global shortcut: take the keyboard.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs only when a focus request arrives
	useEffect(() => {
		if (!focusPending) return;
		focusRequest.set(false);
		takeKeyboard();
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

	function scan() {
		providerAction(FIND_PROVIDER, "scan");
	}

	function onFocus() {
		island.keepOpen(true, "find");
		// The search starts: the screen is read as it is now, once. Coming back
		// to the field (Alt+Tab) keeps what was read; ↻ reads it again.
		if (!state?.scanned && !scanning && !state?.error) scan();
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
			// Right away, not once the page has animated out.
			providerAction(FIND_PROVIDER, "clear");
			input.current?.blur();
			command("restore_focus");
			island.collapse();
		}
	}

	// The buttons leave the keyboard in the field.
	const keepFocus = (e: MouseEvent) => e.preventDefault();

	const count = state?.count ?? 0;
	const searched = !!query.trim() && !!state?.scanned;
	const noMatch = searched && !count;

	let counter = "";
	if (scanning) counter = "…";
	else if (searched) counter = t("find.counter", { n: count ? (state?.current ?? 0) + 1 : 0, total: count });

	let hint: string;
	if (state?.error) hint = t(state.error === "noOcr" ? "find.noOcr" : "find.failed");
	else if (scanning) hint = t("find.reading");
	else if (noMatch) hint = t("find.none");
	else hint = hotkey ? `${t("find.hint")} · ${t("find.hotkey", { keys: hotkey })}` : t("find.hint");

	return (
		<div className="flex flex-col gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
			<div className="flex h-9.5 items-center gap-1.5 rounded-[19px] bg-white/7 pr-1.5 pl-3.5" data-no-drag>
				<Glyph name="search" size={14} color={FIND_YELLOW} />
				<input
					ref={input}
					className="h-full min-w-0 flex-1 bg-transparent px-1 text-[14px] text-text outline-none select-text placeholder:text-text-faint"
					value={query}
					placeholder={t("find.placeholder")}
					spellCheck={false}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={onKeyDown}
					onMouseDown={takeKeyboard}
					onFocus={onFocus}
					onBlur={() => island.keepOpen(false, "find")}
				/>
				<span
					className={cn(
						"min-w-11 flex-none text-right text-[12px] font-semibold tabular-nums text-text-dim",
						noMatch && "text-danger",
					)}
				>
					{counter}
				</span>
				<button
					type="button"
					className="size-7 flex-none grid place-items-center rounded-full text-text-dim enabled:hover:bg-white/10 enabled:hover:text-text disabled:cursor-default disabled:opacity-35"
					title={t("find.prev")}
					disabled={!count}
					onMouseDown={keepFocus}
					onClick={() => step("prev")}
				>
					<Glyph name="chevron-up" size={12} />
				</button>
				<button
					type="button"
					className="size-7 flex-none grid place-items-center rounded-full text-text-dim enabled:hover:bg-white/10 enabled:hover:text-text disabled:cursor-default disabled:opacity-35"
					title={t("find.next")}
					disabled={!count}
					onMouseDown={keepFocus}
					onClick={() => step("next")}
				>
					<Glyph name="chevron-down" size={12} />
				</button>
				<button
					type="button"
					className="size-7 flex-none grid place-items-center rounded-full text-text-dim enabled:hover:bg-white/10 enabled:hover:text-text disabled:cursor-default disabled:opacity-35"
					title={t("find.rescan")}
					disabled={scanning}
					onMouseDown={keepFocus}
					onClick={scan}
				>
					<Glyph name="refresh" size={12} />
				</button>
			</div>
			<div className={cn("truncate px-3.5 text-[11.5px] text-text-faint", state?.error && "text-danger")}>{hint}</div>
		</div>
	);
}
