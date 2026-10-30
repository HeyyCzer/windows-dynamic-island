import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppLogo } from "../../components/icons";
import { isTauri } from "../../core/bridge";
import { useT } from "../../core/i18n";

/** Custom titlebar: the window is frameless (see `settings.rs`). */
export function TitleBar() {
	const t = useT();
	const win = () => (isTauri ? getCurrentWindow() : null);
	return (
		<header className="flex h-10 flex-none items-center justify-between bg-[#0c0c10] pl-4" data-tauri-drag-region>
			<div className="flex items-center gap-2 text-[12px] font-semibold text-text-dim" data-tauri-drag-region>
				<AppLogo className="pointer-events-none flex-none" />
				Dynamic Island
				<span className="pointer-events-none font-medium text-text-faint">·</span>
				<span className="pointer-events-none font-medium text-text-faint">{t("settings.subtitle")}</span>
			</div>
			<div className="flex self-stretch">
				<button
					type="button"
					className="grid w-11.5 place-items-center text-text-dim transition-colors duration-120 hover:bg-white/7 hover:text-text"
					aria-label={t("settings.minimize")}
					onClick={() => win()?.minimize()}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
						<path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
					</svg>
				</button>
				<button
					type="button"
					className="grid w-11.5 place-items-center text-text-dim transition-colors duration-120 hover:bg-white/7 hover:text-text hover:bg-[#c42b1c] hover:text-white"
					aria-label={t("settings.close")}
					onClick={() => win()?.close()}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
						<path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
					</svg>
				</button>
			</div>
		</header>
	);
}
