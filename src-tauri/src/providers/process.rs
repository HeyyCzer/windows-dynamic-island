//! Which app is behind a window or a process id, by the name people know it
//! by: the exe's "File description" (`Google Chrome`, `Visual Studio Code`),
//! or its file name when it has none.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
use windows::core::{HSTRING, PWSTR};

static NAMES: LazyLock<Mutex<HashMap<PathBuf, String>>> = LazyLock::new(Mutex::default);

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
