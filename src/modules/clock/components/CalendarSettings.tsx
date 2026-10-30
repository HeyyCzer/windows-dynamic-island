import { type FormEvent, useState } from "react";
import { CloseIcon } from "../../../components/icons";
import { Button, LinkButton } from "../../../components/ui/button";
import { Block, Desc, Row, RowText } from "../../../components/ui/card";
import { Input, Select } from "../../../components/ui/form";
import { command, providerAction, useProvider } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { Toggle } from "../../../settings/components/Toggle";
import {
	calendarSettings,
	calendarVisibility,
	eventReminders,
	leadList,
	remindMinutes,
	remindSound,
} from "../settings";
import { CALENDAR_PROVIDER, type CalendarState } from "../types";

const CLOUD_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";
const LEAD_OPTIONS = [0, 1, 5, 10, 15, 30, 60, 120, 1440];

const errorText = (t: ReturnType<typeof useT>, code: string) =>
	[
		"unauthorized",
		"notFound",
		"invalid",
		"network",
		"http",
		"noClient",
		"denied",
		"timeout",
		"duplicate",
		"tooMany",
	].includes(code)
		? t(`calendar.error.${code}` as Parameters<typeof t>[0])
		: code;

/** Reminder times, Google account, iCal links and which calendars show. */
export function CalendarSettings() {
	return (
		<>
			<Reminder />
			<div className="mb-1 h-px bg-hairline" />
			<GoogleAccount />
			<div className="mb-1 h-px bg-hairline" />
			<IcalLinks />
			<Calendars />
		</>
	);
}

function Reminder() {
	const t = useT();
	const remind = useSetting(calendarSettings.remind);
	const leads = leadList(useSetting(remindMinutes));
	const own = useSetting(eventReminders);
	const sound = useSetting(remindSound);
	const label = (n: number) =>
		n === 0
			? t("calendar.remindMinutes.atStart")
			: n < 60
				? t("calendar.remindMinutes.before", { n })
				: n < 1440
					? t("calendar.remindMinutes.hoursBefore", { n: n / 60 })
					: t("calendar.remindMinutes.daysBefore", { n: n / 1440 });
	const free = LEAD_OPTIONS.filter((n) => !leads.includes(n));

	return (
		<Block className={cn(!remind && "*:opacity-45")}>
			<Row label={t("calendar.remindMinutes.label")} desc={t("calendar.remindMinutes.desc")}>
				<Select
					value=""
					disabled={!remind || !free.length}
					onChange={(e) => setSetting(remindMinutes, leadList([...leads, Number(e.target.value)]))}
				>
					<option value="" disabled>
						{t("calendar.remindMinutes.add")}
					</option>
					{free.map((n) => (
						<option key={n} value={n}>
							{label(n)}
						</option>
					))}
				</Select>
			</Row>
			<ul className="flex list-none flex-wrap gap-1.5">
				{leads.map((n) => (
					<li
						key={n}
						className={cn(
							"flex h-6.5 items-center gap-0.5 rounded-[13px] bg-white/6 pr-1 pl-3 text-[12.5px] font-[550]",
							leads.length <= 1 && "pr-3",
						)}
					>
						{label(n)}
						{leads.length > 1 && (
							<button
								type="button"
								className="grid size-5 place-items-center rounded-full text-text-faint transition-colors duration-200 hover:bg-[rgba(255,95,87,0.12)] hover:text-danger"
								title={t("calendar.remindMinutes.remove")}
								disabled={!remind}
								onClick={() =>
									setSetting(
										remindMinutes,
										leads.filter((m) => m !== n),
									)
								}
							>
								<CloseIcon size={10} />
							</button>
						)}
					</li>
				))}
			</ul>
			{[
				{ def: eventReminders, value: own },
				{ def: remindSound, value: sound },
			].map(({ def, value }) => (
				<Row as="label" label={t(def.label)} desc={def.description && t(def.description)} key={def.key}>
					<Toggle checked={value} disabled={!remind} onChange={(v) => setSetting(def, v)} />
				</Row>
			))}
		</Block>
	);
}

function GoogleAccount() {
	const t = useT();
	const google = useProvider<CalendarState>(CALENDAR_PROVIDER)?.google;
	const [busy, setBusy] = useState<"connect" | "other" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");

	const run = async (action: string, payload?: unknown, kind: "connect" | "other" = "other") => {
		setBusy(kind);
		setError(null);
		try {
			await providerAction(CALENDAR_PROVIDER, action, payload);
			return true;
		} catch (e) {
			const code = String(e);
			if (code !== "cancelled") setError(errorText(t, code));
			return false;
		} finally {
			setBusy(null);
		}
	};

	const status = !google?.hasClient
		? t("calendar.google.noClient")
		: google.error === "unauthorized"
			? t("calendar.google.revoked")
			: google.connected
				? t("calendar.google.connected", { account: google.account ?? "…" })
				: t("calendar.google.none");

	const saveClient = async (e: FormEvent) => {
		e.preventDefault();
		if (await run("setClient", { id: clientId, secret: clientSecret })) {
			setClientId("");
			setClientSecret("");
		}
	};

	return (
		<Block>
			<Row
				label={t("calendar.google.title")}
				desc={busy === "connect" ? t("calendar.google.waiting") : status}
				descTone={google?.error === "unauthorized" ? "warn" : undefined}
			>
				{busy === "connect" ? (
					<Button onClick={() => providerAction(CALENDAR_PROVIDER, "cancelConnect")}>
						{t("calendar.google.cancel")}
					</Button>
				) : google?.connected && google.error !== "unauthorized" ? (
					<Button variant="danger" disabled={!!busy} onClick={() => run("disconnectGoogle")}>
						{t("calendar.google.disconnect")}
					</Button>
				) : (
					google?.hasClient && (
						<Button variant="primary" disabled={!!busy} onClick={() => run("connectGoogle", undefined, "connect")}>
							{t("calendar.google.connect")}
						</Button>
					)
				)}
			</Row>

			{google && !google.hasClient && (
				<>
					<Desc>
						{t("calendar.google.clientHow")}{" "}
						<LinkButton onClick={() => command("open_external", { url: CLOUD_CONSOLE_URL })}>
							{t("calendar.google.clientOpen")}
						</LinkButton>
					</Desc>
					<form className="flex gap-2" onSubmit={saveClient}>
						<Input
							className="flex-1"
							value={clientId}
							placeholder={t("calendar.google.clientId")}
							spellCheck={false}
							onChange={(e) => setClientId(e.target.value)}
						/>
						<Input
							className="flex-1"
							type="password"
							value={clientSecret}
							placeholder={t("calendar.google.clientSecret")}
							autoComplete="off"
							spellCheck={false}
							onChange={(e) => setClientSecret(e.target.value)}
						/>
						<Button variant="primary" disabled={!!busy || !clientId.trim()}>
							{t("calendar.google.clientSave")}
						</Button>
					</form>
				</>
			)}
			{google?.hasClient && !google.builtinClient && !google.connected && (
				<Desc>
					<LinkButton disabled={!!busy} onClick={() => run("clearClient")}>
						{t("calendar.google.clientRemove")}
					</LinkButton>
				</Desc>
			)}
			{error && <Desc tone="error">{error}</Desc>}
		</Block>
	);
}

function IcalLinks() {
	const t = useT();
	const state = useProvider<CalendarState>(CALENDAR_PROVIDER);
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const add = async (e: FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await providerAction(CALENDAR_PROVIDER, "addFeed", { url });
			setUrl("");
		} catch (err) {
			setError(errorText(t, String(err)));
		} finally {
			setBusy(false);
		}
	};

	const feeds = state?.feeds ?? [];
	return (
		<Block>
			<RowText label={t("calendar.ics.title")} desc={t("calendar.ics.desc")} />
			<form className="flex gap-2" onSubmit={add}>
				<Input
					className="flex-1"
					type="password"
					value={url}
					placeholder={t("calendar.ics.placeholder")}
					autoComplete="off"
					spellCheck={false}
					onChange={(e) => {
						setUrl(e.target.value);
						setError(null);
					}}
				/>
				<Button variant="primary" disabled={busy || !url.trim()}>
					{busy ? "…" : t("calendar.ics.add")}
				</Button>
			</form>
			{error && <Desc tone="error">{error}</Desc>}
			{feeds.length > 0 && (
				<ul className="mt-0.5 flex list-none flex-col gap-1">
					{feeds.map((f) => (
						<li key={f.id} className="flex min-h-8.5 items-center gap-2.5 rounded-[9px] bg-white/4 pr-1.5 pl-3">
							<span className="min-w-0 flex-1 truncate text-[13px] font-[550]">{f.name ?? f.host}</span>
							<span className={cn("text-[12px] whitespace-nowrap text-text-faint", f.error && "text-danger")}>
								{f.error ? errorText(t, f.error) : f.name ? f.host : ""}
							</span>
							<button
								type="button"
								className="grid size-6 place-items-center rounded-full text-text-faint transition-colors duration-200 hover:bg-[rgba(255,95,87,0.12)] hover:text-danger"
								title={t("calendar.ics.remove")}
								onClick={() => providerAction(CALENDAR_PROVIDER, "removeFeed", { id: f.id })}
							>
								<CloseIcon size={12} />
							</button>
						</li>
					))}
				</ul>
			)}
		</Block>
	);
}

function Calendars() {
	const t = useT();
	const calendars = useProvider<CalendarState>(CALENDAR_PROVIDER)?.calendars ?? [];
	const visibility = useSetting(calendarVisibility);
	if (!calendars.length) return null;

	return (
		<>
			<div className="mb-1 h-px bg-hairline" />
			<Block>
				<RowText label={t("calendar.calendars.title")} desc={t("calendar.calendars.desc")} />
				<ul className="mt-0.5 flex list-none flex-col gap-1">
					{calendars.map((c) => {
						// From the setting, not `c.visible`: that one only catches up after
						// the backend has fetched every calendar again.
						const visible = visibility[c.key] ?? c.defaultVisible;
						return (
							<li key={c.key} className="flex min-h-8.5 items-center gap-2.5 rounded-[9px] bg-white/4 pr-1.5 pl-3">
								<i className="size-2.5 flex-none rounded-[3px]" style={{ background: c.color }} />
								<span className="min-w-0 flex-1 truncate text-[13px] font-[550]">{c.name}</span>
								<span className={cn("text-[12px] whitespace-nowrap text-text-faint", c.error && "text-danger")}>
									{c.error ? errorText(t, c.error) : c.source === "google" ? "Google" : "iCal"}
								</span>
								<Toggle
									checked={visible}
									onChange={(v) => {
										const next = { ...visibility, [c.key]: v };
										// Back to the calendar's own default: forget the override.
										if (v === c.defaultVisible) delete next[c.key];
										setSetting(calendarVisibility, next);
									}}
								/>
							</li>
						);
					})}
				</ul>
			</Block>
		</>
	);
}
