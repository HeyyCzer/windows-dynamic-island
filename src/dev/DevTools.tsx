/**
 * Browser-only panel to drive the mock: every mock's controls, by section, and
 * the actions the UI sent. Renders whatever `mocks` declare, nothing per module.
 */
import { useState, useSyncExternalStore } from "react";
import { cn } from "../core/cn";
import { mocks } from "./mock";
import { type Control, callLog, devStore, type Mock } from "./mock/kit";

const OPEN_KEY = "devtools.open";
const COLLAPSED_KEY = "devtools.collapsed";

function usePersisted<T>(key: string, initial: T) {
	const [value, setValue] = useState<T>(() => {
		const saved = localStorage.getItem(key);
		return saved === null ? initial : (JSON.parse(saved) as T);
	});
	const set = (next: T) => {
		localStorage.setItem(key, JSON.stringify(next));
		setValue(next);
	};
	return [value, set] as const;
}

export function DevTools() {
	useSyncExternalStore(devStore.subscribe, devStore.version);
	const [open, setOpen] = usePersisted(OPEN_KEY, true);
	const [collapsed, setCollapsed] = usePersisted<string[]>(COLLAPSED_KEY, []);

	if (!open) {
		return (
			<button
				type="button"
				className="fixed right-3 bottom-3 z-50 rounded-full bg-neutral-900/90 px-3 py-1.5 font-medium text-white/80 text-xs shadow-lg ring-1 ring-white/10 hover:text-white"
				onClick={() => setOpen(true)}
			>
				DevTools
			</button>
		);
	}

	const toggleSection = (label: string) =>
		setCollapsed(collapsed.includes(label) ? collapsed.filter((l) => l !== label) : [...collapsed, label]);

	return (
		<aside className="fixed top-3 right-3 bottom-3 z-50 flex w-72 flex-col overflow-hidden rounded-xl bg-neutral-900/95 text-white/90 text-xs shadow-2xl ring-1 ring-white/10 backdrop-blur">
			<header className="flex items-center justify-between border-white/10 border-b px-3 py-2">
				<span className="font-semibold">DevTools</span>
				<button type="button" className="text-white/50 hover:text-white" onClick={() => setOpen(false)}>
					Hide
				</button>
			</header>
			<div className="flex-1 overflow-y-auto">
				{mocks
					.filter((m) => m.controls?.length)
					.map((m) => (
						<Section
							key={m.label}
							mock={m}
							collapsed={collapsed.includes(m.label)}
							onToggle={() => toggleSection(m.label)}
						/>
					))}
			</div>
			<CallLog />
		</aside>
	);
}

function Section({ mock, collapsed, onToggle }: { mock: Mock; collapsed: boolean; onToggle: () => void }) {
	return (
		<section className="border-white/5 border-b">
			<button
				type="button"
				className="flex w-full items-center justify-between px-3 py-2 font-medium hover:bg-white/5"
				onClick={onToggle}
			>
				{mock.label}
				<span className={cn("text-white/40 transition-transform", !collapsed && "rotate-90")}>›</span>
			</button>
			{!collapsed && (
				<div className="flex flex-col gap-1.5 px-3 pb-3">
					{mock.controls?.map((c) => (
						<ControlView key={c.label} control={c} />
					))}
				</div>
			)}
		</section>
	);
}

const field =
	"rounded-md bg-white/8 px-2 py-1 text-white/90 outline-none focus-visible:ring-1 focus-visible:ring-white/40";

function ControlView({ control: c }: { control: Control }) {
	switch (c.kind) {
		case "button":
			return (
				<button type="button" className={cn(field, "text-left hover:bg-white/15")} onClick={c.run}>
					{c.label}
				</button>
			);
		case "toggle":
			return (
				<label className="flex items-center justify-between gap-2">
					{c.label}
					<input type="checkbox" checked={c.value()} onChange={(e) => c.set(e.target.checked)} />
				</label>
			);
		case "select":
			return (
				<label className="flex items-center justify-between gap-2">
					{c.label}
					<select className={field} value={c.value()} onChange={(e) => c.set(e.target.value)}>
						{c.options.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</select>
				</label>
			);
		case "range":
			return (
				<label className="flex items-center justify-between gap-2">
					{c.label}
					<input
						type="range"
						className="w-28"
						min={c.min}
						max={c.max}
						step={c.step ?? 1}
						value={c.value()}
						onChange={(e) => c.set(Number(e.target.value))}
					/>
				</label>
			);
	}
}

function CallLog() {
	return (
		<footer className="max-h-44 overflow-y-auto border-white/10 border-t px-3 py-2 font-mono text-[10px]">
			<div className="mb-1 font-sans font-semibold text-white/60 text-xs">Actions sent</div>
			{callLog.length === 0 && <div className="text-white/40">Nothing yet.</div>}
			{callLog.map((call) => (
				<div key={call.id} className={cn(!call.handled && "text-white/45")}>
					<span className="text-white/40">{new Date(call.at).toLocaleTimeString()}</span> {call.target}.{call.name}
					{call.payload !== undefined && call.payload !== null && (
						<span className="text-white/50"> {JSON.stringify(call.payload)}</span>
					)}
				</div>
			))}
		</footer>
	);
}
