//! Music: what's playing (via Windows' System Media Transport Controls) plus
//! a live audio level for the visualizer.
//!
//! Works with any app that integrates with the Windows media overlay:
//! Spotify, browsers (YouTube, SoundCloud…), Apple Music, VLC, etc.

mod focus;
mod level;
mod smtc;
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
}

#[derive(Default)]
pub struct MusicProvider {
    playing: Arc<AtomicBool>,
}

impl Provider for MusicProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let (playing, poll_hub) = (self.playing.clone(), hub.clone());
        std::thread::spawn(move || smtc::poll_loop(poll_hub, playing));

        let playing = self.playing.clone();
        std::thread::spawn(move || level::level_loop(hub, playing));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        smtc::control(action, payload).map_err(|e| e.to_string())?;
        Ok(Value::Null)
    }
}
