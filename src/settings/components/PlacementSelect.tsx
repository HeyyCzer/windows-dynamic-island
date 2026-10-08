import { useT } from "../../core/i18n";
import { placementOf, setPlacement, useSettings, type Placement } from "../../core/settings";

/** Where a module's tab goes (tab bar always / when in use, or launcher only). */
export function PlacementSelect({ moduleId, disabled, className = "" }: { moduleId: string; disabled?: boolean; className?: string }) {
  const t = useT();
  const values = useSettings();
  const placement = placementOf(values, moduleId);
  return (
    <select
      className={`settings-select ${className} ${placement === "launcher" ? "" : "is-on"}`}
      disabled={disabled}
      title={t("layout.place")}
      value={placement}
      onChange={(e) => setPlacement(values, moduleId, e.target.value as Placement)}
    >
      <option value="always">{t("layout.inBarAlways")}</option>
      <option value="bar">{t("layout.inBar")}</option>
      <option value="launcher">{t("layout.inLauncher")}</option>
    </select>
  );
}
