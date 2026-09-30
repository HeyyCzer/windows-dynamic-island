import type { IslandModule } from "../core/types";
import { aiAgentsModule } from "./ai-agents";
import { musicModule } from "./music";

/**
 * Every module the island knows about, in tab order.
 *
 * Each module is a self-contained folder (`src/modules/<name>/`) with its own
 * components, hooks and CSS, exporting an `IslandModule` (see `core/types.ts`).
 * If it needs data from the OS, add a matching provider in
 * `src-tauri/src/providers/<name>/`.
 */
export const modules: IslandModule[] = [musicModule, aiAgentsModule];
