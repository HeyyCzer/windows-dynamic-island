import { motion } from "motion/react";
import { tv } from "tailwind-variants";
import { Row } from "../../components/ui/card";
import { useT } from "../../core/i18n";
import { type SettingDef, setSetting } from "../../core/settings";

const toggle = tv({
	slots: {
		base: "relative flex h-6.25 w-10.5 flex-none items-center rounded-full bg-white/14 p-0.75 transition-[background] duration-250 ease-[ease] disabled:opacity-40",
		knob: "size-4.75 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)]",
	},
	variants: {
		checked: {
			true: { base: "justify-end bg-ok" },
		},
	},
});

export function Toggle({
	checked,
	onChange,
	disabled,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
}) {
	const s = toggle({ checked });
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			className={s.base()}
			onClick={(e) => {
				e.preventDefault();
				onChange(!checked);
			}}
		>
			<motion.span className={s.knob()} layout transition={{ type: "spring", stiffness: 600, damping: 32 }} />
		</button>
	);
}

/** A row bound to a boolean setting. */
export function ToggleRow({ def, value }: { def: SettingDef; value: boolean }) {
	const t = useT();
	return (
		<Row as="label" label={t(def.label)} desc={def.description && t(def.description)}>
			<Toggle checked={value} onChange={(v) => setSetting(def, v)} />
		</Row>
	);
}
