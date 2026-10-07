//! Volume OSD: when the default output's volume or mute changes, the island
//! shows a level bar for a moment. Follows the user when they switch devices
//! (a device switch itself is not announced).

use std::time::Duration;

use windows::core::Result;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
};

use super::{Activities, Activity, Style};
use crate::i18n;

const POLL: Duration = Duration::from_millis(120);
/// Re-resolve the default device about every 2 s.
const DEVICE_EVERY: u32 = 16;
const SHOW_FOR: Duration = Duration::from_millis(1600);

struct Endpoint {
    id: String,
    volume: IAudioEndpointVolume,
}

pub fn watch(activities: Activities) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let Ok(enumerator) = (unsafe { CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) })
    else {
        log::warn!("volume: no audio device enumerator");
        return;
    };

    let mut endpoint: Option<Endpoint> = None;
    let mut last: Option<(f32, bool)> = None;
    let mut tick = 0u32;
    loop {
        if endpoint.is_none() || tick.is_multiple_of(DEVICE_EVERY) {
            match default_endpoint(&enumerator) {
                Ok(next) => {
                    if endpoint.as_ref().map(|e| &e.id) != Some(&next.id) {
                        // New device: take its level silently.
                        last = None;
                    }
                    endpoint = Some(next);
                }
                Err(_) => {
                    // No output device (e.g. headphones unplugged on a desktop).
                    endpoint = None;
                    last = None;
                }
            }
        }
        tick = tick.wrapping_add(1);

        if let Some(ep) = &endpoint
            && let Ok(current) = read(&ep.volume)
        {
            if let Some(previous) = last
                && ((previous.0 - current.0).abs() > 0.004 || previous.1 != current.1)
            {
                show(&activities, current.0, current.1);
            }
            last = Some(current);
        }
        std::thread::sleep(POLL);
    }
}

fn default_endpoint(enumerator: &IMMDeviceEnumerator) -> Result<Endpoint> {
    unsafe {
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
        let raw = device.GetId()?;
        let id = raw.to_string().unwrap_or_default();
        CoTaskMemFree(Some(raw.0 as _));
        let volume = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)?;
        Ok(Endpoint { id, volume })
    }
}

fn read(volume: &IAudioEndpointVolume) -> Result<(f32, bool)> {
    unsafe { Ok((volume.GetMasterVolumeLevelScalar()?, volume.GetMute()?.as_bool())) }
}

fn show(activities: &Activities, level: f32, muted: bool) {
    let app = activities.app();
    let mut alert = Activity::alert("system.volume", "volume", SHOW_FOR);
    alert.title = i18n::t(app, if muted { "system.volume.muted" } else { "system.volume.title" });
    alert.icon = Some(if muted || level <= 0.001 { "mute" } else { "volume" }.into());
    alert.progress = Some(if muted { 0.0 } else { level as f64 });
    alert.priority = 100;
    alert.style = Style::Level;
    activities.upsert(alert);
}
