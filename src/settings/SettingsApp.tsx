import { motion } from "motion/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { GearIcon, InfoIcon, PaletteIcon } from "../components/icons";
import { useSyncLocale, useT } from "../core/i18n";
import { moduleEnabled, readSetting, useSettings } from "../core/settings";
import { modules } from "../modules";
import { NavItem } from "./components/NavItem";
import { TitleBar } from "./components/TitleBar";
import { AboutPage } from "./pages/AboutPage";
import { AppearancePage } from "./pages/AppearancePage";
import { GeneralPage } from "./pages/GeneralPage";
import { ModulePage } from "./pages/ModulePage";
import "./settings.css";

/**
 * Settings window: frameless, with a sidebar (general, one entry per module,
 * about). Pages are routes in a `MemoryRouter`, since the window has no URL.
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
            <NavItem to="/" icon={<GearIcon size={15} />} label={t("settings.general")} />
            <NavItem to="/appearance" icon={<PaletteIcon size={15} />} label={t("appearance.title")} />
            {modules.map((m) => (
              <NavItem
                key={m.id}
                to={`/modules/${m.id}`}
                icon={m.settingsIcon}
                label={t(m.title)}
                off={!readSetting(values, moduleEnabled(m.id, m.title))}
              />
            ))}
            <div className="settings-nav-spacer" />
            <NavItem to="/about" icon={<InfoIcon size={15} />} label={t("settings.about.title")} />
          </nav>
          <main className="settings-content">
            <Page>
              <Routes>
                <Route index element={<GeneralPage values={values} />} />
                <Route path="appearance" element={<AppearancePage values={values} />} />
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
