import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

/** Pill button of the settings window. */
export const button = tv({
	base: "h-8 flex-none rounded-2xl px-4 text-[13px] font-[650] transition-[filter,opacity] duration-200 hover:brightness-115 disabled:pointer-events-none disabled:opacity-50",
	variants: {
		variant: {
			primary: "bg-[#d97757] text-white",
			danger: "bg-[rgba(255,95,87,0.15)] text-danger",
			soft: "flex items-center gap-1.75 bg-white/8 text-text shadow-[inset_0_0_0_1px_var(--hairline)]",
		},
	},
	defaultVariants: { variant: "soft" },
});

export function Button({ variant, className, ...rest }: ComponentProps<"button"> & VariantProps<typeof button>) {
	return <button type="button" className={button({ variant, class: className })} {...rest} />;
}

/** Small text action in a panel header ("Clear", "New"). */
export const textButton = tv({
	base: "flex-none rounded-[10px] px-2.5 py-0.5 text-[12px] text-text-dim hover:bg-white/10 hover:text-text",
});

export function TextButton({ className, ...rest }: ComponentProps<"button">) {
	return <button type="button" className={textButton({ class: className })} {...rest} />;
}

/** Round icon-only button. */
export const iconButton = tv({
	base: "grid flex-none place-items-center rounded-full transition-colors duration-200 disabled:cursor-default disabled:opacity-35",
	variants: {
		size: {
			sm: "size-6",
			md: "size-7",
		},
		tone: {
			dim: "text-text-dim enabled:hover:bg-white/10 enabled:hover:text-text",
			faint: "text-text-faint enabled:hover:bg-white/8 enabled:hover:text-text",
			/** Removes something: turns red on hover. */
			danger: "text-text-faint enabled:hover:bg-[rgba(255,95,87,0.12)] enabled:hover:text-danger",
		},
	},
	defaultVariants: { size: "md", tone: "dim" },
});

export function IconButton({
	size,
	tone,
	className,
	...rest
}: ComponentProps<"button"> & VariantProps<typeof iconButton>) {
	return <button type="button" className={iconButton({ size, tone, class: className })} {...rest} />;
}

/** A button that reads as a link, inline in a sentence. */
export const linkButton = tv({
	base: "font-semibold hover:underline",
	variants: {
		tone: {
			accent: "text-accent",
			text: "text-text",
		},
	},
	defaultVariants: { tone: "accent" },
});

export function LinkButton({ tone, className, ...rest }: ComponentProps<"button"> & VariantProps<typeof linkButton>) {
	return <button type="button" className={linkButton({ tone, class: className })} {...rest} />;
}
