import { StrictMode, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { format, left, next, reset, type Timer, toggle } from "./timer";
import "./panel.css";

await island.ready;

const useTimer = () =>
	useSyncExternalStore(
		(onChange) => island.state.subscribe(onChange),
		() => island.state.get<Timer>(),
	);

/** Re-renders every half second while `on`. */
function useTicking(on: boolean) {
	const [, setNow] = useState(0);
	useEffect(() => {
		if (!on) return;
		const id = setInterval(() => setNow(Date.now()), 500);
		return () => clearInterval(id);
	}, [on]);
}

function Panel() {
	const timer = useTimer();
	useTicking(!!timer?.running);
	if (!timer) return null;
	const set = (t: Timer) => island.state.set(t);
	const t = island.t;
	return (
		<main data-phase={timer.phase}>
			<div className="clock">
				<span className="phase">{t(`phase.${timer.phase}`)}</span>
				<output>{format(left(timer))}</output>
			</div>
			<div className="side">
				<div className="actions">
					<button type="button" className="island-button" data-tone="accent" onClick={() => set(toggle(timer))}>
						{t(timer.running ? "actions.pause" : timer.endsAt || timer.doneAt ? "actions.resume" : "actions.start")}
					</button>
					<button type="button" className="island-button" onClick={() => set(reset(timer))}>
						{t("actions.reset")}
					</button>
					<button type="button" className="island-button" onClick={() => set(next(timer, false))}>
						{t("actions.skip")}
					</button>
				</div>
				<span className="island-dim">{t("rounds", { n: timer.rounds })}</span>
			</div>
		</main>
	);
}

island.onLocaleChange(() => location.reload());

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<Panel />
	</StrictMode>,
);
