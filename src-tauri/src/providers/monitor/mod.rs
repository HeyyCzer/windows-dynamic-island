//! System monitor: CPU, memory, GPU and network, sampled every second the way
//! Task Manager does (performance counters + `GlobalMemoryStatusEx`), with a
//! minute of history for the panel's charts. When the CPU or the memory stays
//! maxed out, an alert names the app behind it.
//!
//! Samples are always taken (the alerts need them) but only published while
//! the panel is open or the side bubble is on, so the island doesn't redraw
//! every second for nothing.

mod pdh;

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

use self::pdh::{Counter, Query};
use super::activities::{self, Activity, ORANGE, RED};
use super::{process, Provider};
use crate::hub::Hub;
use crate::i18n;
use crate::settings::Settings;

pub const ID: &str = "monitor";
const ENABLED_KEY: &str = "module.monitor.enabled";
const ALERTS_KEY: &str = "monitor.alerts";
const BUBBLE_KEY: &str = "monitor.showBubble";
const TICK: Duration = Duration::from_secs(1);
const HISTORY: usize = 60;
/// How long a maxed-out CPU or memory lasts before the alert.
const SUSTAINED: Duration = Duration::from_secs(30);
const CPU_HIGH: f64 = 90.0;
const CPU_RESET: f64 = 70.0;
const MEMORY_HIGH: f64 = 90.0;
const MEMORY_RESET: f64 = 80.0;
/// At most one alert of each kind this often.
const COOLDOWN: Duration = Duration::from_secs(15 * 60);
const GIB: f64 = 1024.0 * 1024.0 * 1024.0;
/// Adapters that only carry traffic the physical ones already count.
const VIRTUAL_ADAPTERS: &[&str] = &[
    "virtual",
    "vethernet",
    "loopback",
    "isatap",
    "teredo",
    "pseudo",
    "miniport",
    "tap-",
    "wireguard",
    "vpn",
    "bluetooth",
    "kernel debug",
];
/// Not an app you could close.
const NOT_APPS: &[&str] = &["_total", "idle", "memory compression"];

#[derive(Debug, Clone, Copy, Default)]
struct Sample {
    /// Percent.
    cpu: Option<f32>,
    gpu: Option<f32>,
    /// Bytes used, total.
    memory: Option<(u64, u64)>,
    /// Bytes per second.
    down: Option<f64>,
    up: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct History {
    cpu: Vec<f32>,
    memory: Vec<f32>,
    gpu: Vec<f32>,
    down: Vec<f64>,
    up: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct MonitorState {
    cpu: Option<f32>,
    gpu: Option<f32>,
    memory_used: Option<u64>,
    memory_total: Option<u64>,
    down: Option<f64>,
    up: Option<f64>,
    /// Oldest first, one value per second.
    history: History,
    cores: usize,
}

struct Sampler {
    query: Query,
    cpu: Option<Counter>,
    gpu: Option<Counter>,
    down: Option<Counter>,
    up: Option<Counter>,
}

impl Sampler {
    fn open() -> Option<Self> {
        let query = Query::open()?;
        // "Utility" is what Task Manager shows; older systems only have "Time".
        let cpu = query
            .add(r"\Processor Information(_Total)\% Processor Utility")
            .or_else(|| query.add(r"\Processor(_Total)\% Processor Time"));
        let gpu = query.add(r"\GPU Engine(*)\Utilization Percentage");
        let down = query.add(r"\Network Interface(*)\Bytes Received/sec");
        let up = query.add(r"\Network Interface(*)\Bytes Sent/sec");
        query.collect();
        Some(Sampler { query, cpu, gpu, down, up })
    }

    fn sample(&self) -> Sample {
        self.query.collect();
        Sample {
            cpu: self.cpu.as_ref().and_then(Counter::value).map(|v| round(v.clamp(0.0, 100.0))),
            gpu: self.gpu.as_ref().and_then(|c| gpu_usage(&c.values())).map(round),
            memory: memory(),
            down: self.down.as_ref().map(|c| network_total(&c.values())),
            up: self.up.as_ref().map(|c| network_total(&c.values())),
        }
    }
}

fn round(v: f64) -> f32 {
    ((v * 10.0).round() / 10.0) as f32
}

fn memory() -> Option<(u64, u64)> {
    let mut status = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    unsafe { GlobalMemoryStatusEx(&mut status) }.ok()?;
    Some((status.ullTotalPhys.saturating_sub(status.ullAvailPhys), status.ullTotalPhys))
}

/// Like Task Manager: each engine (3D, copy, video…) sums its processes'
/// share, and the GPU is as busy as its busiest engine.
fn gpu_usage(instances: &[(String, f64)]) -> Option<f64> {
    if instances.is_empty() {
        return None;
    }
    let mut engines: HashMap<&str, f64> = HashMap::new();
    for (name, value) in instances {
        // `pid_1234_luid_0x…_0x…_phys_0_eng_3_engtype_3D` → the engine part.
        let engine = name.split_once("_luid_").map_or(name.as_str(), |(_, rest)| rest);
        *engines.entry(engine).or_default() += value;
    }
    Some(engines.into_values().fold(0.0, f64::max).min(100.0))
}

fn network_total(instances: &[(String, f64)]) -> f64 {
    instances
        .iter()
        .filter(|(name, _)| {
            let name = name.to_lowercase();
            !VIRTUAL_ADAPTERS.iter().any(|v| name.contains(v))
        })
        .map(|(_, v)| v.max(0.0))
        .sum()
}

/// Instances grouped by app (`chrome`, `chrome#1`… are all Chrome): the
/// heaviest app, its total and its biggest instance (to find its exe).
fn heaviest(instances: &[(String, f64)]) -> Option<(String, f64, String)> {
    let mut apps: HashMap<String, (f64, &str, f64)> = HashMap::new();
    for (instance, value) in instances {
        let base = instance.split('#').next().unwrap_or(instance).to_lowercase();
        if NOT_APPS.contains(&base.as_str()) {
            continue;
        }
        let app = apps.entry(base).or_insert((0.0, instance, f64::MIN));
        app.0 += value;
        if *value > app.2 {
            app.1 = instance;
            app.2 = *value;
        }
    }
    apps.into_iter()
        .max_by(|a, b| a.1.0.total_cmp(&b.1.0))
        .map(|(name, (total, instance, _))| (name, total, instance.to_string()))
}

/// The app using the most CPU (percent of the whole machine) or memory (bytes).
fn top_app(memory: bool, cores: usize) -> Option<(String, f64)> {
    let query = Query::open()?;
    let counter = query.add(if memory { r"\Process(*)\Working Set - Private" } else { r"\Process(*)\% Processor Time" })?;
    let pids = query.add(r"\Process(*)\ID Process")?;
    // Rates need two samples.
    query.collect();
    std::thread::sleep(Duration::from_secs(1));
    query.collect();
    let (name, total, instance) = heaviest(&counter.values())?;
    let pid = pids.values().into_iter().find(|(n, _)| *n == instance).map(|(_, p)| p as u32);
    let name = pid.and_then(process::exe_path).map(|p| process::app_name(&p)).unwrap_or(name);
    Some((name, if memory { total } else { total / cores.max(1) as f64 }))
}

/// Fires once a value has stayed high for `SUSTAINED`; again only after it
/// went back under the reset level and the cooldown passed.
#[derive(Default)]
struct Watch {
    high_since: Option<Instant>,
    fired: bool,
    last: Option<Instant>,
}

impl Watch {
    fn update(&mut self, value: f64, high: f64, reset: f64, now: Instant) -> bool {
        if value < reset {
            self.fired = false;
        }
        if value < high {
            self.high_since = None;
            return false;
        }
        let since = *self.high_since.get_or_insert(now);
        if self.fired || now.duration_since(since) < SUSTAINED || self.last.is_some_and(|t| now.duration_since(t) < COOLDOWN) {
            return false;
        }
        self.fired = true;
        self.last = Some(now);
        true
    }
}

fn gb(app: &AppHandle, bytes: f64) -> String {
    let v = bytes / GIB;
    let n = if v >= 10.0 { format!("{v:.0}") } else { format!("{v:.1}").replace('.', &i18n::t(app, "system.decimal")) };
    format!("{n} GB")
}

fn alert(id: &str, title: String, subtitle: String, level: f64) {
    let Some(activities) = activities::handle() else { return };
    let mut alert = Activity::alert(format!("system.monitor.{id}"), ID, Duration::from_secs(8));
    alert.title = title;
    alert.subtitle = Some(subtitle);
    alert.icon = Some("warning".into());
    alert.color = Some(if level >= 0.98 { RED } else { ORANGE }.into());
    alert.progress = Some(level.min(1.0));
    alert.priority = 75;
    alert.expand = true;
    activities.upsert(alert);
}

fn alert_cpu(app: &AppHandle, cpu: f64, cores: usize) {
    let subtitle = match top_app(false, cores) {
        Some((name, share)) => {
            i18n::t(app, "system.cpu.top").replace("{app}", &name).replace("{n}", &format!("{share:.0}"))
        }
        None => i18n::t(app, "system.cpu.detail").replace("{n}", &format!("{cpu:.0}")),
    };
    alert("cpu", i18n::t(app, "system.cpu.high"), subtitle, cpu / 100.0);
}

fn alert_memory(app: &AppHandle, used: u64, total: u64) {
    let subtitle = match top_app(true, 1) {
        Some((name, bytes)) => i18n::t(app, "system.memory.top").replace("{app}", &name).replace("{size}", &gb(app, bytes)),
        None => i18n::t(app, "system.memory.detail")
            .replace("{used}", &gb(app, used as f64))
            .replace("{total}", &gb(app, total as f64)),
    };
    alert("memory", i18n::t(app, "system.memory.high"), subtitle, used as f64 / total.max(1) as f64);
}

struct Ctx {
    hub: Arc<Hub>,
    state: Mutex<MonitorState>,
    watching: AtomicBool,
}

impl Ctx {
    fn setting(&self, key: &str, default: bool) -> bool {
        self.hub.app().state::<Settings>().get(key).and_then(|v| v.as_bool()).unwrap_or(default)
    }

    fn publish(&self) {
        let state = self.state.lock().unwrap().clone();
        self.hub.publish(ID, &state);
    }
}

fn snapshot(history: &VecDeque<Sample>, cores: usize) -> MonitorState {
    let last = history.back().copied().unwrap_or_default();
    let percent = |(used, total): (u64, u64)| round(used as f64 * 100.0 / total.max(1) as f64);
    MonitorState {
        cpu: last.cpu,
        gpu: last.gpu,
        memory_used: last.memory.map(|m| m.0),
        memory_total: last.memory.map(|m| m.1),
        down: last.down,
        up: last.up,
        history: History {
            cpu: history.iter().map(|s| s.cpu.unwrap_or(0.0)).collect(),
            memory: history.iter().map(|s| s.memory.map_or(0.0, percent)).collect(),
            gpu: history.iter().map(|s| s.gpu.unwrap_or(0.0)).collect(),
            down: history.iter().map(|s| s.down.unwrap_or(0.0)).collect(),
            up: history.iter().map(|s| s.up.unwrap_or(0.0)).collect(),
        },
        cores,
    }
}

fn run(ctx: Arc<Ctx>) {
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let mut sampler: Option<Sampler> = None;
    let mut history: VecDeque<Sample> = VecDeque::with_capacity(HISTORY);
    let (mut cpu_watch, mut memory_watch) = (Watch::default(), Watch::default());
    loop {
        std::thread::sleep(TICK);
        if !ctx.setting(ENABLED_KEY, true) {
            sampler = None;
            history.clear();
            continue;
        }
        if sampler.is_none() {
            sampler = Sampler::open();
        }
        let Some(s) = sampler.as_ref() else { continue };
        let sample = s.sample();
        if history.len() == HISTORY {
            history.pop_front();
        }
        history.push_back(sample);

        if ctx.setting(ALERTS_KEY, true) {
            let now = Instant::now();
            let app = ctx.hub.app();
            if let Some(cpu) = sample.cpu
                && cpu_watch.update(cpu as f64, CPU_HIGH, CPU_RESET, now)
            {
                alert_cpu(app, cpu as f64, cores);
            }
            if let Some((used, total)) = sample.memory
                && memory_watch.update(used as f64 * 100.0 / total.max(1) as f64, MEMORY_HIGH, MEMORY_RESET, now)
            {
                alert_memory(app, used, total);
            }
        }

        *ctx.state.lock().unwrap() = snapshot(&history, cores);
        if ctx.watching.load(Ordering::Relaxed) || ctx.setting(BUBBLE_KEY, false) {
            ctx.publish();
        }
    }
}

#[derive(Default)]
pub struct MonitorProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

impl Provider for MonitorProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let ctx = Arc::new(Ctx { hub, state: Mutex::default(), watching: AtomicBool::new(false) });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.publish();
        std::thread::spawn(move || run(ctx));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("monitor not started")?;
        match action {
            // The panel is on screen: publish every sample (and the history now).
            "watch" => {
                let on = payload.as_bool().unwrap_or(false);
                ctx.watching.store(on, Ordering::Relaxed);
                if on {
                    ctx.publish();
                }
            }
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn named(list: &[(&str, f64)]) -> Vec<(String, f64)> {
        list.iter().map(|(n, v)| (n.to_string(), *v)).collect()
    }

    #[test]
    fn gpu_is_its_busiest_engine() {
        let engines = named(&[
            ("pid_10_luid_0x0_0x1_phys_0_eng_0_engtype_3D", 30.0),
            ("pid_22_luid_0x0_0x1_phys_0_eng_0_engtype_3D", 25.0),
            ("pid_10_luid_0x0_0x1_phys_0_eng_3_engtype_VideoDecode", 40.0),
        ]);
        assert_eq!(gpu_usage(&engines), Some(55.0));
        assert_eq!(gpu_usage(&[]), None);
        assert_eq!(gpu_usage(&named(&[("pid_1_luid_a_eng_0", 70.0), ("pid_2_luid_a_eng_0", 60.0)])), Some(100.0));
    }

    #[test]
    fn network_skips_virtual_adapters() {
        let adapters = named(&[
            ("Realtek PCIe GbE Family Controller", 1000.0),
            ("Intel[R] Wi-Fi 6 AX201 160MHz", 500.0),
            ("Hyper-V Virtual Ethernet Adapter", 9999.0),
            ("WAN Miniport [IP]", 9999.0),
        ]);
        assert_eq!(network_total(&adapters), 1500.0);
    }

    #[test]
    fn heaviest_groups_instances() {
        let processes = named(&[
            ("_Total", 400.0),
            ("Idle", 300.0),
            ("chrome", 20.0),
            ("chrome#1", 35.0),
            ("chrome#2", 10.0),
            ("code", 50.0),
        ]);
        assert_eq!(heaviest(&processes), Some(("chrome".to_string(), 65.0, "chrome#1".to_string())));
        assert_eq!(heaviest(&named(&[("_Total", 1.0)])), None);
    }

    #[test]
    fn watch_needs_a_sustained_high() {
        let start = Instant::now();
        let at = |s: u64| start + Duration::from_secs(s);
        let mut w = Watch::default();
        assert!(!w.update(95.0, 90.0, 70.0, at(0)));
        assert!(!w.update(95.0, 90.0, 70.0, at(29)));
        assert!(w.update(95.0, 90.0, 70.0, at(30)));
        // Still high: no repeat.
        assert!(!w.update(95.0, 90.0, 70.0, at(120)));
        // A dip under the high mark that doesn't reach the reset level restarts the clock only.
        assert!(!w.update(85.0, 90.0, 70.0, at(121)));
        // Reset, high again for long enough, but inside the cooldown.
        assert!(!w.update(50.0, 90.0, 70.0, at(200)));
        assert!(!w.update(95.0, 90.0, 70.0, at(201)));
        assert!(!w.update(95.0, 90.0, 70.0, at(240)));
        // After the cooldown.
        assert!(!w.update(50.0, 90.0, 70.0, at(1000)));
        assert!(!w.update(95.0, 90.0, 70.0, at(1001)));
        assert!(w.update(95.0, 90.0, 70.0, at(1031)));
    }

    #[test]
    fn a_brief_dip_restarts_the_clock() {
        let start = Instant::now();
        let at = |s: u64| start + Duration::from_secs(s);
        let mut w = Watch::default();
        assert!(!w.update(95.0, 90.0, 70.0, at(0)));
        assert!(!w.update(80.0, 90.0, 70.0, at(20)));
        assert!(!w.update(95.0, 90.0, 70.0, at(21)));
        assert!(!w.update(95.0, 90.0, 70.0, at(40)));
        assert!(w.update(95.0, 90.0, 70.0, at(51)));
    }
}
