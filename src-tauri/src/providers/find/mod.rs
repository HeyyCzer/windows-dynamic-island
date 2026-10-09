//! Find on screen: what's typed in the island is looked for in everything on
//! the screen, pictures included (Windows' OCR). Every match is highlighted
//! like a browser's find in page, and Enter takes the mouse to the next one.
//!
//! The screen is read once when a search starts, with the island left out of
//! the picture; typing then only filters what was read.

mod ocr;
mod overlay;
mod text;

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{Manager, WebviewWindow};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::SetCursorPos;

use self::ocr::Shot;
use self::overlay::{Group, Mark, Overlay};
use self::text::{Found, Line};
use super::Provider;
use crate::hub::Hub;
use crate::screen;
use crate::settings::Settings;
use crate::window::ISLAND_LABEL;

pub const ID: &str = "find";
const MOVE_CURSOR_KEY: &str = "find.moveCursor";
/// Time for the island to leave the picture before it's taken.
const SETTLE: Duration = Duration::from_millis(80);

static HOTKEY: Mutex<Option<String>> = Mutex::new(None);

/// Called once the global shortcut is registered.
pub fn set_hotkey(label: Option<String>) {
    *HOTKEY.lock().unwrap() = label;
}

/// Mirrors `FindState` in `src/modules/find/store.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct FindState {
    /// Reading the screen right now.
    scanning: bool,
    /// The screen was read, so the count means something.
    scanned: bool,
    count: usize,
    /// The current match (0-based).
    current: Option<usize>,
    /// `noOcr` (no OCR for the profile's languages) or `failed`.
    error: Option<&'static str>,
    /// Global shortcut that opens the page ("Ctrl+Alt+F").
    hotkey: Option<String>,
}

#[derive(Default)]
struct Session {
    /// Bumped when the search ends, so a reading still going on is dropped.
    generation: u64,
    scanning: bool,
    scanned: bool,
    error: Option<&'static str>,
    lines: Vec<Line>,
    /// Desktop rect of each monitor the lines refer to.
    monitors: Vec<RECT>,
    query: String,
    matches: Vec<Found>,
    current: usize,
    /// The mouse already went to `current`: the next Enter moves on.
    visited: bool,
}

impl Session {
    /// Ends the search: what was read is dropped.
    fn reset(&mut self) {
        *self = Session { generation: self.generation + 1, ..Default::default() };
    }

    fn rematch(&mut self) {
        self.matches = text::find(&self.lines, &self.query);
        self.current = 0;
        self.visited = false;
    }

    fn state(&self) -> FindState {
        FindState {
            scanning: self.scanning,
            scanned: self.scanned,
            count: self.matches.len(),
            current: (!self.matches.is_empty()).then_some(self.current),
            error: self.error,
            hotkey: HOTKEY.lock().unwrap().clone(),
        }
    }

    /// The marks, grouped by monitor.
    fn marks(&self) -> Vec<Group> {
        let mut groups: BTreeMap<usize, Vec<Mark>> = BTreeMap::new();
        for (i, found) in self.matches.iter().enumerate() {
            groups.entry(found.monitor).or_default().push(Mark { rect: found.rect, current: i == self.current });
        }
        groups
            .into_iter()
            .filter_map(|(monitor, marks)| Some(Group { monitor, rect: *self.monitors.get(monitor)?, marks }))
            .collect()
    }

    /// Moves to the next (or previous) match. The first Enter of a search
    /// goes to the match already marked as current.
    fn step(&mut self, forward: bool) -> Option<Found> {
        let n = self.matches.len();
        if n == 0 {
            return None;
        }
        if self.visited {
            self.current = if forward { (self.current + 1) % n } else { (self.current + n - 1) % n };
        } else if !forward {
            self.current = n - 1;
        }
        self.visited = true;
        self.matches.get(self.current).copied()
    }
}

#[derive(Default)]
pub struct FindProvider {
    hub: OnceLock<Arc<Hub>>,
    session: Mutex<Session>,
    overlay: OnceLock<Option<Overlay>>,
}

impl FindProvider {
    fn island(&self) -> Option<WebviewWindow> {
        self.hub.get()?.app().get_webview_window(ISLAND_LABEL)
    }

    fn overlay(&self) -> Option<&Overlay> {
        self.overlay
            .get_or_init(|| {
                let island = self.island().and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
                Overlay::start(island)
            })
            .as_ref()
    }

    /// Shows the highlights (hides them when nothing matches) and publishes.
    fn refresh(&self, session: &Session) {
        if !session.matches.is_empty() {
            if let Some(overlay) = self.overlay() {
                overlay.show(session.marks());
            }
        } else if let Some(Some(overlay)) = self.overlay.get() {
            overlay.hide();
        }
        if let Some(hub) = self.hub.get() {
            hub.publish(ID, session.state());
        }
    }

    /// Leaves the island out of screen captures, or puts it back. Done on
    /// the UI thread, which owns the window.
    fn exclude_island(&self, excluded: bool) {
        let (Some(hub), Some(win)) = (self.hub.get(), self.island()) else { return };
        let (done, wait) = mpsc::channel();
        let _ = hub.app().run_on_main_thread(move || {
            if let Ok(hwnd) = win.hwnd() {
                screen::exclude_from_capture(HWND(hwnd.0), excluded);
            }
            let _ = done.send(());
        });
        let _ = wait.recv_timeout(Duration::from_secs(1));
    }

    /// Every monitor as it is now, without the island (the highlights are
    /// never in captures).
    fn capture(&self) -> Vec<Shot> {
        self.exclude_island(true);
        std::thread::sleep(SETTLE);
        let shots = screen::monitors()
            .into_iter()
            .filter_map(|rect| Some(Shot { rect, image: screen::area(rect)? }))
            .collect();
        self.exclude_island(false);
        shots
    }

    fn scan(&self) {
        let generation = {
            let mut s = self.session.lock().unwrap();
            if s.scanning {
                return;
            }
            s.scanning = true;
            s.error = None;
            self.refresh(&s);
            s.generation
        };
        let shots = self.capture();
        let read = ocr::read(&shots);

        let mut s = self.session.lock().unwrap();
        // The search ended while reading: what was read goes nowhere.
        if s.generation != generation {
            return;
        }
        s.scanning = false;
        match read {
            Ok(lines) => {
                s.lines = lines;
                s.monitors = shots.iter().map(|shot| shot.rect).collect();
                s.scanned = true;
            }
            Err(e) => {
                s.lines.clear();
                s.monitors.clear();
                s.scanned = false;
                s.error = Some(e);
            }
        }
        s.rematch();
        self.refresh(&s);
    }

    fn step(&self, forward: bool) {
        let found = {
            let mut s = self.session.lock().unwrap();
            let Some(found) = s.step(forward) else { return };
            self.refresh(&s);
            found
        };
        let move_cursor = self
            .hub
            .get()
            .and_then(|hub| hub.app().state::<Settings>().get(MOVE_CURSOR_KEY))
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        if move_cursor {
            let (x, y) = found.rect.center();
            unsafe {
                let _ = SetCursorPos(x.round() as i32, y.round() as i32);
            }
        }
    }
}

impl Provider for FindProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        hub.publish(ID, FindState::default());
        let _ = self.hub.set(hub);
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        match action {
            // Reads the screen (a search starts, or the refresh button).
            "scan" => self.scan(),
            // `{ query }`: highlights its matches in what was read.
            "search" => {
                let mut s = self.session.lock().unwrap();
                s.query = payload["query"].as_str().unwrap_or_default().to_string();
                s.rematch();
                self.refresh(&s);
            }
            "next" => self.step(true),
            "prev" => self.step(false),
            // The search ended: highlights off, and what was read is dropped.
            "clear" => {
                let mut s = self.session.lock().unwrap();
                s.reset();
                self.refresh(&s);
            }
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::text::{Rect, Word};
    use super::*;

    fn session(words: &[&str]) -> Session {
        let line = Line {
            monitor: 0,
            words: words
                .iter()
                .enumerate()
                .map(|(i, w)| Word { text: w.to_string(), rect: Rect { x: i as f64 * 100.0, y: 0.0, w: 80.0, h: 20.0 } })
                .collect(),
        };
        let mut s = Session { lines: vec![line], query: "go".into(), ..Default::default() };
        s.rematch();
        s
    }

    #[test]
    fn the_first_enter_goes_to_the_first_match() {
        let mut s = session(&["go", "stop", "go", "go"]);
        assert_eq!(s.step(true).map(|f| f.rect.x), Some(0.0));
        assert_eq!(s.step(true).map(|f| f.rect.x), Some(200.0));
        assert_eq!(s.step(true).map(|f| f.rect.x), Some(300.0));
        // Wraps around.
        assert_eq!(s.step(true).map(|f| f.rect.x), Some(0.0));
        assert_eq!(s.step(false).map(|f| f.rect.x), Some(300.0));
    }

    #[test]
    fn shift_enter_first_goes_to_the_last_match() {
        let mut s = session(&["go", "go", "go"]);
        assert_eq!(s.step(false).map(|f| f.rect.x), Some(200.0));
    }

    #[test]
    fn typing_starts_over() {
        let mut s = session(&["go", "go"]);
        s.step(true);
        s.step(true);
        s.rematch();
        assert_eq!(s.current, 0);
        assert_eq!(s.step(true).map(|f| f.rect.x), Some(0.0));
    }

    #[test]
    fn nothing_to_step_through() {
        let mut s = session(&["stop"]);
        assert_eq!(s.step(true), None);
        assert_eq!(s.state().current, None);
    }

    #[test]
    fn ending_the_search_drops_what_was_read() {
        let mut s = session(&["go"]);
        s.scanned = true;
        let before = s.generation;
        s.reset();
        assert!(s.lines.is_empty() && s.matches.is_empty() && !s.scanned);
        assert_ne!(s.generation, before);
    }

    #[test]
    fn marks_are_grouped_by_monitor() {
        let mut s = session(&["go", "go"]);
        let other = Line { monitor: 1, ..s.lines[0].clone() };
        s.lines.push(other);
        s.monitors = vec![RECT { right: 1920, bottom: 1080, ..Default::default() }; 2];
        s.rematch();
        let groups = s.marks();
        assert_eq!(groups.iter().map(|g| (g.monitor, g.marks.len())).collect::<Vec<_>>(), [(0, 2), (1, 2)]);
        assert!(groups[0].marks[0].current && !groups[1].marks[0].current);
    }
}
