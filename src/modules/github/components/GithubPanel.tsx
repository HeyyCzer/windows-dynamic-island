import { IssueIcon, RefreshIcon } from "../../../components/icons";
import { IconButton, LinkButton } from "../../../components/ui/button";
import { SectionLabel } from "../../../components/ui/text";
import { command, providerAction } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { useT } from "../../../core/i18n";
import { formatAgo, useNow } from "../../ai-agents/common/format";
import { formatCount, freshIssue } from "../repo";
import type { GithubRepo, GithubState } from "../types";

const open = (url: string) => providerAction("github", "open", { url });

/** Expanded panel: one row per followed repository. */
export function GithubPanel({ state }: { state: GithubState | undefined }) {
	const t = useT();
	const now = useNow(30_000);
	const repos = state?.repos ?? [];
	const fresh = freshIssue(state, now);

	let meta = "";
	if (state?.rateLimitedUntil && state.rateLimitedUntil > now) {
		const time = new Date(state.rateLimitedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		meta = t("github.rateLimited", { time });
	} else if (state?.loading) meta = t("github.loading");
	else if (state?.updatedAt) meta = t("github.updated", { time: formatAgo(t, state.updatedAt, now) });

	return (
		<div className="flex h-full flex-col gap-2">
			<div className="flex h-5.5 flex-none items-center gap-2.5">
				<SectionLabel>{t("github.openIssues")}</SectionLabel>
				<span className="flex-1 text-[11.5px] text-text-faint">{meta}</span>
				<IconButton
					size="sm"
					tone="faint"
					className={state?.loading ? "[&_svg]:animate-spin-fast" : undefined}
					title={t("github.refresh")}
					onClick={() => providerAction("github", "refresh")}
				>
					<RefreshIcon size={14} />
				</IconButton>
			</div>

			{repos.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-[13px] text-text-dim">
					<span>{t("github.empty")}</span>
					<LinkButton onClick={() => command("open_settings")}>{t("github.addInSettings")}</LinkButton>
				</div>
			) : (
				<div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none]">
					{repos.map((repo) => (
						<RepoRow
							key={repo.name}
							repo={repo}
							fresh={fresh?.repo === repo.name && fresh.issue.number === repo.latest?.number}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function RepoRow({ repo, fresh }: { repo: GithubRepo; fresh: boolean }) {
	const t = useT();
	const [owner, name] = repo.name.split("/");

	let sub: string;
	if (repo.error) sub = t(`github.error.${repo.error}`);
	else if (repo.latest) sub = `#${repo.latest.number} ${repo.latest.title}`;
	else if (repo.openIssues === 0) sub = t("github.noIssues");
	else sub = "…";

	return (
		<button
			type="button"
			className={cn(
				"flex h-10 flex-none items-center gap-3 rounded-xl px-2.5 text-left transition-colors duration-150 hover:bg-card",
				fresh && "bg-[rgba(210,153,34,0.1)]",
			)}
			onClick={() => open(fresh && repo.latest ? repo.latest.url : `https://github.com/${repo.name}/issues`)}
		>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-[13px] font-[650]">
					<span className="font-medium text-text-dim">{owner}/</span>
					{name}
				</span>
				<span className={cn("truncate text-[11.5px] text-text-faint", repo.error && "text-danger")}>
					{fresh && (
						<span className="mr-1.5 rounded-[4px] bg-[#d29922] px-1.25 text-[10px] font-[750] text-black uppercase">
							{t("github.newIssue")}
						</span>
					)}
					{sub}
				</span>
			</div>
			<span
				className={cn(
					"flex flex-none items-center gap-1.25 text-[13px] font-bold text-[#3fb950] tabular-nums",
					!repo.openIssues && "text-text-faint",
				)}
			>
				<IssueIcon size={13} />
				{repo.openIssues == null ? "—" : formatCount(repo.openIssues)}
			</span>
		</button>
	);
}
