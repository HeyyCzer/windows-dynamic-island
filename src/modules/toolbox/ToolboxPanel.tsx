import { useEffect, useMemo, useState } from "react";
import { Glyph } from "../../components/Glyph";
import { useT } from "../../core/i18n";
import { inOrder, readSetting, useSettings } from "../../core/settings";
import { TOOLBOX_TOOLS, toolboxSettings, toolboxToolSettings, toolboxToolTitleKeys, type ToolboxToolId } from "./settings";

const TOOL_ICONS: Record<ToolboxToolId, string> = { calculator: "code", timer: "timer", stopwatch: "clock", focus: "heart" };
const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "=", "+"];

export function ToolboxPanel() {
  const t = useT();
  const values = useSettings();
  const tools = useMemo(() => inOrder(TOOLBOX_TOOLS.filter((id) => readSetting(values, toolboxToolSettings[id])), (id) => id, readSetting(values, toolboxSettings.toolOrder)), [values]);
  const [selected, setSelected] = useState<ToolboxToolId | null>(() => tools[0] ?? null);
  const active = selected && tools.includes(selected) ? selected : (tools[0] ?? null);
  useEffect(() => { if (active !== selected) setSelected(active); }, [active, selected]);
  if (!active) return <div className="toolbox-empty">{t("toolbox.empty")}</div>;
  return (
    <div className="toolbox-panel" onClick={(e) => e.stopPropagation()}>
      <nav className="toolbox-nav" aria-label={t("toolbox.title")}>
        {tools.map((id) => <button key={id} className={`toolbox-nav-button ${id === active ? "is-active" : ""}`} title={t(toolboxToolTitleKeys[id])} onClick={() => setSelected(id)}><Glyph name={TOOL_ICONS[id]} size={15} /></button>)}
      </nav>
      <div className="toolbox-content">
        {active === "calculator" && <Calculator />}
        {active === "timer" && <Countdown />}
        {active === "stopwatch" && <Stopwatch />}
        {active === "focus" && <FocusTimer />}
      </div>
    </div>
  );
}

function Calculator() {
  const t = useT();
  const [expression, setExpression] = useState("0");
  const [result, setResult] = useState<string | null>(null);
  const press = (key: string) => {
    if (key === "=") {
      const value = evaluate(expression);
      setResult(value ?? t("toolbox.calculator.error"));
      if (value !== null) setExpression(value);
      return;
    }
    setResult(null);
    const mapped = key.replace("×", "*").replace("÷", "/").replace("−", "-");
    setExpression((current) => current === "0" && !/[+*/-]/.test(mapped) ? mapped : current + mapped);
  };
  return <section className="toolbox-calculator"><div className="toolbox-heading"><Glyph name="code" size={17} /><span>{t("toolbox.calculator.title")}</span></div><output className="toolbox-display" aria-live="polite">{result ?? expression}</output><div className="toolbox-keypad"><button className="toolbox-key clear" onClick={() => { setExpression("0"); setResult(null); }}>{t("toolbox.calculator.clear")}</button><button className="toolbox-key clear" onClick={() => { setExpression((value) => value.length > 1 ? value.slice(0, -1) : "0"); setResult(null); }}>⌫</button>{KEYS.map((key) => <button key={key} className={`toolbox-key ${/[÷×−+=]/.test(key) ? "operator" : ""}`} onClick={() => press(key)}>{key}</button>)}</div></section>;
}

function Countdown() {
  const t = useT();
  const [seconds, setSeconds] = useState(300);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (!running || seconds === 0) return; const id = window.setInterval(() => setSeconds((n) => n - 1), 1000); return () => window.clearInterval(id); }, [running, seconds]);
  useEffect(() => { if (seconds === 0) setRunning(false); }, [seconds]);
  return <TimerTool icon="timer" title={t("toolbox.timer.title")} seconds={seconds} running={running} onStart={() => setRunning((v) => !v)} onReset={() => { setRunning(false); setSeconds(300); }} onAdjust={(delta) => { setRunning(false); setSeconds((v) => Math.max(0, Math.min(59_940, v + delta))); }} />;
}

function Stopwatch() {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const startedAt = performance.now() - elapsed;
    const id = window.setInterval(() => setElapsed(performance.now() - startedAt), 43);
    return () => window.clearInterval(id);
    // The elapsed value is intentionally captured only when starting/resuming.
    // Updating it every tick must not recreate the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return <section className="toolbox-timer"><div className="toolbox-heading"><Glyph name="clock" size={17} /><span>{t("toolbox.stopwatch.title")}</span></div><strong className="toolbox-time">{formatElapsed(elapsed)}</strong><div className="toolbox-actions"><button className="toolbox-action secondary" onClick={() => { setRunning(false); setElapsed(0); }}>{t("toolbox.reset")}</button><button className="toolbox-action primary" onClick={() => setRunning((v) => !v)}>{t(running ? "toolbox.pause" : "toolbox.start")}</button></div></section>;
}

function FocusTimer() {
  const t = useT();
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (!running || seconds === 0) return; const id = window.setInterval(() => setSeconds((n) => n - 1), 1000); return () => window.clearInterval(id); }, [running, seconds]);
  useEffect(() => { if (seconds === 0) setRunning(false); }, [seconds]);
  return <TimerTool icon="heart" title={t("toolbox.focus.title")} subtitle={t("toolbox.focus.desc")} seconds={seconds} running={running} onStart={() => setRunning((v) => !v)} onReset={() => { setRunning(false); setSeconds(25 * 60); }} onAdjust={(delta) => { setRunning(false); setSeconds((v) => Math.max(60, Math.min(59_940, v + delta))); }} />;
}

function TimerTool({ icon, title, subtitle, seconds, running, onStart, onReset, onAdjust }: { icon: string; title: string; subtitle?: string; seconds: number; running: boolean; onStart: () => void; onReset: () => void; onAdjust: (seconds: number) => void }) {
  const t = useT();
  return <section className="toolbox-timer"><div className="toolbox-heading"><Glyph name={icon} size={17} /><span>{title}</span></div>{subtitle && <span className="toolbox-subtitle">{subtitle}</span>}<strong className="toolbox-time">{formatSeconds(seconds)}</strong><div className="toolbox-adjust"><button onClick={() => onAdjust(-60)}>− 1 min</button><button onClick={() => onAdjust(60)}>+ 1 min</button></div><div className="toolbox-actions"><button className="toolbox-action secondary" onClick={onReset}>{t("toolbox.reset")}</button><button className="toolbox-action primary" onClick={onStart}>{t(running ? "toolbox.pause" : "toolbox.start")}</button></div></section>;
}

function formatSeconds(seconds: number) { const minutes = Math.floor(seconds / 60); return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function formatElapsed(milliseconds: number) { const total = Math.floor(milliseconds / 1000); return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}.${String(Math.floor((milliseconds % 1000) / 10)).padStart(2, "0")}`; }

/** A tiny arithmetic parser: accepts only numbers, parentheses and four operators. */
function evaluate(input: string): string | null {
  try {
    const tokens = input.match(/\d*\.?\d+|[()+\-*/]/g);
    if (!tokens || tokens.join("") !== input) throw new Error();
    const values: number[] = []; const operators: string[] = []; const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
    const apply = () => { const op = operators.pop(); const right = values.pop(); const left = values.pop(); if (op == null || left == null || right == null || (op === "/" && right === 0)) throw new Error(); values.push(op === "+" ? left + right : op === "-" ? left - right : op === "*" ? left * right : left / right); };
    for (const token of tokens) { if (/^\d/.test(token)) values.push(Number(token)); else if (token === "(") operators.push(token); else if (token === ")") { while (operators.at(-1) && operators.at(-1) !== "(") apply(); if (operators.pop() !== "(") throw new Error(); } else { while (operators.at(-1) && operators.at(-1) !== "(" && precedence[operators.at(-1)!] >= precedence[token]) apply(); operators.push(token); } }
    while (operators.length) apply(); if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error(); return String(Number(values[0].toFixed(10)));
  } catch { return null; }
}
