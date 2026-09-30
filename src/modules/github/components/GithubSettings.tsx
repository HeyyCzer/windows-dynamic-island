import { useState, type FormEvent } from "react";
import { CloseIcon, IssueIcon } from "../../../components/icons";
import { providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { formatCount, parseRepo } from "../repo";
import { githubRepos } from "../settings";
import type { GithubState } from "../types";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=Dynamic%20Island";

/** Followed repositories + GitHub account, for the settings window. */
export function GithubSettings() {
  return (
    <>
      <Repos />
      <div className="gh-divider" />
      <Account />
    </>
  );
}

function Repos() {
  const t = useT();
  const state = useProvider<GithubState>("github");
  const repos = useSetting(githubRepos);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = parseRepo(input);
    if (!name) return setError(t("github.repos.invalid"));
    if (repos.some((r) => r.toLowerCase() === name.toLowerCase())) return setError(t("github.repos.duplicate"));
    setSetting(githubRepos, [...repos, name]);
    setInput("");
    setError(null);
  };

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("github.repos.title")}</span>
          <span className="settings-desc">{t("github.repos.desc")}</span>
        </div>
      </div>
      <form className="gh-add" onSubmit={add}>
        <input
          className="settings-input"
          value={input}
          placeholder={t("github.repos.placeholder")}
          spellCheck={false}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
        />
        <button className="settings-btn primary" disabled={!input.trim()}>
          {t("github.repos.add")}
        </button>
      </form>
      {error && <span className="settings-error">{error}</span>}
      {repos.length > 0 && (
        <ul className="gh-repo-list">
          {repos.map((name) => {
            const repo = state?.repos.find((r) => r.name.toLowerCase() === name.toLowerCase());
            return (
              <li key={name} className="gh-repo-item">
                <span className="gh-repo-name">{name}</span>
                {repo?.error ? (
                  <span className="gh-repo-status is-error">{t(`github.error.${repo.error}`)}</span>
                ) : (
                  repo?.openIssues != null && (
                    <span className="gh-repo-status">
                      <IssueIcon size={12} />
                      {formatCount(repo.openIssues)}
                    </span>
                  )
                )}
                <button
                  className="gh-remove"
                  title={t("github.repos.remove")}
                  onClick={() => setSetting(githubRepos, repos.filter((r) => r !== name))}
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Account() {
  const t = useT();
  const state = useProvider<GithubState>("github");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "setToken" | "clearToken", payload?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await providerAction("github", action, payload);
      setToken("");
    } catch (e) {
      const code = String(e);
      setError(code === "unauthorized" ? t("github.error.unauthorized") : code);
    } finally {
      setBusy(false);
    }
  };

  const login = state?.login ?? "…";
  const status = state?.authError
    ? t("github.account.rejected")
    : state?.auth === "token"
      ? t("github.account.token", { login })
      : state?.auth === "gh"
        ? t("github.account.gh", { login })
        : t("github.account.none");

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("github.account.title")}</span>
          <span className={`settings-desc ${state?.authError ? "gh-warn" : ""}`}>{status}</span>
        </div>
        {state?.auth === "token" && (
          <button className="settings-btn danger" disabled={busy} onClick={() => run("clearToken")}>
            {busy ? "…" : t("github.account.remove")}
          </button>
        )}
      </div>
      {state?.auth !== "token" && (
        <>
          <form
            className="gh-add"
            onSubmit={(e) => {
              e.preventDefault();
              run("setToken", { token });
            }}
          >
            <input
              className="settings-input"
              type="password"
              value={token}
              placeholder={t("github.account.placeholder")}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="settings-btn primary" disabled={busy || !token.trim()}>
              {busy ? "…" : t("github.account.save")}
            </button>
          </form>
          <span className="settings-desc">
            {t("github.account.stored")}{" "}
            <button className="gh-link" onClick={() => providerAction("github", "open", { url: TOKEN_URL })}>
              {t("github.account.create")}
            </button>
          </span>
        </>
      )}
      {error && <span className="settings-error">{error}</span>}
    </div>
  );
}
