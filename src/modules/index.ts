import type { IslandModule } from "../core/types";
import { mediaModule } from "./media";

/**
 * Every module the island knows about, in tab order.
 *
 * To add a module: create `src/modules/<name>/index.tsx` exporting an
 * `IslandModule` (see `core/types.ts`) and append it here. If it needs data
 * from the OS, add a matching provider in `src-tauri/src/providers/`.
 */
export const modules: IslandModule[] = [mediaModule];
