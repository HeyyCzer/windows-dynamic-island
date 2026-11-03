import { CircleIcon, ExternalLinkIcon, LoaderCircleIcon, PlusIcon, RefreshCwIcon, SlidersIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import navopathLogo from "../../../assets/navopath.png";
import { command, openExternal } from "../../bridge";
import { useT } from "../../i18n";
import { useIsland } from "../../island";
import { useNavoPath } from "../useNavoPath";
import { useNavoPathConnection } from "../useNavoPathConnection";
import { NeedsConfigCard } from "./NeedsConfigCard";
import "./NavoPathWidget.css";

const DEFAULT_ENDPOINT = "https://navopath-mcp.shawn89890916.workers.dev/mcp";

export function NavoPathWidget({ settings }: { settings: Record<string, unknown> }) {
	const t = useT();
	const { keepOpen } = useIsland();
	const inputRef = useRef<HTMLInputElement>(null);
	const { endpoint, token } = useNavoPathConnection();
	const { summary, tasks, loading, error, adding, completingId, loadData, addTask, completeTask } = useNavoPath(
		endpoint,
		token,
	);
	const [title, setTitle] = useState("");
	const busy = adding || completingId !== null;
	const status = error ? "disconnected" : summary ? "connected" : "connecting";
	useEffect(() => () => keepOpen(false, "navopath"), [keepOpen]);
	useEffect(() => {
		keepOpen(busy, "navopath-request");
		return () => keepOpen(false, "navopath-request");
	}, [busy, keepOpen]);
	const openSettings = () => {
		localStorage.setItem("settings_navigate", "/plugins/com.island.navopath");
		void command("open_settings");
	};
	if (!token) {
		return (
			<NeedsConfigCard
				pluginId="com.island.navopath"
				title={t("marketplace.widgets.navopath.title")}
				description={t("marketplace.widgets.navopath.needsConfig")}
				icon={<img src={navopathLogo} alt="" className="size-5 object-contain" />}
				accentColor="#A9A49B"
				externalUrl="https://navopath-planner.vercel.app"
				externalLabel={t("marketplace.widgets.navopath.openApp")}
				settingsDefs={[
					{ key: "mcpEndpoint", label: t("calendar.navopath.endpointLabel"), type: "text", default: DEFAULT_ENDPOINT },
					{ key: "token", label: t("calendar.navopath.tokenLabel"), type: "password", default: "" },
				]}
				currentSettings={settings}
			/>
		);
	}
	return (
		<section className="navopath-widget" aria-label="NavoPath" aria-busy={loading}>
			<header className="navopath-header">
				<img src={navopathLogo} alt="" className="navopath-logo" />
				<div className="navopath-heading">
					<h2>NavoPath</h2>
					<p role="status">{t(`marketplace.widgets.navopath.${status}`)}</p>
				</div>
				<button
					type="button"
					onClick={() => void loadData()}
					disabled={loading || busy}
					aria-label={t("marketplace.widgets.navopath.refresh")}
					title={t("marketplace.widgets.navopath.refresh")}
					className="navopath-icon-button"
				>
					<RefreshCwIcon size={15} className={loading ? "animate-spin" : ""} />
				</button>
				<button
					type="button"
					onClick={openSettings}
					aria-label={t("marketplace.widgets.navopath.settings")}
					title={t("marketplace.widgets.navopath.settings")}
					className="navopath-icon-button"
				>
					<SlidersIcon size={15} />
				</button>
				<button
					type="button"
					onClick={() => void openExternal("https://navopath-planner.vercel.app/app")}
					className="navopath-open"
				>
					{t("marketplace.widgets.navopath.openApp")}
					<ExternalLinkIcon size={12} />
				</button>
			</header>
			<div className="navopath-meta">
				<span>
					{t("marketplace.widgets.navopath.open")}
					{summary ? ` · ${summary.openTasks}` : ""}
				</span>
				{summary && (
					<span>
						{summary.completedTasks} {t("marketplace.widgets.navopath.done")} · {summary.projects}{" "}
						{t("marketplace.widgets.navopath.projects")}
					</span>
				)}
			</div>
			{error && (
				<p className="navopath-error" role="alert">
					{t(
						error.includes("401") || error.includes("403")
							? "marketplace.widgets.navopath.authError"
							: "marketplace.widgets.navopath.syncError",
					)}
				</p>
			)}
			<div className="navopath-task-list" data-scroll data-no-drag>
				{tasks.length ? (
					<ul>
						{tasks.map((task) => (
							<li key={task.id}>
								<button
									type="button"
									disabled={busy}
									onClick={() => void completeTask(task.id)}
									aria-label={`${t("marketplace.widgets.navopath.completeTask")}: ${task.title}`}
									className="navopath-icon-button navopath-checkbox"
								>
									{completingId === task.id ? (
										<LoaderCircleIcon size={17} className="animate-spin" />
									) : (
										<CircleIcon size={17} />
									)}
								</button>
								<span className="navopath-task-title" title={task.title}>
									{task.title}
								</span>
								{(task.plannedForDate || task.dueDate) && (
									<time className="navopath-task-date">{task.plannedForDate || task.dueDate}</time>
								)}
							</li>
						))}
					</ul>
				) : (
					<p className="navopath-empty">
						{loading
							? t("marketplace.widgets.navopath.connecting")
							: error
								? t("marketplace.widgets.navopath.retryHint")
								: t("marketplace.widgets.navopath.noTasks")}
					</p>
				)}
			</div>
			<form
				data-no-drag
				className="navopath-add"
				onSubmit={async (event) => {
					event.preventDefault();
					const value = title.trim();
					if (value && !busy && (await addTask(value))) setTitle("");
				}}
			>
				<input
					ref={inputRef}
					value={title}
					maxLength={300}
					readOnly={adding}
					aria-label={t("marketplace.widgets.navopath.addPlaceholder")}
					placeholder={t("marketplace.widgets.navopath.addPlaceholder")}
					onChange={(event) => setTitle(event.target.value)}
					onFocus={() => keepOpen(true, "navopath")}
					onBlur={() => keepOpen(false, "navopath")}
					onMouseDown={() => void command("focus_island")}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Escape") inputRef.current?.blur();
						if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
					}}
				/>
				<button
					type="submit"
					disabled={!title.trim() || busy}
					className="navopath-icon-button"
					aria-label={t("marketplace.widgets.navopath.addTask")}
				>
					{adding ? <LoaderCircleIcon size={17} className="animate-spin" /> : <PlusIcon size={17} />}
				</button>
			</form>
		</section>
	);
}
