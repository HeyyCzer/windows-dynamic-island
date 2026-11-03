//! Native dialogs.

/// Windows' "Open" dialog for one file matching `spec` (`*.mp3;*.wav`), shown
/// as `name`; `None` when cancelled. Blocks until the user picks.
pub fn pick_file(name: &str, spec: &str) -> Option<String> {
    #[cfg(windows)]
    {
        let (name, spec) = (name.to_owned(), spec.to_owned());
        // A thread of its own: the dialog needs a single-threaded apartment.
        std::thread::spawn(move || unsafe { pick_on_this_thread(&name, &spec) })
            .join()
            .ok()
            .flatten()
    }
    #[cfg(not(windows))]
    {
        let _ = (name, spec);
        None
    }
}

#[cfg(windows)]
unsafe fn pick_on_this_thread(name: &str, spec: &str) -> Option<String> {
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
        CoTaskMemFree,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH};
    use windows::core::{HSTRING, PCWSTR};

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let dialog: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
        let (name, spec) = (HSTRING::from(name), HSTRING::from(spec));
        let filters = [COMDLG_FILTERSPEC {
            pszName: PCWSTR(name.as_ptr()),
            pszSpec: PCWSTR(spec.as_ptr()),
        }];
        dialog.SetFileTypes(&filters).ok()?;
        // Err when cancelled.
        dialog.Show(None).ok()?;
        let name = dialog
            .GetResult()
            .ok()?
            .GetDisplayName(SIGDN_FILESYSPATH)
            .ok()?;
        let path = name.to_string().ok();
        CoTaskMemFree(Some(name.0 as _));
        path
    }
}
