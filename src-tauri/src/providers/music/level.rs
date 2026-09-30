//! Live output level for the visualizer.
//!
//! Players don't always render to the default device (Spotify, for one, can
//! pick its own), and the endpoint meter may sit near zero while the app's own
//! session is loud. So we read the peak of every *active* audio session on
//! every active output device and use the loudest one.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use windows::core::{Interface, Result};
use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
use windows::Win32::Media::Audio::{
    eRender, AudioSessionStateActive, IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
    DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

use super::LEVEL_EVENT;
use crate::hub::Hub;

const FRAME: Duration = Duration::from_millis(33);
/// Re-scan sessions about once a second (they come and go).
const RESCAN_EVERY: u32 = 30;

pub fn level_loop(hub: Arc<Hub>, playing: Arc<AtomicBool>) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let mut meters: Vec<IAudioMeterInformation> = Vec::new();
    let mut tick = 0u32;
    loop {
        if !playing.load(Ordering::Relaxed) {
            meters.clear();
            tick = 0;
            std::thread::sleep(Duration::from_millis(250));
            continue;
        }
        if tick.is_multiple_of(RESCAN_EVERY) {
            meters = active_session_meters().unwrap_or_default();
        }
        tick = tick.wrapping_add(1);

        let level = meters
            .iter()
            .filter_map(|m| unsafe { m.GetPeakValue() }.ok())
            .fold(0.0f32, f32::max);
        hub.transient(LEVEL_EVENT, level);
        std::thread::sleep(FRAME);
    }
}

fn active_session_meters() -> Result<Vec<IAudioMeterInformation>> {
    let mut meters = Vec::new();
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let devices = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
        for i in 0..devices.GetCount()? {
            let Ok(device) = devices.Item(i) else { continue };
            let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { continue };
            let Ok(sessions) = manager.GetSessionEnumerator() else { continue };
            for j in 0..sessions.GetCount().unwrap_or(0) {
                let Ok(session) = sessions.GetSession(j) else { continue };
                if session.GetState().ok() != Some(AudioSessionStateActive) {
                    continue;
                }
                if let Ok(meter) = session.cast::<IAudioMeterInformation>() {
                    meters.push(meter);
                }
            }
        }
    }
    Ok(meters)
}
