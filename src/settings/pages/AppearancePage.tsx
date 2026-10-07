import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { BORDER_PRESETS, borderColors, PALETTE, rimBackground, swatchBackground, THICKNESSES } from "../../core/appearance";
import { useT } from "../../core/i18n";
import { appearanceSettings, ISLAND_HIDDEN_KEY, readSetting, setSetting, type IslandStyle } from "../../core/settings";
import { Toggle, ToggleRow } from "../components/Toggle";

const STYLES: { id: IslandStyle; name: "appearance.style.dynamic" | "appearance.style.windows"; desc: "appearance.style.dynamicDesc" | "appearance.style.windowsDesc" }[] = [
  { id: "dynamic", name: "appearance.style.dynamic", desc: "appearance.style.dynamicDesc" },
  { id: "windows", name: "appearance.style.windows", desc: "appearance.style.windowsDesc" },
];

/** Look of the island: the visual style and, for Windows Island, its rim. */
export function AppearancePage({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  const style = readSetting(values, appearanceSettings.style);
  const border = readSetting(values, appearanceSettings.border);
  const custom = readSetting(values, appearanceSettings.customColors);
  const thickness = readSetting(values, appearanceSettings.thickness);
  const rim = borderColors(border, custom);
  const windows = style === "windows";
  const hidden = values[ISLAND_HIDDEN_KEY] === true;

  return (
    <>
      <h1 className="settings-title">{t("appearance.title")}</h1>

      <section className="settings-card">
        <div className="settings-block">
          <div className="settings-row">
            <div className="settings-text">
              <span className="settings-label">{t("appearance.style.label")}</span>
              <span className="settings-desc">{t("appearance.style.desc")}</span>
            </div>
          </div>
          <div className="style-picker">
            {STYLES.map((s) => (
              <button
                key={s.id}
                className={`style-option ${style === s.id ? "is-active" : ""}`}
                onClick={() => setSetting(appearanceSettings.style, s.id)}
              >
                <StylePreview style={s.id} rim={s.id === "windows" ? rim : []} />
                <span className="style-name">{t(s.name)}</span>
                <span className="settings-desc">{t(s.desc)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <motion.section
        className="settings-card"
        initial={false}
        animate={{ opacity: windows ? 1 : 0.4 }}
        style={{ pointerEvents: windows ? "auto" : "none" }}
      >
        <div className="settings-block">
          <div className="settings-row">
            <div className="settings-text">
              <span className="settings-label">{t("appearance.border.label")}</span>
              <span className="settings-desc">{windows ? t("appearance.border.desc") : t("appearance.windowsOnly")}</span>
            </div>
            <span className="settings-unit">
              {border === "custom" ? t("appearance.preset.custom") : t(BORDER_PRESETS.find((p) => p.id === border)?.name ?? "appearance.preset.none")}
            </span>
          </div>
          <div className="swatches">
            {BORDER_PRESETS.map((p) => (
              <Swatch
                key={p.id}
                fill={swatchBackground(p.colors)}
                outlined={!p.colors.length}
                title={t(p.name)}
                selected={border === p.id}
                onPick={() => setSetting(appearanceSettings.border, p.id)}
              />
            ))}
            <Swatch
              fill={swatchBackground(custom)}
              title={t("appearance.preset.custom")}
              selected={border === "custom"}
              onPick={() => setSetting(appearanceSettings.border, "custom")}
              edit
            />
          </div>
          {border === "custom" &&
            [0, 1].map((index) => (
              <div key={index} className="palette-row">
                <span className="settings-desc">{t(index ? "appearance.custom.end" : "appearance.custom.start")}</span>
                <div className="swatches">
                  {PALETTE.map((color) => (
                    <Swatch
                      key={color}
                      small
                      fill={color}
                      title={color}
                      selected={custom[index]?.toLowerCase() === color.toLowerCase()}
                      onPick={() => {
                        const next = [custom[0] ?? PALETTE[7], custom[1] ?? PALETTE[4]];
                        next[index] = color;
                        setSetting(appearanceSettings.customColors, next);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div className={`settings-row ${rim.length ? "" : "is-disabled"}`}>
          <div className="settings-text">
            <span className="settings-label">{t("appearance.thickness.label")}</span>
          </div>
          <div className="segmented">
            {THICKNESSES.map((n) => (
              <button
                key={n}
                className={thickness === n ? "is-active" : ""}
                disabled={!rim.length}
                onClick={() => setSetting(appearanceSettings.thickness, n)}
              >
                {t(`appearance.thickness.${n}`)}
              </button>
            ))}
          </div>
        </div>
        <ToggleRow def={appearanceSettings.animate} value={readSetting(values, appearanceSettings.animate)} />
        <ToggleRow def={appearanceSettings.glow} value={readSetting(values, appearanceSettings.glow)} />
        <ToggleRow def={appearanceSettings.idleClock} value={readSetting(values, appearanceSettings.idleClock)} />
      </motion.section>

      <section className="settings-card">
        <label className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("appearance.hide.label")}</span>
            <span className="settings-desc">{t("appearance.hide.desc")}</span>
          </div>
          <Toggle checked={hidden} onChange={(v) => setSetting(ISLAND_HIDDEN_KEY, v)} />
        </label>
      </section>
    </>
  );
}

/** A miniature of each look. */
function StylePreview({ style, rim }: { style: IslandStyle; rim: string[] }) {
  const background = rimBackground(rim);
  return (
    <div className={`style-preview is-${style}`}>
      <div className="style-preview-island">
        {style === "windows" && (
          <span
            className={`rim ${background ? "" : "is-classic"}`}
            style={{ "--rim-bg": background, "--rim-w": "1.5px" } as CSSProperties}
          />
        )}
        {style === "windows" && <span className="style-preview-time">9:41</span>}
      </div>
    </div>
  );
}

function Swatch({
  fill,
  title,
  selected,
  onPick,
  outlined,
  small,
  edit,
}: {
  fill: string;
  title: string;
  selected: boolean;
  onPick: () => void;
  outlined?: boolean;
  small?: boolean;
  edit?: boolean;
}) {
  return (
    <button
      className={`swatch ${selected ? "is-selected" : ""} ${small ? "is-small" : ""}`}
      title={title}
      aria-pressed={selected}
      onClick={onPick}
    >
      <span className={`swatch-fill ${outlined ? "is-outlined" : ""}`} style={{ background: fill }}>
        {edit && "✎"}
      </span>
    </button>
  );
}
