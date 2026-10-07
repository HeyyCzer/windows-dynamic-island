//! Bluetooth headphones, like AirPods on the iPhone: when an audio device
//! connects the island shows it with its battery level; it also says when it
//! disconnects and when its battery runs low (20%, 10%).
//!
//! Paired classic Bluetooth devices are polled as association endpoints; only
//! audio ones (headphones, earbuds, speakers) are announced. Windows doesn't
//! put the battery on the endpoint: headsets report it over Hands-Free and
//! Windows stores it on that device node, which shares the endpoint's
//! container id.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use windows::core::{Interface, GUID, HSTRING};
use windows::Devices::Enumeration::{DeviceInformation, DeviceInformationKind};
use windows_collections::{IIterable, IMapView};
use windows::Foundation::IPropertyValue;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::{Activities, Activity, BLUE, GREEN, ORANGE, RED};
use crate::i18n;

const CLASSIC_BLUETOOTH: &str = "{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}";
const IS_CONNECTED: &str = "System.Devices.Aep.IsConnected";
const CONTAINER_ID: &str = "System.Devices.Aep.ContainerId";
const MAJOR_CLASS: &str = "System.Devices.Aep.Bluetooth.Cod.Major";
/// DEVPKEY_Bluetooth_Battery
const BATTERY_LEVEL: &str = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
/// Class of Device major class "Audio/Video".
const AUDIO_VIDEO: u16 = 4;

const POLL: Duration = Duration::from_secs(3);
const BATTERY_EVERY: Duration = Duration::from_secs(120);
const CONNECTED_FOR: Duration = Duration::from_secs(4);
/// Headsets report their battery a moment after connecting.
const BATTERY_RETRIES: [Duration; 4] = [
    Duration::from_millis(500),
    Duration::from_millis(1500),
    Duration::from_millis(3000),
    Duration::from_millis(6000),
];

struct Headset {
    name: String,
    container: Option<GUID>,
    connected: bool,
    battery: Option<u8>,
    battery_read_at: Option<Instant>,
}

pub fn watch(activities: Activities) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let mut devices: HashMap<String, Headset> = HashMap::new();
    // Headphones already connected when the island starts are known but not announced.
    let mut first = true;
    loop {
        match scan() {
            Ok(found) => {
                for Paired { id, name, container, connected } in found {
                    let device = devices.entry(id.clone()).or_insert_with(|| Headset {
                        name: name.clone(),
                        container,
                        connected,
                        battery: None,
                        battery_read_at: None,
                    });
                    device.name = name;
                    if device.connected != connected {
                        device.connected = connected;
                        if connected {
                            on_connected(&activities, &id, device);
                        } else {
                            device.battery = None;
                            on_disconnected(&activities, &id, device);
                        }
                    } else if first && connected {
                        device.battery = read_battery(device.container);
                        device.battery_read_at = Some(Instant::now());
                    }
                    if device.connected && device.battery_read_at.is_none_or(|t| t.elapsed() >= BATTERY_EVERY) {
                        poll_battery(&activities, &id, device);
                    }
                }
                first = false;
            }
            Err(e) => {
                // No Bluetooth radio, or the service is off: nothing to show.
                log::debug!("bluetooth: {e}");
            }
        }
        std::thread::sleep(POLL);
    }
}

/// A paired audio device, as last scanned.
struct Paired {
    id: String,
    name: String,
    container: Option<GUID>,
    connected: bool,
}

/// Paired audio devices.
fn scan() -> windows::core::Result<Vec<Paired>> {
    let aqs = HSTRING::from(format!(
        "System.Devices.Aep.ProtocolId:=\"{CLASSIC_BLUETOOTH}\" AND System.Devices.Aep.IsPaired:=System.StructuredQueryType.Boolean#True"
    ));
    let props = IIterable::<HSTRING>::from(vec![
        HSTRING::from(IS_CONNECTED),
        HSTRING::from(CONTAINER_ID),
        HSTRING::from(MAJOR_CLASS),
    ]);
    let found = DeviceInformation::FindAllAsyncWithKindAqsFilterAndAdditionalProperties(
        &aqs,
        &props,
        DeviceInformationKind::AssociationEndpoint,
    )?
    .join()?;

    let mut out = Vec::new();
    for i in 0..found.Size()? {
        let info = found.GetAt(i)?;
        let props = info.Properties()?;
        let is_audio = value(&props, MAJOR_CLASS).and_then(|v| v.GetUInt16().ok()) == Some(AUDIO_VIDEO);
        if !is_audio {
            continue;
        }
        let connected = value(&props, IS_CONNECTED).and_then(|v| v.GetBoolean().ok()).unwrap_or(false);
        let container = value(&props, CONTAINER_ID).and_then(|v| v.GetGuid().ok());
        out.push(Paired { id: info.Id()?.to_string(), name: info.Name()?.to_string(), container, connected });
    }
    Ok(out)
}

fn value(props: &IMapView<HSTRING, windows::core::IInspectable>, key: &str) -> Option<IPropertyValue> {
    props.Lookup(&HSTRING::from(key)).ok()?.cast::<IPropertyValue>().ok()
}

fn read_battery(container: Option<GUID>) -> Option<u8> {
    let container = container?;
    let aqs = HSTRING::from(format!("System.Devices.ContainerId:=\"{{{container:?}}}\""));
    let props = IIterable::<HSTRING>::from(vec![HSTRING::from(BATTERY_LEVEL)]);
    let nodes = DeviceInformation::FindAllAsyncWithKindAqsFilterAndAdditionalProperties(
        &aqs,
        &props,
        DeviceInformationKind::Device,
    )
    .ok()?
    .join()
    .ok()?;
    (0..nodes.Size().ok()?).find_map(|i| {
        let props = nodes.GetAt(i).ok()?.Properties().ok()?;
        value(&props, BATTERY_LEVEL)?.GetUInt8().ok().filter(|&l| l <= 100)
    })
}

fn on_connected(activities: &Activities, id: &str, device: &mut Headset) {
    let started = Instant::now();
    show_connected(activities, id, device, None, CONNECTED_FOR);
    for delay in BATTERY_RETRIES {
        std::thread::sleep(delay);
        if let Some(level) = read_battery(device.container) {
            device.battery = Some(level);
            device.battery_read_at = Some(Instant::now());
            // Fill in the level while the pill is still up; the clock isn't restarted.
            let left = CONNECTED_FOR.saturating_sub(started.elapsed()).max(Duration::from_secs(1));
            show_connected(activities, id, device, Some(level), left);
            return;
        }
        if started.elapsed() > CONNECTED_FOR {
            break;
        }
    }
    device.battery_read_at = Some(Instant::now());
}

fn show_connected(activities: &Activities, id: &str, device: &Headset, battery: Option<u8>, duration: Duration) {
    let app = activities.app();
    let mut alert = Activity::alert(alert_id("connected", id), "bluetooth", duration);
    alert.title = device.name.clone();
    alert.subtitle = Some(match battery {
        Some(level) => i18n::t(app, "system.bluetooth.connectedBattery").replace("{n}", &level.to_string()),
        None => i18n::t(app, "system.bluetooth.connected"),
    });
    alert.icon = Some("headphones".into());
    alert.color = Some(battery.map_or(BLUE, level_color).into());
    alert.progress = battery.map(|b| b as f64 / 100.0);
    alert.priority = 70;
    alert.expand = true;
    activities.upsert(alert);
}

fn on_disconnected(activities: &Activities, id: &str, device: &Headset) {
    let app = activities.app();
    let mut alert = Activity::alert(alert_id("disconnected", id), "bluetooth", Duration::from_millis(2500));
    alert.title = device.name.clone();
    alert.subtitle = Some(i18n::t(app, "system.bluetooth.disconnected"));
    alert.icon = Some("headphones".into());
    alert.priority = 70;
    activities.upsert(alert);
}

fn poll_battery(activities: &Activities, id: &str, device: &mut Headset) {
    device.battery_read_at = Some(Instant::now());
    let Some(level) = read_battery(device.container) else { return };
    let crossed = low_battery_crossed(device.battery, level);
    device.battery = Some(level);
    if crossed.is_none() {
        return;
    }
    let app = activities.app();
    let mut alert = Activity::alert(alert_id("low", id), "bluetooth", Duration::from_secs(6));
    alert.title = i18n::t(app, "system.bluetooth.low").replace("{name}", &device.name);
    alert.subtitle = Some(i18n::t(app, "system.battery.left").replace("{n}", &level.to_string()));
    alert.icon = Some("headphones".into());
    alert.color = Some(level_color(level).into());
    alert.progress = Some(level as f64 / 100.0);
    alert.priority = 80;
    alert.expand = true;
    activities.upsert(alert);
}

/// One id per kind: a reconnect right after a disconnect must arrive as new.
fn alert_id(kind: &str, device_id: &str) -> String {
    format!("system.bluetooth.{kind}:{device_id}")
}

fn level_color(battery: u8) -> &'static str {
    match battery {
        0..=10 => RED,
        11..=20 => ORANGE,
        _ => GREEN,
    }
}

/// The low-battery threshold (20 or 10) crossed going from `previous` to `current`.
fn low_battery_crossed(previous: Option<u8>, current: u8) -> Option<u8> {
    let before = previous?;
    [10, 20].into_iter().find(|&t| before > t && current <= t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_battery() {
        assert_eq!(low_battery_crossed(None, 5), None);
        assert_eq!(low_battery_crossed(Some(21), 20), Some(20));
        assert_eq!(low_battery_crossed(Some(25), 8), Some(10));
        assert_eq!(low_battery_crossed(Some(20), 19), None);
    }

    #[test]
    fn colors() {
        assert_eq!(level_color(5), RED);
        assert_eq!(level_color(20), ORANGE);
        assert_eq!(level_color(80), GREEN);
    }
}
