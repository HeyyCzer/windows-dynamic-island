import { GitHubIcon } from "../../../components/icons";
import { cn } from "../../../core/cn";
import { formatCount } from "../repo";

/** Side bubble: GitHub mark + total open issues. */
export function GithubBubble({ count, fresh }: { count: number; fresh: boolean }) {
	return (
		<>
			<GitHubIcon size={19} />
			{count > 0 && (
				<span
					className={cn(
						"absolute -right-1.5 -bottom-1 z-3 grid h-4.5 min-w-4.5 place-items-center rounded-[9px] bg-[#238636] px-1.25 text-[10.5px] font-[750] text-white shadow-[0_0_0_2px_var(--island)]",
						fresh && "animate-gh-pulse bg-[#d29922]",
					)}
				>
					{formatCount(count)}
				</span>
			)}
		</>
	);
}
