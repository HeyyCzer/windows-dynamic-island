import type { ComponentProps } from "react";
import { tv } from "tailwind-variants";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d97757]";
const field = "h-8 rounded-[10px] bg-white/8 text-[13px] text-text shadow-[inset_0_0_0_1px_var(--hairline)]";

const input = tv({ base: [field, focusRing, "min-w-0 px-3 select-text placeholder:text-text-faint"] });

export function Input({ className, ...rest }: ComponentProps<"input">) {
	return <input className={input({ class: className })} {...rest} />;
}

const select = tv({
	base: [
		field,
		focusRing,
		"max-w-70 flex-none cursor-pointer appearance-none disabled:opacity-70 bg-(image:--select-chevron) bg-position-[right_12px_center] bg-no-repeat pr-8 pl-3 text-ellipsis [&_option]:bg-[#1c1c22] [&_option]:text-white",
	],
});

export function Select({ className, ...rest }: ComponentProps<"select">) {
	return <select className={select({ class: className })} {...rest} />;
}

const numberField = tv({
	slots: {
		base: "flex h-8 flex-none items-center gap-1.5 rounded-[10px] bg-white/8 pr-3 pl-1 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#d97757]",
		input:
			"h-full w-13 px-0.5 py-px text-right outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
		unit: "text-[13px] text-text-dim",
	},
})();

/** A whole number with its unit ("5 s", "30 min"). */
export function NumberField({ unit, ...rest }: ComponentProps<"input"> & { unit: string }) {
	return (
		<span className={numberField.base()}>
			<input type="number" className={numberField.input()} {...rest} />
			<span className={numberField.unit()}>{unit}</span>
		</span>
	);
}

const segmented = tv({
	slots: {
		base: "flex flex-none rounded-[9px] bg-white/8 p-0.5",
		option: "rounded-[7px] px-3 py-1 text-[12px] text-text-dim hover:text-text",
	},
	variants: {
		active: {
			true: { option: "bg-white/16 text-text" },
		},
	},
});

/** A few mutually exclusive options side by side. */
export function Segmented<T extends string | number>({
	options,
	value,
	onChange,
	disabled,
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	disabled?: boolean;
}) {
	return (
		<div className={segmented().base()}>
			{options.map((o) => (
				<button
					type="button"
					key={o.value}
					className={segmented({ active: o.value === value }).option()}
					disabled={disabled}
					onClick={() => onChange(o.value)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}
