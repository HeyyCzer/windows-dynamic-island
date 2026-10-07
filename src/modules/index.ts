import type { IslandModule } from "../core/types";
import { activitiesModule } from "./activities";
import { aiAgentsModule } from "./ai-agents";
import { askModule } from "./ask";
import { clipboardModule } from "./clipboard";
import { clockModule } from "./clock";
import { githubModule } from "./github";
import { monitorModule } from "./monitor";
import { musicModule } from "./music";
import { notificationsModule } from "./notifications";
import { shelfModule } from "./shelf";

/**
 * Every module the island knows about, in tab order.
 *
 * Each module is a self-contained folder (`src/modules/<name>/`) with its own
 * components, hooks and CSS, exporting an `IslandModule` (see `core/types.ts`).
 * If it needs data from the OS, add a matching provider in
 * `src-tauri/src/providers/<name>/`.
 */
export const modules: IslandModule[] = [
  musicModule,
  aiAgentsModule,
  askModule,
  notificationsModule,
  activitiesModule,
  shelfModule,
  clipboardModule,
  githubModule,
  monitorModule,
  clockModule,
];
