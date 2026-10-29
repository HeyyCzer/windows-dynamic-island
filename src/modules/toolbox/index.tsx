import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "../../components/Glyph";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { ToolboxPanel, formatSeconds } from "./ToolboxPanel";
import { ToolboxSettings } from "./ToolboxSettings";
import { toolboxSettings } from "./settings";
import "./toolbox.css";

type Timer = { deadline: number | null; paused: number; complete: boolean };
function useTimer(initial: number) {
  const [timer, setTimer] = useState<Timer>({ deadline: null, paused: initial, complete: false });
  const now = useNow(500, timer.deadline !== null);
  const seconds = timer.deadline === null ? timer.paused : Math.max(0, Math.ceil((timer.deadline - now) / 1000));
  const running = timer.deadline !== null && seconds > 0;
  useEffect(() => { if (timer.deadline !== null && seconds === 0) setTimer({ deadline: null, paused: 0, complete: true }); }, [seconds, timer.deadline]);
  const setSeconds = useCallback((value: number) => setTimer({ deadline: null, paused: Math.max(0, Math.min(59_940, value)), complete: false }), []);
  const toggle = useCallback(() => setTimer((v) => v.deadline ? { deadline: null, paused: Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)), complete: false } : { ...v, complete: false, deadline: v.paused ? Date.now() + v.paused * 1000 : null }), []);
  return { seconds, running, complete: timer.complete, toggle, reset: () => setTimer({ deadline: null, paused: initial, complete: false }), setSeconds, acknowledge: () => setTimer((v) => ({ ...v, complete: false })) };
}
function useStopwatch() {
  const [startedAt, setStartedAt] = useState<number | null>(null); const [elapsed, setElapsed] = useState(0); const base = useRef(0);
  useEffect(() => { if (startedAt === null) return; const id = window.setInterval(() => setElapsed(base.current + Date.now() - startedAt), 43); return () => window.clearInterval(id); }, [startedAt]);
  const toggle = () => { if (startedAt === null) { base.current = elapsed; setStartedAt(Date.now()); } else { const next = base.current + Date.now() - startedAt; base.current = next; setElapsed(next); setStartedAt(null); } };
  return { elapsed, running: startedAt !== null, toggle, reset: () => { base.current = 0; setStartedAt(null); setElapsed(0); }, setElapsed: (v: number) => { base.current = v; setStartedAt(null); setElapsed(v); } };
}
export const toolboxModule: IslandModule = { id: "toolbox", title: "toolbox.title", settingsIcon: <Glyph name="code" size={14} />, SettingsSection: ToolboxSettings, useView(): ModuleView {
  const timerMinutes = useSetting(toolboxSettings.timerMinutes); const focusMinutes = useSetting(toolboxSettings.focusMinutes); const selectedTool = useSetting(toolboxSettings.lastTool);
  const timer = useTimer(timerMinutes * 60); const focus = useTimer(focusMinutes * 60); const stopwatch = useStopwatch();
  const running = timer.running ? timer : focus.running ? focus : null; const completed = timer.complete || focus.complete; const active = !!running || stopwatch.running || completed;
  const time = running ? formatSeconds(running.seconds) : stopwatch.running ? formatSeconds(Math.floor(stopwatch.elapsed / 1000)) : "";
  const compactWidth = Math.max(112, 46 + time.length * 10); const height = selectedTool === "calculator" || selectedTool === "notes" ? 248 : selectedTool === "focus" ? 176 : 158;
  const icon = completed ? <span className="toolbox-alert-icon"><span className="toolbox-bubble-time">{time}</span><i /></span> : active ? <span className="toolbox-bubble-time">{time}</span> : <Glyph name="code" size={14} color="#64d2ff" />;
  return { active, priority: completed ? 70 : 20, accent: completed ? "#ff5f57" : "#64d2ff", icon, compact: active ? { left: <span className="toolbox-compact"><Glyph name="timer" size={15} color={completed ? "#ff5f57" : "#64d2ff"} />{time}</span>, right: null, width: compactWidth } : undefined, expanded: <ToolboxPanel timer={timer} focus={focus} stopwatch={stopwatch} />, expandedSize: { width: 560, height }, attention: completed, forceExpanded: completed };
} };
