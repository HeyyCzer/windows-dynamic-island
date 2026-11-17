import { ChevronDownIcon, LayoutGridIcon, PuzzleIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useLocation } from "react-router";
import { cn } from "../../core/cn";
import { useT } from "../../core/i18n";
import { useAllModules } from "../../core/plugins/modules";
import { inOrder, layoutSettings, moduleEnabled, readSetting } from "../../core/settings";
import { NavItem } from "./NavItem";

/** Whether the list is unfolded, kept per viewer (it's only a convenience). */
const OPEN_KEY = "settings.nav.modulesOpen";

function storedOpen() {
	try {
		return localStorage.getItem(OPEN_KEY) !== "0";
	} catch {
		return true;
	}
}

/**
 * "Modules" in the sidebar, with every module folded under it: each module's
 * settings one click away instead of behind the modules list.
 */
export function ModulesNav({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const modules = useAllModules();
	const ordered = inOrder(modules, (m) => m.id, readSetting(values, layoutSettings.order));
	const { pathname } = useLocation();
	const [open, setOpen] = useState(storedOpen);
	// On a module's page the list stays unfolded: the page is highlighted in it.
	const shown = open || pathname.startsWith("/modules/");

	const toggle = () => {
		const next = !shown;
		setOpen(next);
		try {
			localStorage.setItem(OPEN_KEY, next ? "1" : "0");
		} catch {}
	};

	return (
		<>
			<div className="relative">
				{/* Folded, "Modules" stays highlighted on a module's page; unfolded, the module is. */}
				<NavItem to="/modules" end={shown} icon={<LayoutGridIcon size={14} />} label={t("modules.title")} />
				<button
					type="button"
					aria-expanded={shown}
					title={t(shown ? "settings.nav.fold" : "settings.nav.unfold")}
					className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-text-faint transition-colors hover:bg-white/6 hover:text-text"
					onClick={toggle}
				>
					<ChevronDownIcon size={14} className={cn("transition-transform duration-200", !shown && "-rotate-90")} />
				</button>
			</div>
			<AnimatePresence initial={false}>
				{shown && (
					<motion.div
						className="flex flex-col gap-px overflow-hidden pl-3.5"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						{ordered.map((m) => (
							<NavItem
								key={m.id}
								to={`/modules/${m.id}`}
								size="sm"
								icon={m.settingsIcon ?? <PuzzleIcon size={13} />}
								label={t(m.title)}
								off={!readSetting(values, moduleEnabled(m))}
							/>
						))}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
