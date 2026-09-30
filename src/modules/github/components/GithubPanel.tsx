import { IssueIcon, RefreshIcon } from "../../../components/icons";
import { command, providerAction } from "../../../core/bridge";
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
    <div className="gh-panel">
      <div className="gh-header">
        <span className="gh-section-label">{t("github.openIssues")}</span>
        <span className="gh-meta">{meta}</span>
        <button
          className={`gh-icon-btn ${state?.loading ? "is-spinning" : ""}`}
          title={t("github.refresh")}
          onClick={() => providerAction("github", "refresh")}
        >
          <RefreshIcon size={14} />
        </button>
      </div>

      {repos.length === 0 ? (
        <div className="gh-empty">
          <span>{t("github.empty")}</span>
          <button className="gh-link" onClick={() => command("open_settings")}>
            {t("github.addInSettings")}
          </button>
        </div>
      ) : (
        <div className="gh-list">
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
      className={`gh-row ${fresh ? "is-new" : ""}`}
      onClick={() => open(fresh && repo.latest ? repo.latest.url : `https://github.com/${repo.name}/issues`)}
    >
      <div className="gh-row-text">
        <span className="gh-repo">
          <span className="gh-owner">{owner}/</span>
          {name}
        </span>
        <span className={`gh-sub ${repo.error ? "is-error" : ""}`}>
          {fresh && <span className="gh-new-tag">{t("github.newIssue")}</span>}
          {sub}
        </span>
      </div>
      <span className={`gh-count ${repo.openIssues ? "" : "is-zero"}`}>
        <IssueIcon size={13} />
        {repo.openIssues == null ? "—" : formatCount(repo.openIssues)}
      </span>
    </button>
  );
}
