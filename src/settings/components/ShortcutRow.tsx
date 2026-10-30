import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "../../components/ui/button";
import { Row } from "../../components/ui/card";
import { providerAction, useProvider } from "../../core/bridge";
import { cn } from "../../core/cn";
import { useT } from "../../core/i18n";
import { readSetting, setSetting } from "../../core/settings";
import {
	comboOf,
	modifiersOf,
	SHORTCUTS_PROVIDER,
	type ShortcutId,
	type ShortcutsState,
	shortcutSettings,
	showKeys,
} from "../../core/shortcuts";

/** A global shortcut: click, then press the new combination (Esc cancels). */
export function ShortcutRow({ id, values }: { id: ShortcutId; values: Record<string, unknown> }) {
	const t = useT();
	const def = shortcutSettings[id];
	const status = useProvider<ShortcutsState>(SHORTCUTS_PROVIDER)?.[id];
	const chosen = readSetting(values, def);
	const [recording, setRecording] = useState(false);
	const [held, setHeld] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!recording) return;
		// The current combination would fire instead of reaching this window.
		providerAction(SHORTCUTS_PROVIDER, "pause");
		const stop = () => setRecording(false);
		const onKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.type === "keyup") return setHeld(modifiersOf(e));
			if (e.code === "Escape" && !modifiersOf(e).length) return stop();
			const combo = comboOf(e);
			if (!combo) return setHeld(modifiersOf(e));
			const other = (Object.keys(shortcutSettings) as ShortcutId[]).find(
				(o) => o !== id && (readSetting(values, shortcutSettings[o]) ?? shortcutSettings[o].fallback) === combo,
			);
			if (other)
				setError(t("shortcuts.duplicate", { keys: showKeys(combo), action: t(shortcutSettings[other].label) }));
			else {
				setError(null);
				setSetting(def, combo);
			}
			stop();
		};
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("keyup", onKey, true);
		window.addEventListener("blur", stop);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("keyup", onKey, true);
			window.removeEventListener("blur", stop);
			setHeld([]);
			providerAction(SHORTCUTS_PROVIDER, "resume");
		};
	}, [recording, id, def, values, t]);

	const keys = chosen ?? def.fallback;
	const label = recording
		? held.length
			? `${showKeys(held.join("+"))}+…`
			: t("shortcuts.press")
		: keys
			? showKeys(status?.keys && chosen === null ? status.keys : keys)
			: t("shortcuts.off");
	const taken = !recording && status?.taken;

	return (
		<Row
			label={t("shortcuts.label")}
			desc={error ?? (taken ? t("shortcuts.taken", { keys: showKeys(taken) }) : t("shortcuts.desc"))}
			descTone={error || taken ? "error" : undefined}
		>
			<div className="flex flex-none items-center gap-2">
				{chosen !== null && (
					<button
						type="button"
						className="text-[12px] font-semibold text-text-faint hover:text-text"
						onClick={() => setSetting(def, null)}
					>
						{t("shortcuts.reset")}
					</button>
				)}
				<button
					type="button"
					className={cn(
						"h-8 min-w-30 rounded-[10px] bg-white/8 px-3 font-[Cascadia_Code,Consolas,monospace] text-[12px] text-text shadow-[inset_0_0_0_1px_var(--hairline)]",
						!keys && "text-text-faint",
						recording && "text-[#d97757] shadow-[inset_0_0_0_1.5px_#d97757]",
					)}
					onClick={() => {
						setError(null);
						setRecording((r) => !r);
					}}
				>
					{label}
				</button>
				{keys && !recording && (
					<IconButton size="sm" tone="danger" title={t("shortcuts.disable")} onClick={() => setSetting(def, "")}>
						<XIcon size={10} />
					</IconButton>
				)}
			</div>
		</Row>
	);
}
