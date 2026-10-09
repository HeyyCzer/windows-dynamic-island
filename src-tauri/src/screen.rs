//! Screen pixels through GDI: the monitors, pictures of parts of the desktop,
//! and leaving a window out of them. Shared by "ask about the screen" and
//! "find on screen".

use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, EnumDisplayMonitors, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, HGDIOBJ, HMONITOR, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
use windows::core::BOOL;

/// Top-down BGRA pixels.
pub struct Image {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

impl Image {
    /// The `w`×`h` part at (`x`, `y`), clipped to the picture.
    pub fn crop(&self, x: i32, y: i32, w: i32, h: i32) -> Option<Image> {
        let x = x.clamp(0, self.width as i32) as u32;
        let y = y.clamp(0, self.height as i32) as u32;
        let w = (w.max(0) as u32).min(self.width - x);
        let h = (h.max(0) as u32).min(self.height - y);
        if w == 0 || h == 0 {
            return None;
        }
        let mut bgra = Vec::with_capacity((w * h * 4) as usize);
        for row in y..y + h {
            let start = ((row * self.width + x) * 4) as usize;
            bgra.extend_from_slice(&self.bgra[start..start + (w * 4) as usize]);
        }
        Some(Image { width: w, height: h, bgra })
    }
}

/// Every monitor's rect on the desktop (physical pixels).
pub fn monitors() -> Vec<RECT> {
    unsafe extern "system" fn each(_: HMONITOR, _: HDC, rect: *mut RECT, data: LPARAM) -> BOOL {
        let list = unsafe { &mut *(data.0 as *mut Vec<RECT>) };
        list.push(unsafe { *rect });
        true.into()
    }
    let mut list: Vec<RECT> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&raw mut list as isize));
    }
    list
}

/// What's on screen in `rect` (desktop coordinates).
pub fn area(rect: RECT) -> Option<Image> {
    let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
    if w <= 0 || h <= 0 {
        return None;
    }
    unsafe {
        let screen = GetDC(None);
        let image = grab(w, h, |dc| BitBlt(dc, 0, 0, w, h, Some(screen), rect.left, rect.top, SRCCOPY).is_ok());
        ReleaseDC(None, screen);
        image
    }
}

/// Runs `draw` into a `w`×`h` memory bitmap and reads its pixels back.
pub fn grab(w: i32, h: i32, draw: impl FnOnce(HDC) -> bool) -> Option<Image> {
    unsafe {
        let screen = GetDC(None);
        let dc = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, w, h);
        let previous = SelectObject(dc, HGDIOBJ::from(bitmap));
        let drawn = draw(dc);

        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                // Negative height: top-down rows.
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bgra = vec![0u8; (w * h * 4) as usize];
        SelectObject(dc, previous);
        let lines = GetDIBits(dc, bitmap, 0, h as u32, Some(bgra.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);

        let _ = DeleteObject(HGDIOBJ::from(bitmap));
        let _ = DeleteDC(dc);
        ReleaseDC(None, screen);
        (drawn && lines == h).then_some(Image { width: w as u32, height: h as u32, bgra })
    }
}

/// Leaves `hwnd` out of every screen capture (it stays on screen), or puts it back.
pub fn exclude_from_capture(hwnd: HWND, excluded: bool) {
    let affinity = if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
    if let Err(e) = unsafe { SetWindowDisplayAffinity(hwnd, affinity) } {
        log::warn!("display affinity: {e}");
    }
}
