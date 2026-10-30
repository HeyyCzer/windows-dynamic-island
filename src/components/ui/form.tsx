import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { tv } from "tailwind-variants";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d97757]";
const field = "h-8 rounded-[10px] bg-white/8 text-[13px] text-text shadow-[inset_0_0_0_1px_var(--hairline)]";

const input = tv({ base: [field, focusRing, "min-w-0 px-3 select-text placeholder:text-text-faint"] });

export function Input({ className, ...rest }: ComponentProps<"input">) {
	return <input className={input({ class: className })} {...rest} />;
}

const select = tv({
	slots: {
		base: "relative inline-flex max-w-70 flex-none has-disabled:opacity-70",
		field: [
			field,
			focusRing,
			"min-w-0 cursor-pointer appearance-none pr-8 pl-3 text-ellipsis [&_option]:bg-[#1c1c22] [&_option]:text-white",
		],
		// 20px box: lucide draws the chevron 10px wide in its middle, like the old 10×6 image.
		icon: "pointer-events-none absolute top-1/2 right-1.75 -translate-y-1/2 text-[#aaa]",
	},
	variants: {
		/** Inline in a list row: shorter, tighter. */
		size: {
			sm: { base: "has-disabled:opacity-35", field: "h-6.5 pr-7 pl-2.5 text-[12px]", icon: "right-1.25" },
			md: {},
		},
	},
	defaultVariants: { size: "md" },
});

export function Select({ size, className, ...rest }: Omit<ComponentProps<"select">, "size"> & { size?: "sm" | "md" }) {
	const s = select({ size });
	return (
		<span className={s.base()}>
			<select className={s.field({ class: className })} {...rest} />
			<ChevronDownIcon size={20} strokeWidth={1.9} className={s.icon()} />
		</span>
	);
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
