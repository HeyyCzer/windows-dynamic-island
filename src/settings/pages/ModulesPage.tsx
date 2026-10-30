import { Reorder, useDragControls } from "motion/react";
import { useNavigate } from "react-router";
import { GripIcon } from "../../components/icons";
import { Card } from "../../components/ui/card";
import { cn } from "../../core/cn";
import { useT } from "../../core/i18n";
import { inOrder, layoutSettings, moduleEnabled, readSetting, setSetting } from "../../core/settings";
import type { IslandModule } from "../../core/types";
import { modules } from "../../modules";
import { Lead, Title } from "../components/Heading";
import { PlacementSelect } from "../components/PlacementSelect";
import { Toggle } from "../components/Toggle";

/**
 * Every module of the island in one list: drag to reorder the tabs, choose
 * which ones sit in the tab bar (the rest stay one click away in the
 * launcher), turn them on or off, and click one to open its own settings.
 * (Pointer-driven reorder: HTML drag & drop doesn't reach the webview while
 * Tauri handles file drops.)
 */
export function ModulesPage({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const ordered = inOrder(modules, (m) => m.id, readSetting(values, layoutSettings.order));

	return (
		<>
			<Title>{t("modules.title")}</Title>
			<Lead>{t("modules.desc")}</Lead>
			<Card>
				<Reorder.Group
					as="ul"
					axis="y"
					className="list-none py-1.5"
					values={ordered.map((m) => m.id)}
					onReorder={(ids: string[]) => setSetting(layoutSettings.order, ids)}
				>
					{ordered.map((m) => (
						<ModuleRow key={m.id} module={m} enabled={readSetting(values, moduleEnabled(m))} />
					))}
				</Reorder.Group>
			</Card>
		</>
	);
}

function ModuleRow({ module, enabled }: { module: IslandModule; enabled: boolean }) {
	const t = useT();
	const drag = useDragControls();
	const navigate = useNavigate();
	const open = () => navigate(`/modules/${module.id}`);
	return (
		<Reorder.Item
			as="li"
			value={module.id}
			className="relative flex h-10.5 items-center gap-2.5 rounded-[9px] bg-transparent px-1 hover:bg-white/4"
			dragListener={false}
			dragControls={drag}
			whileDrag={{ scale: 1.02, boxShadow: "0 10px 24px -10px rgba(0,0,0,0.6)" }}
		>
			<span
				className="grid h-7 w-5 cursor-grab touch-none place-items-center text-text-faint active:cursor-grabbing"
				title={t("layout.drag")}
				onPointerDown={(e) => drag.start(e)}
			>
				<GripIcon size={14} />
			</span>
			<button
				type="button"
				className="group/open flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
				title={t("modules.open")}
				onClick={open}
			>
				<span className={cn("grid w-4.5 place-items-center", !enabled && "opacity-40")}>{module.settingsIcon}</span>
				<span
					className={cn(
						"flex-1 text-[13px] font-semibold underline-offset-3 group-hover/open:underline",
						!enabled && "opacity-40",
					)}
				>
					{t(module.title)}
				</span>
			</button>
			<PlacementSelect moduleId={module.id} disabled={!enabled} compact />
			<Toggle checked={enabled} onChange={(v) => setSetting(moduleEnabled(module), v)} />
			<button
				type="button"
				className="h-7 w-5.5 rounded-[7px] text-[18px] leading-none text-text-faint hover:bg-white/6 hover:text-text"
				title={t("modules.open")}
				onClick={open}
			>
				›
			</button>
		</Reorder.Item>
	);
}
