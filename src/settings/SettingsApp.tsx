import { motion } from "motion/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { GearIcon, GridIcon, InfoIcon, PaletteIcon } from "../components/icons";
import { useSyncLocale, useT } from "../core/i18n";
import { useSettings } from "../core/settings";
import { NavItem, NavSection } from "./components/NavItem";
import { TitleBar } from "./components/TitleBar";
import { AboutPage } from "./pages/AboutPage";
import { AppearancePage } from "./pages/AppearancePage";
import { GeneralPage } from "./pages/GeneralPage";
import { ModulePage } from "./pages/ModulePage";
import { ModulesPage } from "./pages/ModulesPage";

/**
 * Settings window: frameless, with a sidebar in two groups — the app itself
 * (general, appearance) and the island's modules (one page listing them all,
 * each opening its own settings) — plus about. Pages are routes in a
 * `MemoryRouter`, since the window has no URL.
 */
export function SettingsApp() {
	const values = useSettings();
	const t = useT();
	useSyncLocale();

	return (
		<MemoryRouter>
			<div className="flex h-full flex-col" data-settings>
				<TitleBar />
				<div className="flex min-h-0 flex-1">
					<nav className="flex w-53 flex-none flex-col gap-0.5 px-2.5 pt-2 pb-4">
						<NavSection label={t("settings.section.app")} />
						<NavItem to="/" icon={<GearIcon size={15} />} label={t("settings.general")} />
						<NavItem to="/appearance" icon={<PaletteIcon size={15} />} label={t("appearance.title")} />
						<NavSection label={t("settings.section.island")} />
						{/* Stays highlighted on each module's own page too. */}
						<NavItem to="/modules" end={false} icon={<GridIcon size={14} />} label={t("modules.title")} />
						<div className="flex-1" />
						<NavItem to="/about" icon={<InfoIcon size={15} />} label={t("settings.about.title")} />
					</nav>
					<main className="min-w-0 flex-1 overflow-y-auto rounded-tl-xl bg-[#121217] shadow-[inset_1px_1px_0_var(--hairline)] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-3 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/12 [&::-webkit-scrollbar-thumb]:bg-clip-padding">
						<Page>
							<Routes>
								<Route index element={<GeneralPage values={values} />} />
								<Route path="appearance" element={<AppearancePage values={values} />} />
								<Route path="modules" element={<ModulesPage values={values} />} />
								<Route path="modules/:id" element={<ModulePage values={values} />} />
								<Route path="about" element={<AboutPage />} />
							</Routes>
						</Page>
					</main>
				</div>
			</div>
		</MemoryRouter>
	);
}

/** Fades each page in when the route changes. */
function Page({ children }: { children: ReactNode }) {
	const { pathname } = useLocation();
	return (
		<motion.div
			key={pathname}
			className="mx-auto flex max-w-170 flex-col gap-3.5 px-9 pt-7 pb-10 select-text"
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
		>
			{children}
		</motion.div>
	);
}
