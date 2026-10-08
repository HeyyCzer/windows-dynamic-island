//! Files dragged in from other apps (Explorer…) onto the island.
//!
//! wry has a drop handler, but it only hooks the webview's child windows that
//! exist when the webview is created. The island starts hidden and WebView2
//! creates (and replaces) its windows later, so OLE found no target there and
//! showed the "no" cursor. This one is registered on the island window and
//! every child it has right now, each time a drag comes near (`window.rs`).
//!
//! The frontend gets `island://file-drop` events (see `useFileDrop.ts`).

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

pub const EVENT: &str = "island://file-drop";

#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum DropEvent {
    Enter,
    Leave,
    Drop { paths: Vec<String> },
}

/// (Re)registers the drop target. Must run on the window's thread.
#[cfg(windows)]
pub fn hook(app: &AppHandle, win: &WebviewWindow) {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::System::Ole::{IDropTarget, RegisterDragDrop, RevokeDragDrop};
    use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

    let Ok(hwnd) = win.hwnd() else {
        return;
    };
    let hwnd = HWND(hwnd.0);
    let target: IDropTarget = imp::Target::new(app.clone()).into();

    let register = |h: HWND| unsafe {
        // Replaces wry's (or WebView2's own) target; fails quietly on windows
        // of another process.
        let _ = RevokeDragDrop(h);
        let _ = RegisterDragDrop(h, &target);
    };
    register(hwnd);

    unsafe extern "system" fn each(h: HWND, lparam: LPARAM) -> BOOL {
        let f = unsafe { &mut *(lparam.0 as *mut &mut dyn FnMut(HWND)) };
        f(h);
        true.into()
    }
    let mut f = register;
    let mut dyn_f: &mut dyn FnMut(HWND) = &mut f;
    let _ = unsafe { EnumChildWindows(Some(hwnd), Some(each), LPARAM(&mut dyn_f as *mut _ as isize)) };
}

#[cfg(not(windows))]
pub fn hook(_: &AppHandle, _: &WebviewWindow) {}

#[cfg(windows)]
mod imp {
    use std::cell::Cell;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    use tauri::{AppHandle, Emitter};
    use windows::core::{implement, Ref};
    use windows::Win32::Foundation::POINTL;
    use windows::Win32::System::Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
    use windows::Win32::System::Ole::{
        IDropTarget, IDropTarget_Impl, ReleaseStgMedium, CF_HDROP, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
    };
    use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    use super::{DropEvent, EVENT};

    #[implement(IDropTarget)]
    pub struct Target {
        app: AppHandle,
        /// The dragged thing holds files (text, links… aren't taken).
        files: Cell<bool>,
    }

    impl Target {
        pub fn new(app: AppHandle) -> Self {
            Self { app, files: Cell::new(false) }
        }

        fn emit(&self, event: DropEvent) {
            let _ = self.app.emit(EVENT, event);
        }
    }

    /// Paths in the data object, if it carries files.
    fn paths(data: Ref<IDataObject>) -> Option<Vec<String>> {
        let format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let data = data.as_ref()?;
        let mut medium = unsafe { data.GetData(&format) }.ok()?;
        let hdrop = HDROP(unsafe { medium.u.hGlobal.0 });
        let count = unsafe { DragQueryFileW(hdrop, u32::MAX, None) };
        let paths = (0..count)
            .map(|i| {
                let len = unsafe { DragQueryFileW(hdrop, i, None) } as usize;
                let mut buf = vec![0u16; len + 1];
                unsafe { DragQueryFileW(hdrop, i, Some(&mut buf)) };
                OsString::from_wide(&buf[..len]).to_string_lossy().into_owned()
            })
            .collect();
        unsafe { ReleaseStgMedium(&mut medium) };
        Some(paths)
    }

    impl IDropTarget_Impl for Target_Impl {
        fn DragEnter(
            &self,
            data: Ref<IDataObject>,
            _keys: MODIFIERKEYS_FLAGS,
            _pt: &POINTL,
            effect: *mut DROPEFFECT,
        ) -> windows::core::Result<()> {
            let files = paths(data).is_some_and(|p| !p.is_empty());
            self.files.set(files);
            if files {
                self.emit(DropEvent::Enter);
            }
            // Copy: the source keeps its files (the shelf only keeps a reference).
            unsafe { *effect = if files { DROPEFFECT_COPY } else { DROPEFFECT_NONE } };
            Ok(())
        }

        fn DragOver(&self, _keys: MODIFIERKEYS_FLAGS, _pt: &POINTL, effect: *mut DROPEFFECT) -> windows::core::Result<()> {
            unsafe { *effect = if self.files.get() { DROPEFFECT_COPY } else { DROPEFFECT_NONE } };
            Ok(())
        }

        fn DragLeave(&self) -> windows::core::Result<()> {
            if self.files.replace(false) {
                self.emit(DropEvent::Leave);
            }
            Ok(())
        }

        fn Drop(
            &self,
            data: Ref<IDataObject>,
            _keys: MODIFIERKEYS_FLAGS,
            _pt: &POINTL,
            effect: *mut DROPEFFECT,
        ) -> windows::core::Result<()> {
            if !self.files.replace(false) {
                unsafe { *effect = DROPEFFECT_NONE };
                return Ok(());
            }
            match paths(data) {
                Some(paths) if !paths.is_empty() => {
                    self.emit(DropEvent::Drop { paths });
                    unsafe { *effect = DROPEFFECT_COPY };
                }
                _ => {
                    self.emit(DropEvent::Leave);
                    unsafe { *effect = DROPEFFECT_NONE };
                }
            }
            Ok(())
        }
    }
}
