import type { ComponentProps, ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";

/**
 * A settings card: rows and blocks stacked, a hairline above a row that
 * follows another row or a block. `data-row` / `data-block` mark them for that.
 */
export const card = tv({
	base: "rounded-xl bg-white/3.5 px-4.5 py-1 shadow-[inset_0_0_0_1px_var(--hairline)] [&>[data-block]:first-child]:pt-3.5 [&>[data-block]+[data-row]]:border-t [&>[data-block]+[data-row]]:border-hairline [&>[data-row]+[data-row]]:border-t [&>[data-row]+[data-row]]:border-hairline",
});

export function Card({ className, ...rest }: ComponentProps<"section">) {
	return <section className={card({ class: className })} {...rest} />;
}

const block = tv({ base: "flex flex-col gap-2 pb-3.5 **:data-row:cursor-default" });

/** Several lines that belong together (a row plus its extras), no dividers inside. */
export function Block({ className, ...rest }: ComponentProps<"div">) {
	return <div data-block className={block({ class: className })} {...rest} />;
}

const descStyles = tv({
	base: "text-[12.5px]/[1.45] text-text-dim [&_code]:font-[Cascadia_Code,Consolas,monospace] [&_code]:text-[11.5px] [&_code]:text-text",
	variants: {
		tone: {
			default: "",
			warn: "text-warn",
			error: "text-[12px] text-[#ff5f57]",
		},
	},
	defaultVariants: { tone: "default" },
});

type DescTone = VariantProps<typeof descStyles>["tone"];

/** Secondary text: a row's description, a note under a block. */
export function Desc({ tone, className, ...rest }: ComponentProps<"span"> & { tone?: DescTone }) {
	return <span className={descStyles({ tone, class: className })} {...rest} />;
}

const rowText = tv({
	slots: {
		base: "flex min-w-0 flex-col gap-0.75",
		label: "text-[14px] font-[550]",
	},
})();

type RowTextProps = { label: ReactNode; desc?: ReactNode; descTone?: DescTone };

/** A setting's label over its description; heads a block that has no control of its own. */
export function RowText({ label, desc, descTone }: RowTextProps) {
	return (
		<span className={rowText.base()}>
			<span className={rowText.label()}>{label}</span>
			{desc ? <Desc tone={descTone}>{desc}</Desc> : null}
		</span>
	);
}

const row = tv({
	base: "flex min-h-15 items-center justify-between gap-6 py-3",
	variants: {
		/** A `<label>` row flips its toggle when clicked anywhere. */
		clickable: {
			true: "cursor-pointer",
			false: "cursor-default",
		},
		disabled: {
			true: "cursor-default opacity-45",
		},
	},
});

/** One setting: label and description on the left, its controls on the right. */
export function Row({
	label,
	desc,
	descTone,
	disabled,
	as: Tag = "div",
	className,
	children,
}: RowTextProps & {
	disabled?: boolean;
	/** `label` when the row wraps a single toggle or field. */
	as?: "div" | "label";
	className?: string;
	children?: ReactNode;
}) {
	return (
		<Tag data-row className={row({ clickable: Tag === "label", disabled, class: className })}>
			<RowText label={label} desc={desc} descTone={descTone} />
			{children}
		</Tag>
	);
}

const divider = tv({ base: "h-px bg-hairline" });

export function Divider({ className }: { className?: string }) {
	return <div className={divider({ class: className })} />;
}

const list = tv({
	slots: {
		base: "mt-0.5 flex list-none flex-col gap-1",
		item: "flex min-h-8.5 items-center gap-2.5 rounded-[9px] bg-white/4 pr-1.5 pl-3",
		name: "min-w-0 flex-1 truncate text-[13px] font-[550]",
	},
})();

/** A short editable list (repositories, calendars). */
export function List({ className, ...rest }: ComponentProps<"ul">) {
	return <ul className={list.base({ class: className })} {...rest} />;
}

export function ListItem({ name, children }: { name: ReactNode; children?: ReactNode }) {
	return (
		<li className={list.item()}>
			<span className={list.name()}>{name}</span>
			{children}
		</li>
	);
}
