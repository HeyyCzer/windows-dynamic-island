//! Which app is behind a window or a process id, by the name people know it
//! by: the exe's "File description" (`Google Chrome`, `Visual Studio Code`),
//! or its file name when it has none. Also its icon.

use std::collections::HashMap;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use base64::Engine;
use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDIBits,
    GetObjectW, HBITMAP,
};
use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Shell::SHDefExtractIconW;
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, GetWindowThreadProcessId, HICON, ICONINFO};
use windows::core::{HSTRING, PWSTR};

use super::clipboard::image::{Picture, encode_png};

static NAMES: LazyLock<Mutex<HashMap<PathBuf, String>>> = LazyLock::new(Mutex::default);
static ICONS: LazyLock<Mutex<HashMap<PathBuf, Option<String>>>> = LazyLock::new(Mutex::default);
/// Side of the icons handed to the UI: sharp in a 46 px badge at 200 %.
const ICON_SIZE: u32 = 96;

pub fn window_pid(hwnd: HWND) -> Option<u32> {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    (pid != 0).then_some(pid)
}

pub fn exe_path(pid: u32) -> Option<PathBuf> {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; MAX_PATH as usize * 2];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(process);
        ok.ok()?;
        Some(PathBuf::from(String::from_utf16_lossy(&buf[..len as usize])))
    }
}

/// Lowercase file name without `.exe` (`snippingtool`).
pub fn exe_stem(path: &Path) -> String {
    path.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// Display name of an exe (cached: it never changes for a given file).
pub fn app_name(path: &Path) -> String {
    if let Some(name) = NAMES.lock().unwrap().get(path) {
        return name.clone();
    }
    let name = file_description(path)
        .filter(|d| !d.trim().is_empty())
        .unwrap_or_else(|| path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default());
    NAMES.lock().unwrap().insert(path.to_path_buf(), name.clone());
    name
}

fn file_description(path: &Path) -> Option<String> {
    unsafe {
        let file = HSTRING::from(path.as_os_str());
        let size = GetFileVersionInfoSizeW(&file, None);
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        GetFileVersionInfoW(&file, None, size, data.as_mut_ptr() as *mut _).ok()?;

        // First language/codepage pair, falling back to US English / Unicode.
        let mut ptr = std::ptr::null_mut();
        let mut len = 0u32;
        let lang = if VerQueryValueW(data.as_ptr() as *const _, &HSTRING::from("\\VarFileInfo\\Translation"), &mut ptr, &mut len)
            .as_bool()
            && len >= 4
        {
            let pair = std::slice::from_raw_parts(ptr as *const u16, 2);
            format!("{:04x}{:04x}", pair[0], pair[1])
        } else {
            "040904b0".to_string()
        };

        let key = HSTRING::from(format!("\\StringFileInfo\\{lang}\\FileDescription"));
        if !VerQueryValueW(data.as_ptr() as *const _, &key, &mut ptr, &mut len).as_bool() || len == 0 {
            return None;
        }
        let chars = std::slice::from_raw_parts(ptr as *const u16, len as usize);
        let end = chars.iter().position(|&c| c == 0).unwrap_or(chars.len());
        Some(String::from_utf16_lossy(&chars[..end]).trim().to_string())
    }
}

/// The exe of a running process by its lowercase stem (`spotify`), if any.
pub fn find_exe(stem: &str) -> Option<PathBuf> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut more = Process32FirstW(snapshot, &mut entry).is_ok();
        let mut found = None;
        while more && found.is_none() {
            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
            if exe_stem(Path::new(&name)) == stem {
                found = exe_path(entry.th32ProcessID);
            }
            more = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
        found
    }
}

/// An exe's icon as a PNG data URL (cached: it never changes for a given file).
pub fn app_icon(path: &Path) -> Option<String> {
    if let Some(icon) = ICONS.lock().unwrap().get(path) {
        return icon.clone();
    }
    let icon = extract_icon(path)
        .and_then(|picture| encode_png(&picture).ok())
        .map(|png| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)));
    ICONS.lock().unwrap().insert(path.to_path_buf(), icon.clone());
    icon
}

fn extract_icon(path: &Path) -> Option<Picture> {
    unsafe {
        let mut icon = HICON::default();
        SHDefExtractIconW(&HSTRING::from(path.as_os_str()), 0, 0, Some(&mut icon), None, ICON_SIZE).ok().ok()?;
        if icon.is_invalid() {
            return None;
        }
        let picture = icon_picture(icon);
        let _ = DestroyIcon(icon);
        picture
    }
}

/// The icon's colors as RGBA. Icons from before alpha channels take their
/// transparency from the mask.
unsafe fn icon_picture(icon: HICON) -> Option<Picture> {
    let mut info = ICONINFO::default();
    unsafe { GetIconInfo(icon, &mut info) }.ok()?;
    let color = unsafe { bitmap_bgra(info.hbmColor) };
    let mask = unsafe { bitmap_bgra(info.hbmMask) };
    unsafe {
        let _ = DeleteObject(info.hbmColor.into());
        let _ = DeleteObject(info.hbmMask.into());
    }
    let (width, height, mut pixels) = color?;
    if pixels.as_chunks::<4>().0.iter().all(|px| px[3] == 0) {
        let mask = mask.filter(|(w, h, _)| *w == width && *h >= height);
        for (i, px) in pixels.as_chunks_mut::<4>().0.iter_mut().enumerate() {
            // A set mask bit is a transparent pixel.
            let transparent = mask.as_ref().is_some_and(|(_, _, m)| m[i * 4] != 0);
            px[3] = if transparent { 0 } else { 255 };
        }
    }
    for px in pixels.as_chunks_mut::<4>().0 {
        px.swap(0, 2);
    }
    Some(Picture { width, height, rgba: pixels })
}

/// A bitmap's pixels as top-down 32-bit BGRA rows.
unsafe fn bitmap_bgra(bitmap: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
    if bitmap.is_invalid() {
        return None;
    }
    let mut bm = BITMAP::default();
    if unsafe { GetObjectW(bitmap.into(), size_of::<BITMAP>() as i32, Some(&raw mut bm as *mut c_void)) } == 0 {
        return None;
    }
    let (width, height) = (bm.bmWidth.unsigned_abs(), bm.bmHeight.unsigned_abs());
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
    let mut pixels = vec![0u8; width as usize * height as usize * 4];
    unsafe {
        let dc = CreateCompatibleDC(None);
        let lines = GetDIBits(dc, bitmap, 0, height, Some(pixels.as_mut_ptr() as *mut c_void), &mut info, DIB_RGB_COLORS);
        let _ = DeleteDC(dc);
        (lines == height as i32).then_some((width, height, pixels))
    }
}
