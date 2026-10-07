//! Secrets (tokens, private links) kept in the Windows Credential Manager, so
//! they never land in `settings.json` (which is plain text and readable by the
//! frontend). Each secret lives under its own `target` name.

/// Largest secret the Credential Manager stores (`CRED_MAX_CREDENTIAL_BLOB_SIZE`).
pub const MAX_LEN: usize = 5 * 512;

#[cfg(windows)]
pub fn read(target: &str) -> Option<String> {
    use windows::Win32::Security::Credentials::{CRED_TYPE_GENERIC, CREDENTIALW, CredFree, CredReadW};
    use windows::core::HSTRING;

    unsafe {
        let mut cred: *mut CREDENTIALW = std::ptr::null_mut();
        CredReadW(&HSTRING::from(target), CRED_TYPE_GENERIC, None, &mut cred).ok()?;
        let c = &*cred;
        let blob = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize);
        let secret = String::from_utf8(blob.to_vec()).ok();
        CredFree(cred as *const _);
        secret.filter(|t| !t.is_empty())
    }
}

#[cfg(windows)]
pub fn write(target: &str, secret: &str) -> Result<(), String> {
    use windows::Win32::Security::Credentials::{
        CRED_FLAGS, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredWriteW,
    };
    use windows::core::{HSTRING, PWSTR};

    if secret.len() > MAX_LEN {
        return Err("too large for the Credential Manager".into());
    }
    let target = HSTRING::from(target);
    let mut blob = secret.as_bytes().to_vec();
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
pub fn delete(target: &str) -> Result<(), String> {
    use windows::Win32::Security::Credentials::{CRED_TYPE_GENERIC, CredDeleteW};
    use windows::core::HSTRING;

    match unsafe { CredDeleteW(&HSTRING::from(target), CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        // Nothing stored is fine.
        Err(e) if e.code() == windows::Win32::Foundation::ERROR_NOT_FOUND.to_hresult() => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(not(windows))]
pub fn read(_target: &str) -> Option<String> {
    None
}

#[cfg(not(windows))]
pub fn write(_target: &str, _secret: &str) -> Result<(), String> {
    Err("credential storage is only available on Windows".into())
}

#[cfg(not(windows))]
pub fn delete(_target: &str) -> Result<(), String> {
    Ok(())
}
