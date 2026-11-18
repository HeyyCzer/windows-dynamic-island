import { ChevronDownIcon, LayoutGridIcon, PuzzleIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../core/cn";
import { useT } from "../../core/i18n";
import { useOrderedModules } from "../../core/plugins/modules";
import { moduleEnabled, readSetting } from "../../core/settings";
import { usePersisted } from "../../core/usePersisted";
import { NavItem } from "./NavItem";

/** Whether the list is unfolded; folded at first, so the sidebar stays short. */
const OPEN_KEY = "settings.nav.modulesOpen";

/**
 * "Modules" in the sidebar, with every module folded under it: each module's
 * settings one click away instead of behind the modules list.
 */
export function ModulesNav({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const ordered = useOrderedModules(values);
	const [open, setOpen] = usePersisted(OPEN_KEY, false);

	return (
		<>
			<div className="relative">
				{/* Folded, "Modules" stays highlighted on a module's page; unfolded, the module is. */}
				<NavItem
					to="/modules"
					end={open}
					icon={<LayoutGridIcon size={14} />}
					label={t("modules.title")}
					className="pr-9"
				/>
				<button
					type="button"
					aria-expanded={open}
					title={t(open ? "settings.nav.fold" : "settings.nav.unfold")}
					className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-text-faint transition-colors hover:bg-white/6 hover:text-text"
					onClick={() => setOpen(!open)}
				>
					<ChevronDownIcon size={14} className={cn("transition-transform duration-200", !open && "-rotate-90")} />
				</button>
			</div>
			<AnimatePresence initial={false}>
				{open && (
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
								icon={m.settingsIcon ?? <PuzzleIcon />}
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
