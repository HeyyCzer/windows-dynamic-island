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
import "./settings.css";

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
      <div className="settings">
        <TitleBar />
        <div className="settings-main">
          <nav className="settings-nav">
            <NavSection label={t("settings.section.app")} />
            <NavItem to="/" icon={<GearIcon size={15} />} label={t("settings.general")} />
            <NavItem to="/appearance" icon={<PaletteIcon size={15} />} label={t("appearance.title")} />
            <NavSection label={t("settings.section.island")} />
            {/* Stays highlighted on each module's own page too. */}
            <NavItem to="/modules" end={false} icon={<GridIcon size={14} />} label={t("modules.title")} />
            <div className="settings-nav-spacer" />
            <NavItem to="/about" icon={<InfoIcon size={15} />} label={t("settings.about.title")} />
          </nav>
          <main className="settings-content">
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
      className="settings-page"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
