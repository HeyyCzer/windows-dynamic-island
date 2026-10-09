//! The highlights: one layered, click-through window per monitor with
//! matches, painted with a translucent box per match (the current one in a
//! stronger color), like a browser's find in page. The windows live on a
//! thread of their own, with its message loop.
//!
//! Each window only spans the matches, never a whole monitor: Windows takes
//! a topmost window that covers one for a fullscreen app (`QUNS_BUSY`), and
//! the island would hide (and notifications hold back).
//!
//! The windows are left out of screen captures, so reading the screen again
//! doesn't need to hide them.

use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
use windows::Win32::Graphics::Gdi::{
    AC_SRC_ALPHA, AC_SRC_OVER, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BLENDFUNCTION, CreateCompatibleDC,
    CreateDIBSection, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, HWND_TOPMOST, MSG, PM_NOREMOVE, PeekMessageW,
    PostThreadMessageW, RegisterClassW, SW_HIDE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SetWindowPos,
    ShowWindow, TranslateMessage, ULW_ALPHA, UpdateLayeredWindow, WM_APP, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};
use windows::core::w;

use super::text::Rect;
use crate::screen;

/// Every match (yellow) and the current one (orange), as `0xRRGGBB`.
const MATCH: u32 = 0xFFD60A;
const CURRENT: u32 = 0xFF9F0A;
/// Room around the text, in pixels.
const PAD: f64 = 3.0;

#[derive(Debug, Clone, Copy)]
pub struct Mark {
    pub rect: Rect,
    pub current: bool,
}

/// The marks on one monitor.
#[derive(Debug, Clone)]
pub struct Group {
    /// Index of the monitor, which keeps its window between searches.
    pub monitor: usize,
    /// The monitor on the desktop.
    pub rect: RECT,
    pub marks: Vec<Mark>,
}

enum Msg {
    /// The monitors with marks; the other windows hide.
    Show(Vec<Group>),
    Hide,
}

pub struct Overlay {
    thread: u32,
    pending: Arc<Mutex<Option<Msg>>>,
}

impl Overlay {
    /// `below`: the island's window, which stays above the highlights.
    pub fn start(below: Option<isize>) -> Option<Self> {
        let pending: Arc<Mutex<Option<Msg>>> = Arc::default();
        let (tx, rx) = mpsc::channel();
        let shared = pending.clone();
        std::thread::spawn(move || run(shared, below, tx));
        let thread = rx.recv().ok()?;
        Some(Self { thread, pending })
    }

    pub fn show(&self, groups: Vec<Group>) {
        self.post(Msg::Show(groups));
    }

    pub fn hide(&self) {
        self.post(Msg::Hide);
    }

    /// Only the latest message matters: a newer one replaces one not handled yet.
    fn post(&self, msg: Msg) {
        *self.pending.lock().unwrap() = Some(msg);
        unsafe {
            let _ = PostThreadMessageW(self.thread, WM_APP, WPARAM(0), LPARAM(0));
        }
    }
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

fn run(pending: Arc<Mutex<Option<Msg>>>, below: Option<isize>, ready: mpsc::Sender<u32>) {
    unsafe {
        let mut msg = MSG::default();
        // A message queue must exist before anyone posts to this thread.
        let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
        let _ = ready.send(GetCurrentThreadId());

        let instance = GetModuleHandleW(None).unwrap_or_default();
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance.into(),
            lpszClassName: w!("DynamicIslandFindHighlights"),
            ..Default::default()
        };
        RegisterClassW(&class);

        // One window per monitor index, made the first time it has marks.
        let mut windows: Vec<(usize, HWND)> = Vec::new();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            if msg.hwnd.is_invalid() && msg.message == WM_APP {
                let next = pending.lock().unwrap().take();
                match next {
                    Some(Msg::Show(groups)) => {
                        for (monitor, hwnd) in &windows {
                            if !groups.iter().any(|g| g.monitor == *monitor) {
                                let _ = ShowWindow(*hwnd, SW_HIDE);
                            }
                        }
                        for group in groups {
                            let hwnd = match window_for(&windows, group.monitor) {
                                Some(hwnd) => hwnd,
                                None => match create(&class, group.rect) {
                                    Some(hwnd) => {
                                        windows.push((group.monitor, hwnd));
                                        hwnd
                                    }
                                    None => continue,
                                },
                            };
                            // Painting moves the window over its marks.
                            let Some(area) = area(group.rect, &group.marks) else { continue };
                            paint(hwnd, area, &group.marks);
                            let after = below.map(|h| HWND(h as *mut _)).unwrap_or(HWND_TOPMOST);
                            let _ = SetWindowPos(
                                hwnd,
                                Some(after),
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                        }
                    }
                    Some(Msg::Hide) => {
                        for (_, hwnd) in &windows {
                            let _ = ShowWindow(*hwnd, SW_HIDE);
                        }
                    }
                    None => {}
                }
                continue;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

/// The part of `monitor` the marks need (with their padding and borders), a
/// pixel short of the whole monitor at most.
fn area(monitor: RECT, marks: &[Mark]) -> Option<RECT> {
    let edges = |m: &Mark| {
        let r = m.rect;
        (
            (r.x - PAD).floor() as i32,
            (r.y - PAD).floor() as i32,
            (r.x + r.w + PAD).ceil() as i32,
            (r.y + r.h + PAD).ceil() as i32,
        )
    };
    let (left, top, right, bottom) = marks.iter().map(edges).reduce(|a, b| (a.0.min(b.0), a.1.min(b.1), a.2.max(b.2), a.3.max(b.3)))?;
    let mut area = RECT {
        left: left.max(monitor.left),
        top: top.max(monitor.top),
        right: right.min(monitor.right),
        bottom: bottom.min(monitor.bottom),
    };
    if area == monitor {
        area.bottom -= 1;
    }
    (area.right > area.left && area.bottom > area.top).then_some(area)
}

fn window_for(windows: &[(usize, HWND)], monitor: usize) -> Option<HWND> {
    windows.iter().find(|(m, _)| *m == monitor).map(|(_, hwnd)| *hwnd)
}

unsafe fn create(class: &WNDCLASSW, rect: RECT) -> Option<HWND> {
    let hwnd = unsafe {
        CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class.lpszClassName,
            w!(""),
            WS_POPUP,
            rect.left,
            rect.top,
            rect.right - rect.left,
            rect.bottom - rect.top,
            None,
            None,
            Some(class.hInstance),
            None,
        )
        .ok()?
    };
    screen::exclude_from_capture(hwnd, true);
    Some(hwnd)
}

/// Premultiplied BGRA of `rgb` at `alpha` (0..=255).
fn pixel(rgb: u32, alpha: u32) -> u32 {
    let channel = |shift: u32| ((rgb >> shift) & 0xFF) * alpha / 255;
    (alpha << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/// Draws the marks of one monitor (`origin` is its top-left on the desktop)
/// into a `width`×`height` buffer.
fn draw(pixels: &mut [u32], width: i32, height: i32, origin: (i32, i32), marks: &[Mark]) {
    // Current last, so it's drawn over a neighbour.
    let mut sorted: Vec<&Mark> = marks.iter().collect();
    sorted.sort_by_key(|m| m.current);
    for mark in sorted {
        let (fill, border, thickness) =
            if mark.current { (pixel(CURRENT, 110), pixel(CURRENT, 255), 3) } else { (pixel(MATCH, 70), pixel(MATCH, 235), 2) };
        // The whole box (border included), then only the part in the buffer:
        // a mark cut by the monitor's edge has no border along the cut.
        let r = mark.rect;
        let x0 = (r.x - PAD).floor() as i32 - origin.0;
        let y0 = (r.y - PAD).floor() as i32 - origin.1;
        let x1 = (r.x + r.w + PAD).ceil() as i32 - origin.0;
        let y1 = (r.y + r.h + PAD).ceil() as i32 - origin.1;
        for y in y0.max(0)..y1.min(height) {
            for x in x0.max(0)..x1.min(width) {
                let edge = x - x0 < thickness || x1 - 1 - x < thickness || y - y0 < thickness || y1 - 1 - y < thickness;
                pixels[(y * width + x) as usize] = if edge { border } else { fill };
            }
        }
    }
}

/// Paints the marks into the window, which takes `area`'s place on the desktop.
unsafe fn paint(hwnd: HWND, area: RECT, marks: &[Mark]) {
    let (width, height) = (area.right - area.left, area.bottom - area.top);
    unsafe {
        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits = std::ptr::null_mut();
        if let Ok(bitmap) = CreateDIBSection(Some(memory), &info, DIB_RGB_COLORS, &mut bits, None, 0)
            && !bits.is_null()
        {
            let pixels = std::slice::from_raw_parts_mut(bits as *mut u32, (width * height) as usize);
            pixels.fill(0);
            draw(pixels, width, height, (area.left, area.top), marks);
            let old = SelectObject(memory, bitmap.into());
            let blend = BLENDFUNCTION {
                BlendOp: AC_SRC_OVER as u8,
                BlendFlags: 0,
                SourceConstantAlpha: 255,
                AlphaFormat: AC_SRC_ALPHA as u8,
            };
            let _ = UpdateLayeredWindow(
                hwnd,
                Some(screen),
                Some(&POINT { x: area.left, y: area.top }),
                Some(&SIZE { cx: width, cy: height }),
                Some(memory),
                Some(&POINT::default()),
                COLORREF(0),
                Some(&blend),
                ULW_ALPHA,
            );
            SelectObject(memory, old);
            let _ = DeleteObject(bitmap.into());
        }
        let _ = DeleteDC(memory);
        ReleaseDC(None, screen);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colors_are_premultiplied() {
        assert_eq!(pixel(0xFFFFFF, 255), 0xFFFF_FFFF);
        assert_eq!(pixel(0xFF0000, 0), 0);
        assert_eq!(pixel(0xFF8000, 128), (128 << 24) | (128 << 16) | (64 << 8));
    }

    #[test]
    fn a_window_spans_only_its_marks() {
        let monitor = RECT { left: 0, top: 0, right: 1920, bottom: 1080 };
        let at = |x, y| Mark { rect: Rect { x, y, w: 50.0, h: 20.0 }, current: false };
        let spans = area(monitor, &[at(100.0, 200.0), at(400.0, 50.0)]).unwrap();
        assert_eq!(spans, RECT { left: 97, top: 47, right: 453, bottom: 223 });
        // Matches in opposite corners: still a pixel short of the monitor.
        let corners = area(monitor, &[at(-10.0, -10.0), at(1900.0, 1070.0)]).unwrap();
        assert_eq!(corners, RECT { left: 0, top: 0, right: 1920, bottom: 1079 });
        assert_eq!(area(monitor, &[]), None);
    }

    #[test]
    fn marks_are_clipped_to_their_monitor() {
        // A 10×10 monitor at (100, 50); a mark hanging off its right edge.
        let mut pixels = vec![0u32; 100];
        let mark = Mark { rect: Rect { x: 106.0, y: 54.0, w: 20.0, h: 2.0 }, current: true };
        draw(&mut pixels, 10, 10, (100, 50), &[mark]);
        assert_eq!(pixels[0], 0);
        // The cut edge is filled, not bordered.
        assert_eq!(pixels[5 * 10 + 9], pixel(CURRENT, 110));
        // x 103..129 → 3..10, y 51..59 → 1..9 once padded and clipped.
        assert_eq!(pixels.iter().filter(|&&p| p != 0).count(), 7 * 8);
    }
}
