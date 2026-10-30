import { motion } from "motion/react";
import { RimRing } from "../../components/island/Rim";
import { Block, Card, card, Desc, Row } from "../../components/ui/card";
import { Segmented } from "../../components/ui/form";
import {
	BORDER_PRESETS,
	borderColors,
	PALETTE,
	rimBackground,
	swatchBackground,
	THICKNESSES,
} from "../../core/appearance";
import { cn } from "../../core/cn";
import { useT } from "../../core/i18n";
import { appearanceSettings, ISLAND_HIDDEN_KEY, type IslandStyle, readSetting, setSetting } from "../../core/settings";
import { Title } from "../components/Heading";
import { Toggle, ToggleRow } from "../components/Toggle";

const STYLES: {
	id: IslandStyle;
	name: "appearance.style.dynamic" | "appearance.style.windows";
	desc: "appearance.style.dynamicDesc" | "appearance.style.windowsDesc";
}[] = [
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
			<Title>{t("appearance.title")}</Title>

			<Card>
				<Block>
					<Row label={t("appearance.style.label")} desc={t("appearance.style.desc")} />
					<div className="grid grid-cols-2 gap-2.5">
						{STYLES.map((s) => (
							<button
								type="button"
								key={s.id}
								className={cn(
									"flex flex-col gap-1 rounded-xl bg-white/3 px-2.5 pt-2.5 pb-3 text-left shadow-[inset_0_0_0_1px_var(--hairline)] transition-[box-shadow,background] duration-200 hover:bg-white/5",
									style === s.id && "shadow-[inset_0_0_0_2px_var(--accent)]",
								)}
								onClick={() => setSetting(appearanceSettings.style, s.id)}
							>
								<StylePreview style={s.id} rim={s.id === "windows" ? rim : []} />
								<span className="mt-1.5 text-[13.5px] font-[650]">{t(s.name)}</span>
								<Desc>{t(s.desc)}</Desc>
							</button>
						))}
					</div>
				</Block>
			</Card>

			<motion.section
				className={card()}
				initial={false}
				animate={{ opacity: windows ? 1 : 0.4 }}
				style={{ pointerEvents: windows ? "auto" : "none" }}
			>
				<Block>
					<Row
						label={t("appearance.border.label")}
						desc={windows ? t("appearance.border.desc") : t("appearance.windowsOnly")}
					>
						<span className="text-[13px] text-text-dim">
							{border === "custom"
								? t("appearance.preset.custom")
								: t(BORDER_PRESETS.find((p) => p.id === border)?.name ?? "appearance.preset.none")}
						</span>
					</Row>
					<div className="flex flex-wrap gap-1.5">
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
							<div key={index} className="flex flex-col gap-1">
								<Desc>{t(index ? "appearance.custom.end" : "appearance.custom.start")}</Desc>
								<div className="flex flex-wrap gap-1.5">
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
				</Block>

				<Row label={t("appearance.thickness.label")} disabled={!rim.length}>
					<Segmented
						options={THICKNESSES.map((n) => ({ value: n, label: t(`appearance.thickness.${n}`) }))}
						value={thickness}
						disabled={!rim.length}
						onChange={(n) => setSetting(appearanceSettings.thickness, n)}
					/>
				</Row>
				<ToggleRow def={appearanceSettings.animate} value={readSetting(values, appearanceSettings.animate)} />
				<ToggleRow def={appearanceSettings.glow} value={readSetting(values, appearanceSettings.glow)} />
				<ToggleRow def={appearanceSettings.idleClock} value={readSetting(values, appearanceSettings.idleClock)} />
			</motion.section>

			<Card>
				<Row as="label" label={t("appearance.hide.label")} desc={t("appearance.hide.desc")}>
					<Toggle checked={hidden} onChange={(v) => setSetting(ISLAND_HIDDEN_KEY, v)} />
				</Row>
			</Card>
		</>
	);
}

/** A miniature of each look. */
function StylePreview({ style, rim }: { style: IslandStyle; rim: string[] }) {
	const background = rimBackground(rim);
	return (
		<div className="relative h-18.5 overflow-hidden rounded-lg bg-[radial-gradient(120%_120%_at_80%_100%,#3b3a6b_0%,#16162a_60%,#0d0d17_100%)]">
			<div
				className={cn(
					"absolute left-1/2 grid h-5.5 -translate-x-1/2 place-items-center bg-black",
					style === "dynamic"
						? "top-0 w-23 rounded-b-xl before:absolute before:top-0 before:right-full before:size-2 before:bg-[radial-gradient(circle_at_0_100%,transparent_70%,#000_71%)] after:absolute after:top-0 after:left-full after:size-2 after:bg-[radial-gradient(circle_at_100%_100%,transparent_70%,#000_71%)]"
						: "top-2 w-20 rounded-[11px]",
				)}
			>
				{style === "windows" && <RimRing background={background} width={1.5} />}
				{style === "windows" && <span className="text-[9.5px] font-[650] text-white">9:41</span>}
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
			type="button"
			className={cn(
				"grid size-8 place-items-center rounded-full shadow-[inset_0_0_0_2px_transparent] transition-shadow duration-150 hover:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]",
				small && "size-6",
				selected && "shadow-[inset_0_0_0_2px_#fff] hover:shadow-[inset_0_0_0_2px_#fff]",
			)}
			title={title}
			aria-pressed={selected}
			onClick={onPick}
		>
			<span
				className={cn(
					"grid size-[calc(100%-8px)] place-items-center rounded-full text-[11px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]",
					outlined && "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]",
				)}
				style={{ background: fill }}
			>
				{edit && "✎"}
			</span>
		</button>
	);
}
