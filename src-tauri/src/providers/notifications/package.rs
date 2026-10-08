//! Sparse package ("package with external location"): gives the plain
//! executable a package identity, which Windows requires before an app may
//! read notifications (`UserNotificationListener`).
//!
//! The manifest and its logos are written to the app data folder and point at
//! the folder the exe runs from. The exe's embedded manifest (`app.manifest`,
//! see `build.rs`) carries the matching `<msix>` element, which Windows
//! ignores until the package is registered. Registering an unsigned package
//! needs Windows Developer Mode.

use tauri::{AppHandle, Manager};
use windows::core::HSTRING;
use windows::ApplicationModel::Package;
use windows::Foundation::Uri;
use windows::Management::Deployment::{PackageManager, RegisterPackageOptions};

/// Must match the `<msix>` element in `src-tauri/app.manifest`.
const NAME: &str = "DynamicIsland";
const PUBLISHER: &str = "CN=DynamicIsland";

/// `icons/package/<name>`, written under the same name.
macro_rules! taskbar {
    ($($name:literal),* $(,)?) => {
        [$(($name, include_bytes!(concat!("../../../icons/package/", $name)) as &[u8])),*]
    };
}

/// With a package identity the taskbar shows the package's logo, not the
/// window's icon, and it only looks for these `targetsize` variants: without
/// them every window of the app gets a blank grey tile.
const TASKBAR: [(&str, &[u8]); 10] = taskbar![
    "Square44x44Logo.targetsize-16_altform-unplated.png",
    "Square44x44Logo.targetsize-24_altform-unplated.png",
    "Square44x44Logo.targetsize-32_altform-unplated.png",
    "Square44x44Logo.targetsize-48_altform-unplated.png",
    "Square44x44Logo.targetsize-256_altform-unplated.png",
    "Square44x44Logo.targetsize-16_altform-lightunplated.png",
    "Square44x44Logo.targetsize-24_altform-lightunplated.png",
    "Square44x44Logo.targetsize-32_altform-lightunplated.png",
    "Square44x44Logo.targetsize-48_altform-lightunplated.png",
    "Square44x44Logo.targetsize-256_altform-lightunplated.png",
];

const ASSETS: &[(&str, &[u8])] = &[
    ("StoreLogo.png", include_bytes!("../../../icons/StoreLogo.png")),
    ("Square44x44Logo.png", include_bytes!("../../../icons/Square44x44Logo.png")),
    ("Square150x150Logo.png", include_bytes!("../../../icons/Square150x150Logo.png")),
];

pub fn has_identity() -> bool {
    Package::Current().is_ok()
}

pub fn register(app: &AppHandle) -> Result<(), String> {
    deploy(app, false)
}

/// The package keeps the logos and manifest it was registered with (the
/// taskbar indexes them then; files added later are ignored). After an
/// update, register this version over it. It's in use (by this very
/// process), so Windows applies it the next time the app starts.
pub fn refresh_registration(app: &AppHandle) {
    let Ok(current) = Package::Current().and_then(|p| p.Id()).and_then(|id| id.Version()) else {
        return;
    };
    let v = &app.package_info().version;
    if (current.Major as u64, current.Minor as u64, current.Build as u64) == (v.major, v.minor, v.patch) {
        return;
    }
    if let Err(e) = deploy(app, true) {
        log::warn!("notifications: package update failed: {e}");
    }
}

/// `in_place`: update the package registered from this same folder instead
/// of removing it first (removing it would end this process).
fn deploy(app: &AppHandle, in_place: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("no exe folder")?;
    let exe_name = exe.file_name().ok_or("no exe name")?.to_string_lossy().to_string();

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("package");
    write_assets(&dir)?;
    let manifest = dir.join("AppxManifest.xml");
    let version = app.package_info().version.clone();
    let xml = MANIFEST
        .replace("{name}", NAME)
        .replace("{publisher}", PUBLISHER)
        .replace("{version}", &format!("{}.{}.{}.0", version.major, version.minor, version.patch))
        .replace("{exe}", &xml_escape(&exe_name));
    std::fs::write(&manifest, xml).map_err(|e| e.to_string())?;

    let result: windows::core::Result<()> = (|| {
        let manager = PackageManager::new()?;
        // A previous registration may point at another folder; replace it.
        if !in_place {
            let existing = manager.FindPackagesByUserSecurityIdNamePublisher(
                &HSTRING::new(),
                &HSTRING::from(NAME),
                &HSTRING::from(PUBLISHER),
            )?;
            let it = existing.First()?;
            while it.HasCurrent()? {
                let full_name = it.Current()?.Id()?.FullName()?;
                let _ = manager.RemovePackageAsync(&full_name)?.join();
                it.MoveNext()?;
            }
        }

        let options = RegisterPackageOptions::new()?;
        options.SetExternalLocationUri(&Uri::CreateUri(&HSTRING::from(file_uri(exe_dir, true)))?)?;
        options.SetDeveloperMode(true)?;
        options.SetDeferRegistrationWhenPackagesAreInUse(in_place)?;
        let deployment = manager
            .RegisterPackageByUriAsync(&Uri::CreateUri(&HSTRING::from(file_uri(&manifest, false)))?, &options)?
            .join()?;
        let code = deployment.ExtendedErrorCode()?;
        if code.is_err() {
            let text = deployment.ErrorText().map(|t| t.to_string()).unwrap_or_default();
            return Err(windows::core::Error::new(code, text));
        }
        Ok(())
    })();
    result.map_err(|e| e.message())
}

fn write_assets(dir: &std::path::Path) -> Result<(), String> {
    let assets = dir.join("Assets");
    std::fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
    for (name, bytes) in ASSETS.iter().chain(TASKBAR.iter()) {
        std::fs::write(assets.join(name), bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Packages registered by older versions lack the taskbar logos; the package
/// folder is plain files, so adding them is enough (no re-registration).
pub fn refresh_assets() {
    let Ok(dir) = Package::Current().and_then(|p| p.InstalledPath()) else {
        return;
    };
    let dir = std::path::PathBuf::from(dir.to_string());
    if TASKBAR.iter().all(|(name, _)| dir.join("Assets").join(name).exists()) {
        return;
    }
    if let Err(e) = write_assets(&dir) {
        log::warn!("notifications: package assets: {e}");
    }
}

/// `file:///C:/path%20with%20spaces/` (folders end with a slash).
fn file_uri(path: &std::path::Path, folder: bool) -> String {
    let mut text = path.to_string_lossy().replace('\\', "/");
    if folder && !text.ends_with('/') {
        text.push('/');
    }
    let encoded: String = text
        .chars()
        .map(|c| match c {
            ' ' => "%20".into(),
            '#' => "%23".into(),
            '%' => "%25".into(),
            c => c.to_string(),
        })
        .collect();
    format!("file:///{encoded}")
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

const MANIFEST: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:desktop6="http://schemas.microsoft.com/appx/manifest/desktop/windows10/6"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap3 uap10 desktop6 rescap">
  <Identity Name="{name}" Publisher="{publisher}" Version="{version}" ProcessorArchitecture="neutral" />
  <Properties>
    <DisplayName>Dynamic Island</DisplayName>
    <PublisherDisplayName>Dynamic Island</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <uap10:AllowExternalContent>true</uap10:AllowExternalContent>
    <desktop6:RegistryWriteVirtualization>disabled</desktop6:RegistryWriteVirtualization>
    <desktop6:FileSystemWriteVirtualization>disabled</desktop6:FileSystemWriteVirtualization>
  </Properties>
  <Resources>
    <Resource Language="en-US" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <rescap:Capability Name="unvirtualizedResources" />
    <uap3:Capability Name="userNotificationListener" />
  </Capabilities>
  <Applications>
    <Application Id="{name}" Executable="{exe}" uap10:TrustLevel="mediumIL" uap10:RuntimeBehavior="win32App">
      <uap:VisualElements DisplayName="Dynamic Island" Description="Dynamic Island for Windows"
                          BackgroundColor="transparent" AppListEntry="none"
                          Square150x150Logo="Assets\Square150x150Logo.png"
                          Square44x44Logo="Assets\Square44x44Logo.png" />
    </Application>
  </Applications>
</Package>
"#;
