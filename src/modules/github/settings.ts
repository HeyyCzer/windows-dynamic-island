import type { SettingDef } from "../../core/settings";

export const githubSettings = {
  showBubble: {
    key: "github.showBubble",
    label: "github.showBubble.label",
    description: "github.showBubble.desc",
    default: true,
  },
  peekOnNew: {
    key: "github.peekOnNew",
    label: "github.peekOnNew.label",
    description: "github.peekOnNew.desc",
    default: true,
  },
} satisfies Record<string, SettingDef>;

/** Followed repositories (`owner/name`); also read by the backend provider. */
export const githubRepos: SettingDef<string[]> = {
  key: "github.repos",
  label: "github.repos.title",
  default: [],
};
