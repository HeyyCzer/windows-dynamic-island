import { GitHubIcon } from "../../../components/icons";
import { formatCount } from "../repo";

/** Side bubble: GitHub mark + total open issues. */
export function GithubBubble({ count, fresh }: { count: number; fresh: boolean }) {
  return (
    <>
      <GitHubIcon size={19} />
      {count > 0 && <span className={`gh-badge ${fresh ? "is-new" : ""}`}>{formatCount(count)}</span>}
    </>
  );
}
