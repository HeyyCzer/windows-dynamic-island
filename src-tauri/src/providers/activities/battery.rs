//! Laptop battery: charger plugged in / unplugged, and low battery warnings
//! (20%, 10%, 5%).

use std::time::Duration;

use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

use super::{Activities, Activity, GREEN, ORANGE, RED};
use crate::i18n;

const POLL: Duration = Duration::from_secs(3);
const THRESHOLDS: [u8; 3] = [20, 10, 5];

pub fn watch(activities: Activities) {
    let mut was_on_ac: Option<bool> = None;
    let mut last_percent: Option<u8> = None;
    loop {
        if let Some((on_ac, percent)) = read() {
            if let Some(before) = was_on_ac
                && before != on_ac
            {
                show_power(&activities, on_ac, percent);
            } else if !on_ac
                && let Some(threshold) = last_percent.and_then(|before| crossed(before, percent))
            {
                show_low(&activities, percent, threshold);
            }
            was_on_ac = Some(on_ac);
            last_percent = Some(percent);
        }
        std::thread::sleep(POLL);
    }
}

/// The machine has a system battery (laptops, tablets).
pub fn present() -> bool {
    let mut status = SYSTEM_POWER_STATUS::default();
    // 128 = no system battery; if the call fails, assume there is one.
    unsafe { GetSystemPowerStatus(&mut status).is_err() || status.BatteryFlag & 128 == 0 }
}

/// `(on AC power, battery %)`, or `None` on a desktop without a battery.
fn read() -> Option<(bool, u8)> {
    let mut status = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut status).ok()? };
    // 128 = no system battery, 255 = unknown percentage.
    if status.BatteryFlag & 128 != 0 || status.BatteryLifePercent > 100 {
        return None;
    }
    Some((status.ACLineStatus == 1, status.BatteryLifePercent))
}

/// The lowest low-battery threshold crossed going from `before` to `now`, if any.
fn crossed(before: u8, now: u8) -> Option<u8> {
    THRESHOLDS.into_iter().rev().find(|&t| before > t && now <= t)
}

fn show_power(activities: &Activities, on_ac: bool, percent: u8) {
    let app = activities.app();
    let mut alert = Activity::alert("system.battery", "battery", Duration::from_millis(3500));
    alert.title = i18n::t(app, if on_ac { "system.battery.charging" } else { "system.battery.onBattery" });
    alert.icon = Some(if on_ac { "charging" } else { "battery" }.into());
    alert.color = on_ac.then(|| GREEN.into());
    alert.progress = Some(percent as f64 / 100.0);
    alert.priority = 70;
    activities.upsert(alert);
}

fn show_low(activities: &Activities, percent: u8, threshold: u8) {
    let app = activities.app();
    let mut alert = Activity::alert("system.battery", "battery", Duration::from_secs(6));
    alert.title = i18n::t(app, "system.battery.low");
    alert.subtitle = Some(i18n::t(app, "system.battery.lowDetail").replace("{n}", &percent.to_string()));
    alert.icon = Some("battery".into());
    alert.color = Some(if threshold <= 10 { RED } else { ORANGE }.into());
    alert.progress = Some(percent as f64 / 100.0);
    alert.priority = 80;
    alert.expand = true;
    activities.upsert(alert);
}

#[cfg(test)]
mod tests {
    use super::crossed;

    #[test]
    fn thresholds() {
        assert_eq!(crossed(21, 20), Some(20));
        assert_eq!(crossed(20, 19), None);
        assert_eq!(crossed(12, 9), Some(10));
        assert_eq!(crossed(30, 4), Some(5));
    }
}
