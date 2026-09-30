//! GitHub token storage in the Windows Credential Manager, so it never lands in
//! `settings.json` (which is plain text and readable by the frontend).

const TARGET: &str = "dynamic-island:github";

#[cfg(windows)]
pub fn read() -> Option<String> {
    use windows::Win32::Security::Credentials::{CRED_TYPE_GENERIC, CREDENTIALW, CredFree, CredReadW};
    use windows::core::HSTRING;

    unsafe {
        let mut cred: *mut CREDENTIALW = std::ptr::null_mut();
        CredReadW(&HSTRING::from(TARGET), CRED_TYPE_GENERIC, None, &mut cred).ok()?;
        let c = &*cred;
        let blob = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize);
        let token = String::from_utf8(blob.to_vec()).ok();
        CredFree(cred as *const _);
        token.filter(|t| !t.is_empty())
    }
}

#[cfg(windows)]
pub fn write(token: &str) -> Result<(), String> {
    use windows::Win32::Security::Credentials::{
        CRED_FLAGS, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredWriteW,
    };
    use windows::core::{HSTRING, PWSTR};

    let target = HSTRING::from(TARGET);
    let mut blob = token.as_bytes().to_vec();
    let cred = CREDENTIALW {
        Flags: CRED_FLAGS(0),
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_ptr() as *mut _),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };
    unsafe { CredWriteW(&cred, 0) }.map_err(|e| e.to_string())
}

#[cfg(windows)]
pub fn delete() -> Result<(), String> {
    use windows::Win32::Security::Credentials::{CRED_TYPE_GENERIC, CredDeleteW};
    use windows::core::HSTRING;

    match unsafe { CredDeleteW(&HSTRING::from(TARGET), CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        // Nothing stored is fine.
        Err(e) if e.code() == windows::Win32::Foundation::ERROR_NOT_FOUND.to_hresult() => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(not(windows))]
pub fn read() -> Option<String> {
    None
}

#[cfg(not(windows))]
pub fn write(_token: &str) -> Result<(), String> {
    Err("credential storage is only available on Windows".into())
}

#[cfg(not(windows))]
pub fn delete() -> Result<(), String> {
    Ok(())
}
