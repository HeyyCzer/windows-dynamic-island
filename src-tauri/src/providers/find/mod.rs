//! Find on screen: what's typed in the island is looked for in everything on
//! the screen, pictures included (Windows' OCR). Every match is highlighted
//! like a browser's find in page, and Enter takes the mouse to the next one.
//!
//! The screen is read once when a search starts, with the island left out of
//! the picture; typing then only filters what was read.

mod ocr;
mod overlay;
mod screen;
mod text;

use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{Manager, WebviewWindow};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::SetCursorPos;

use self::overlay::{Mark, Overlay};
use self::text::{Found, Line};
use super::Provider;
use crate::hub::Hub;
use crate::settings::Settings;
use crate::window::ISLAND_LABEL;

pub const ID: &str = "find";
const MOVE_CURSOR_KEY: &str = "find.moveCursor";
/// Time for the highlights and the island to leave the picture before it's taken.
const SETTLE: Duration = Duration::from_millis(80);

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
    /// How long the last reading took (ms).
    took: Option<u64>,
    error: Option<String>,
}

#[derive(Default)]
struct Session {
    lines: Vec<Line>,
    /// Desktop rect of each monitor the lines refer to.
    monitors: Vec<RECT>,
    query: String,
    matches: Vec<Found>,
    current: usize,
    /// The mouse already went to `current`: the next Enter moves on.
    visited: bool,
    state: FindState,
}

impl Session {
    fn rematch(&mut self) {
        self.matches = text::find(&self.lines, &self.query);
        self.current = 0;
        self.visited = false;
    }

    fn state(&mut self) -> FindState {
        self.state.count = self.matches.len();
        self.state.current = (!self.matches.is_empty()).then_some(self.current);
        self.state.clone()
    }

    /// The marks, grouped by monitor.
    fn marks(&self) -> Vec<(RECT, Vec<Mark>)> {
        let mut monitors: Vec<(RECT, Vec<Mark>)> = Vec::new();
        for (i, found) in self.matches.iter().enumerate() {
            let Some(&rect) = self.monitors.get(found.monitor) else { continue };
            let mark = Mark { rect: found.rect, current: i == self.current };
            match monitors.iter_mut().find(|(r, _)| *r == rect) {
                Some((_, marks)) => marks.push(mark),
                None => monitors.push((rect, vec![mark])),
            }
        }
        monitors
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
    fn refresh(&self, session: &mut Session) {
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
                screen::exclude(HWND(hwnd.0), excluded);
            }
            let _ = done.send(());
        });
        let _ = wait.recv_timeout(Duration::from_secs(1));
    }

    fn scan(&self) -> Result<Value, String> {
        {
            let mut s = self.session.lock().unwrap();
            if s.state.scanning {
                return Ok(Value::Null);
            }
            s.state.scanning = true;
            s.state.error = None;
            self.hub.get().ok_or("not started")?.publish(ID, s.state());
        }
        if let Some(Some(overlay)) = self.overlay.get() {
            overlay.hide();
        }
        self.exclude_island(true);
        std::thread::sleep(SETTLE);
        let started = Instant::now();
        let shots: Vec<screen::Shot> = screen::monitors().into_iter().filter_map(screen::capture).collect();
        self.exclude_island(false);
        let read = ocr::read(&shots);

        let mut s = self.session.lock().unwrap();
        s.state.scanning = false;
        match read {
            Ok(lines) => {
                s.lines = lines;
                s.monitors = shots
                    .iter()
                    .map(|shot| RECT {
                        left: shot.left,
                        top: shot.top,
                        right: shot.left + shot.width as i32,
                        bottom: shot.top + shot.height as i32,
                    })
                    .collect();
                s.state.scanned = true;
                s.state.took = Some(started.elapsed().as_millis() as u64);
            }
            Err(e) => s.state.error = Some(e),
        }
        s.rematch();
        self.refresh(&mut s);
        Ok(Value::Null)
    }

    fn step(&self, forward: bool) {
        let mut s = self.session.lock().unwrap();
        let Some(found) = s.step(forward) else { return };
        self.refresh(&mut s);
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
            // Reads the screen again (a search starts, or the refresh button).
            "scan" => return self.scan(),
            // `{ query }`: highlights its matches in what was read.
            "search" => {
                let mut s = self.session.lock().unwrap();
                s.query = payload["query"].as_str().unwrap_or_default().to_string();
                s.rematch();
                self.refresh(&mut s);
            }
            "next" => self.step(true),
            "prev" => self.step(false),
            // The search ended: highlights off, and what was read is dropped.
            "clear" => {
                let mut s = self.session.lock().unwrap();
                *s = Session::default();
                self.refresh(&mut s);
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
}
