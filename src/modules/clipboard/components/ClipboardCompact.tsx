import { CheckIcon, ClipboardIcon, FolderIcon } from "lucide-react";
import { Marquee } from "../../../components/Marquee";
import { useT } from "../../../core/i18n";
import { CLIPBOARD_YELLOW, type ClipItem } from "../types";
import { clipTitle } from "./ClipboardPanel";

/** Left slot of the "just copied" pill: the picture or an icon, and what it is. */
export function ClipboardCompactLeft({ item }: { item: ClipItem }) {
	const t = useT();
	return (
		<>
			{item.kind === "image" && item.thumb ? (
				<img className="size-6 flex-none rounded-md object-cover" src={item.thumb} alt="" draggable={false} />
			) : (
				<span className="grid size-6 flex-none place-items-center rounded-[7px] bg-[rgba(255,214,10,0.16)]">
					{item.kind === "files" ? (
						<FolderIcon size={12} color={CLIPBOARD_YELLOW} />
					) : (
						<ClipboardIcon size={12} color={CLIPBOARD_YELLOW} />
					)}
				</span>
			)}
			<Marquee text={clipTitle(t, item)} className="max-w-50 min-w-0 text-[13px] font-semibold" />
		</>
	);
}

export function ClipboardCompactRight() {
	const t = useT();
	return (
		<span className="inline-flex items-center gap-1 text-[12px] font-semibold whitespace-nowrap text-[#ffd60a]">
			<CheckIcon size={10} /> {t("clipboard.copied")}
		</span>
	);
}
