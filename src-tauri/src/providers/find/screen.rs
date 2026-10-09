//! Pictures of every monitor as the user sees them.

use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC,
    DeleteObject, EnumDisplayMonitors, GetDC, GetDIBits, HDC, HMONITOR, ReleaseDC, SRCCOPY, SelectObject,
};
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
use windows::core::BOOL;

/// A monitor's picture: top-down BGRA rows, placed at `left`/`top` on the desktop.
pub struct Shot {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
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

pub fn capture(rect: RECT) -> Option<Shot> {
    let (width, height) = ((rect.right - rect.left) as u32, (rect.bottom - rect.top) as u32);
    if width == 0 || height == 0 {
        return None;
    }
    unsafe {
        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, width as i32, height as i32);
        let old = SelectObject(memory, bitmap.into());
        let copied = BitBlt(memory, 0, 0, width as i32, height as i32, Some(screen), rect.left, rect.top, SRCCOPY);
        SelectObject(memory, old);

        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bgra = vec![0u8; width as usize * height as usize * 4];
        let lines = GetDIBits(memory, bitmap, 0, height, Some(bgra.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);

        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory);
        ReleaseDC(None, screen);
        (copied.is_ok() && lines == height as i32).then_some(Shot { left: rect.left, top: rect.top, width, height, bgra })
    }
}

/// Leaves `hwnd` out of every screen capture (it stays on screen), or puts it back.
pub fn exclude(hwnd: HWND, excluded: bool) -> bool {
    unsafe { SetWindowDisplayAffinity(hwnd, if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE }) }.is_ok()
}
