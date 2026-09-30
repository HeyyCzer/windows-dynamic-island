import { motion } from "motion/react";
import { useT } from "../../core/i18n";
import { setSetting, type SettingDef } from "../../core/settings";

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
    >
      <motion.span className="toggle-knob" layout transition={{ type: "spring", stiffness: 600, damping: 32 }} />
    </button>
  );
}

/** A row bound to a boolean setting. */
export function ToggleRow({ def, value }: { def: SettingDef; value: boolean }) {
  const t = useT();
  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{t(def.label)}</span>
        {def.description && <span className="settings-desc">{t(def.description)}</span>}
      </div>
      <Toggle checked={value} onChange={(v) => setSetting(def, v)} />
    </label>
  );
}
