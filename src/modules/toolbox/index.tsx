import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "../../components/Glyph";
import { ToolboxIcon } from "../../components/icons";
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
  useEffect(() => { setTimer((value) => value.deadline === null && !value.complete ? { ...value, paused: initial } : value); }, [initial]);
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
export const toolboxModule: IslandModule = { id: "toolbox", title: "toolbox.title", settingsIcon: <ToolboxIcon size={18} />, SettingsSection: ToolboxSettings, useView(): ModuleView {
  const timerMinutes = useSetting(toolboxSettings.timerMinutes); const focusMinutes = useSetting(toolboxSettings.focusMinutes); const selectedTool = useSetting(toolboxSettings.lastTool);
  const focusBreakMinutes = useSetting(toolboxSettings.focusBreakMinutes); const focusAutoNext = useSetting(toolboxSettings.focusAutoNext); const focusAutoBreak = useSetting(toolboxSettings.focusAutoBreak);
  const timer = useTimer(timerMinutes * 60); const focus = useTimer(focusMinutes * 60); const stopwatch = useStopwatch();
  const [onBreak, setOnBreak] = useState(false);
  useEffect(() => {
    if (!focus.complete) return;
    if ((!onBreak && focusAutoBreak) || focusAutoNext) {
      const id = window.setTimeout(() => {
        if (!onBreak && focusAutoBreak) { setOnBreak(true); focus.setSeconds(focusBreakMinutes * 60); focus.toggle(); }
        else if (focusAutoNext) { setOnBreak(false); focus.setSeconds(focusMinutes * 60); focus.toggle(); }
      }, 5_000);
      return () => window.clearTimeout(id);
    }
  }, [focus.complete, focusAutoBreak, focusAutoNext, focusBreakMinutes, focusMinutes, focus, onBreak]);
  const running = timer.running ? timer : focus.running ? focus : null; const completed = timer.complete || focus.complete; const active = !!running || stopwatch.running || completed;
  const time = running ? formatSeconds(running.seconds) : stopwatch.running ? formatSeconds(Math.floor(stopwatch.elapsed / 1000)) : completed ? "00:00" : "";
  const compactWidth = Math.max(112, 46 + time.length * 10); const height = selectedTool === "calculator" || selectedTool === "notes" ? 248 : selectedTool === "focus" ? 176 : 158;
  const timeClass = `toolbox-bubble-time ${onBreak && running === focus ? "is-break" : ""}`;
  const icon = completed ? <span className="toolbox-alert-icon"><span className={timeClass}>{time}</span><i /></span> : active ? <span className={timeClass}>{time}</span> : <ToolboxIcon size={18} color="#8f94ff" />;
  return { active, priority: completed ? 70 : 20, accent: completed ? "#ff5f57" : onBreak && running === focus ? "#34c759" : "#64d2ff", icon, compact: active ? { left: <span className={`toolbox-compact ${onBreak && running === focus ? "is-break" : ""}`}><Glyph name="timer" size={15} color={completed ? "#ff5f57" : onBreak && running === focus ? "#34c759" : "#64d2ff"} />{time}</span>, right: null, width: compactWidth } : undefined, expanded: <ToolboxPanel timer={timer} focus={focus} focusMinutes={focusMinutes} stopwatch={stopwatch} />, expandedSize: { width: 560, height }, attention: completed, forceExpanded: completed };
} };
