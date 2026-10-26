//! Music: what's playing (via Windows' System Media Transport Controls), a
//! live audio level for the visualizer, and the computer's and the player's
//! volume.
//!
//! Works with any app that integrates with the Windows media overlay:
//! Spotify, browsers (YouTube, SoundCloud…), Apple Music, VLC, etc.

mod focus;
mod level;
mod smtc;
pub mod spotify;
pub mod volume;
mod youtube;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;

use super::Provider;
use crate::hub::Hub;

pub const ID: &str = "music";
pub const LEVEL_EVENT: &str = "music://level";

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicState {
    pub available: bool,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub app_id: String,
    pub app_name: String,
    /// Position in ms at `position_at` (unix ms). The UI extrapolates while playing.
    pub position_ms: u64,
    pub position_at: u64,
    pub duration_ms: u64,
    pub thumbnail: Option<String>,
    pub can_next: bool,
    pub can_previous: bool,
    /// The YouTube video a browser is playing, once identified (`youtube.rs`).
    pub youtube_id: Option<String>,
    /// The computer's volume (default output device).
    pub volume: Option<volume::Volume>,
    /// The player's own volume in the Windows mixer, and its exe's icon.
    pub app_volume: Option<volume::Volume>,
    pub app_icon: Option<String>,
    /// Spotify playing on another device (Spotify Connect): its name. The
    /// app volume is then that device's, through the Web API (`spotify.rs`).
    pub app_device: Option<String>,
}

#[derive(Default)]
pub struct MusicProvider {
    playing: Arc<AtomicBool>,
    spotify: Arc<spotify::Spotify>,
}

impl Provider for MusicProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        self.spotify.start(hub.clone());
        let (playing, poll_hub, spotify) = (self.playing.clone(), hub.clone(), self.spotify.clone());
        std::thread::spawn(move || smtc::poll_loop(poll_hub, playing, spotify));

        let playing = self.playing.clone();
        std::thread::spawn(move || level::level_loop(hub, playing));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        if action == "volume" {
            let app_id = payload["appId"].as_str().unwrap_or_default();
            // Spotify with no mixer entry here plays on another device.
            if payload["target"] == "app" && spotify::is_spotify(app_id) && !volume::has_app(app_id) {
                let level = payload["level"].as_f64().map(|l| l.clamp(0.0, 1.0) as f32);
                self.spotify.set_volume(level, payload["muted"].as_bool())?;
            } else {
                volume::set(&payload).map_err(|e| e.to_string())?;
            }
            return Ok(Value::Null);
        }
        if action.starts_with("spotify") {
            self.spotify.action(action, &payload)?;
            return Ok(Value::Null);
        }
        smtc::control(action, payload).map_err(|e| e.to_string())?;
        Ok(Value::Null)
    }
}
