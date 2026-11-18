import { CircleDotIcon, GitCommitHorizontalIcon, GitPullRequestIcon, RefreshCwIcon, TagIcon } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { IconButton, LinkButton } from "../../../components/ui/button";
import { command, providerAction } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { useT } from "../../../core/i18n";
import type { MessageKey } from "../../../locales/keys.gen";
import { formatAgo, useNow } from "../../ai-agents/common/format";
import { formatCount, listUrl } from "../repo";
import type { GithubKind, GithubNewItem, GithubRepo, GithubState } from "../types";

const open = (url: string) => providerAction("github", "open", { url });

const KINDS: { kind: GithubKind; label: MessageKey; empty: MessageKey; icon: ReactNode }[] = [
	{ kind: "issues", label: "github.tab.issues", empty: "github.noIssues", icon: <CircleDotIcon size={13} /> },
	{ kind: "pulls", label: "github.tab.pulls", empty: "github.noPulls", icon: <GitPullRequestIcon size={13} /> },
	{
		kind: "commits",
		label: "github.tab.commits",
		empty: "github.noCommits",
		icon: <GitCommitHorizontalIcon size={13} />,
	},
	{ kind: "releases", label: "github.tab.releases", empty: "github.noReleases", icon: <TagIcon size={13} /> },
];

const KIND_SPRING = { type: "spring", stiffness: 500, damping: 38 } as const;

/** Expanded panel: a list picker, then one row per followed repository. */
export function GithubPanel({ state, news }: { state: GithubState | undefined; news: GithubNewItem[] }) {
	const t = useT();
	const now = useNow(30_000);
	// Opens on the list of whatever just arrived.
	const [kind, setKind] = useState<GithubKind>(() => news[0]?.kind ?? "issues");
	const repos = state?.repos ?? [];
	const fresh = news.find((n) => n.kind === kind);

	let meta = "";
	if (state?.rateLimitedUntil && state.rateLimitedUntil > now) {
		const time = new Date(state.rateLimitedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		meta = t("github.rateLimited", { time });
	} else if (state?.loading) meta = t("github.loading");
	else if (state?.updatedAt) meta = t("github.updated", { time: formatAgo(t, state.updatedAt, now) });

	return (
		<div className="flex h-full flex-col gap-2">
			<div className="flex h-7 flex-none items-center gap-2.5">
				<div className="flex flex-none rounded-full bg-white/5 p-0.5" role="tablist">
					{KINDS.map((k) => {
						const selected = k.kind === kind;
						return (
							// Only the open list spells out its name; the others are icons.
							<motion.button
								type="button"
								key={k.kind}
								role="tab"
								aria-selected={selected}
								title={t(k.label)}
								layout
								transition={KIND_SPRING}
								className={cn(
									"relative inline-flex h-6 items-center justify-center gap-1.5 rounded-full text-[12px] font-[650] text-text-faint transition-colors duration-150 hover:text-text-dim",
									selected ? "px-2.5 text-text hover:text-text" : "w-7",
								)}
								onClick={(e) => {
									e.stopPropagation();
									setKind(k.kind);
								}}
							>
								{selected && (
									<motion.span
										layoutId="github-kind-pill"
										className="absolute inset-0 rounded-full bg-white/12"
										transition={KIND_SPRING}
									/>
								)}
								<motion.span layout="position" className="relative grid place-items-center">
									{k.icon}
								</motion.span>
								{selected && (
									<motion.span
										className="relative whitespace-nowrap"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ duration: 0.15, delay: 0.05 }}
									>
										{t(k.label)}
									</motion.span>
								)}
								{!selected && news.some((n) => n.kind === k.kind) && (
									<span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-[#d29922] shadow-[0_0_0_1.5px_var(--island)]" />
								)}
							</motion.button>
						);
					})}
				</div>
				<span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-text-faint">{meta}</span>
				<IconButton
					size="sm"
					tone="faint"
					className={state?.loading ? "[&_svg]:animate-spin-fast" : undefined}
					title={t("github.refresh")}
					onClick={() => providerAction("github", "refresh")}
				>
					<RefreshCwIcon size={14} />
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
							kind={kind}
							now={now}
							fresh={fresh?.repo === repo.name && fresh.item.id === repo[kind]?.latest?.id}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function RepoRow({ repo, kind, now, fresh }: { repo: GithubRepo; kind: GithubKind; now: number; fresh: boolean }) {
	const t = useT();
	const [owner, name] = repo.name.split("/");
	const section = repo[kind];
	const latest = section?.latest;
	const def = KINDS.find((k) => k.kind === kind) ?? KINDS[0];

	let sub: ReactNode;
	if (repo.error) sub = t(`github.error.${repo.error}`);
	else if (latest)
		sub = (
			<>
				<span className={cn(kind !== "issues" && kind !== "pulls" && "font-mono text-[11px]")}>{latest.id}</span>{" "}
				{latest.title !== latest.id && latest.title}
			</>
		);
	else if (section) sub = t(def.empty);
	else sub = "…";

	// Issues and PRs: how many are open. Commits and releases: how long ago.
	let side: ReactNode;
	if (kind === "issues" || kind === "pulls") {
		side = (
			<span
				className={cn(
					"flex flex-none items-center gap-1.25 text-[13px] font-bold text-[#3fb950] tabular-nums",
					!section?.count && "text-text-faint",
				)}
			>
				{def.icon}
				{section?.count == null ? "—" : formatCount(section.count)}
			</span>
		);
	} else {
		const at = latest ? Date.parse(latest.at) : Number.NaN;
		side = (
			<span className="flex-none text-[12px] text-text-faint tabular-nums">
				{Number.isNaN(at) ? "—" : formatAgo(t, at, now)}
			</span>
		);
	}

	return (
		<button
			type="button"
			className={cn(
				"flex h-10 flex-none items-center gap-3 rounded-xl px-2.5 text-left transition-colors duration-150 hover:bg-card",
				fresh && "bg-[rgba(210,153,34,0.1)]",
			)}
			onClick={() => open(fresh && latest ? latest.url : listUrl(repo.name, kind))}
		>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-[13px] font-[650]">
					<span className="font-medium text-text-dim">{owner}/</span>
					{name}
				</span>
				<span className={cn("truncate text-[11.5px] text-text-faint", repo.error && "text-danger")}>
					{fresh && (
						<span className="mr-1.5 rounded-[4px] bg-[#d29922] px-1.25 text-[10px] font-[750] text-black uppercase">
							{t("github.newItem")}
						</span>
					)}
					{sub}
				</span>
			</div>
			{side}
		</button>
	);
}
