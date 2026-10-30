import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

/** Small uppercase heading over a section of a panel. */
export const sectionLabel = tv({
	base: "font-bold tracking-[0.06em] text-text-faint uppercase",
	variants: {
		size: {
			sm: "text-[10.5px]",
			md: "text-[11px]",
		},
	},
	defaultVariants: { size: "md" },
});

export function SectionLabel({ size, className, ...rest }: ComponentProps<"span"> & VariantProps<typeof sectionLabel>) {
	return <span className={sectionLabel({ size, class: className })} {...rest} />;
}

const empty = tv({ base: "m-auto text-[13px] text-text-faint" });

/** "Nothing here" message, centered in a panel. */
export function Empty({ className, ...rest }: ComponentProps<"div">) {
	return <div className={empty({ class: className })} {...rest} />;
}

const chip = tv({
	base: "rounded-full bg-white/6 px-2.5 py-0.75 text-[11.5px] font-semibold text-text-faint before:content-['○_']",
	variants: {
		ok: {
			true: "bg-[rgba(52,199,89,0.12)] text-ok before:content-['●_']",
		},
	},
});

/** A status tag: hollow when off, filled green when `ok`. */
export function Chip({ ok, className, ...rest }: ComponentProps<"span"> & { ok?: boolean }) {
	return <span className={chip({ ok, class: className })} {...rest} />;
}

const chips = tv({ base: "flex flex-wrap gap-1.5" });

export function Chips({ className, ...rest }: ComponentProps<"div">) {
	return <div className={chips({ class: className })} {...rest} />;
}

const code = tv({
	base: "block rounded-[10px] bg-black/35 px-3 py-2.5 font-[Cascadia_Code,Consolas,monospace] text-[11.5px]/normal break-all whitespace-pre-wrap text-text-dim select-text",
});

/** A ready-to-copy snippet. */
export function Code({ className, ...rest }: ComponentProps<"code">) {
	return <code className={code({ class: className })} {...rest} />;
}
