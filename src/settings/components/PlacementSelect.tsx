import { tv } from "tailwind-variants";
import { Select } from "../../components/ui/form";
import { useT } from "../../core/i18n";
import { type Placement, placementOf, setPlacement, useSettings } from "../../core/settings";

const placementSelect = tv({
	variants: {
		/** Inline in the modules list: smaller, dimmed while the tab is launcher-only. */
		compact: {
			true: "h-6.5 bg-position-[right_10px_center] pr-7 pl-2.5 text-[12px] font-semibold text-text-faint disabled:cursor-default disabled:opacity-35",
		},
		inBar: { true: "" },
	},
	compoundVariants: [{ compact: true, inBar: true, class: "text-text" }],
});

/** Where a module's tab goes (tab bar always / when in use, or launcher only). */
export function PlacementSelect({
	moduleId,
	disabled,
	compact,
}: {
	moduleId: string;
	disabled?: boolean;
	compact?: boolean;
}) {
	const t = useT();
	const values = useSettings();
	const placement = placementOf(values, moduleId);
	return (
		<Select
			className={placementSelect({ compact, inBar: placement !== "launcher" })}
			disabled={disabled}
			title={t("layout.place")}
			value={placement}
			onChange={(e) => setPlacement(values, moduleId, e.target.value as Placement)}
		>
			<option value="always">{t("layout.inBarAlways")}</option>
			<option value="bar">{t("layout.inBar")}</option>
			<option value="launcher">{t("layout.inLauncher")}</option>
		</Select>
	);
}
