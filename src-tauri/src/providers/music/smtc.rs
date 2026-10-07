//! Now-playing metadata and transport controls through SMTC.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use serde_json::Value;
use windows::core::Result;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Storage::Streams::DataReader;

use super::{MusicState, ID};
use crate::hub::Hub;
use crate::providers::now_ms;

/// 100ns ticks between 1601-01-01 and 1970-01-01.
const EPOCH_DIFF_TICKS: i64 = 116_444_736_000_000_000;

pub fn poll_loop(hub: Arc<Hub>, playing_flag: Arc<AtomicBool>) {
    let mut manager: Option<SessionManager> = None;
    let mut track_key = String::new();
    let mut thumbnail: Option<String> = None;
    let mut thumb_attempts = 0u8;
    let youtube = super::youtube::Resolver::default();

    loop {
        if manager.is_none() {
            manager = SessionManager::RequestAsync().and_then(|op| op.join()).ok();
        }
        let state = match manager.as_ref().map(read_state) {
            Some(Ok(Some((mut state, session)))) => {
                let key = format!("{}|{}|{}|{}", state.app_id, state.title, state.artist, state.album);
                if key != track_key {
                    track_key = key;
                    thumbnail = None;
                    thumb_attempts = 0;
                }
                // Players often publish artwork a moment after the metadata.
                if thumbnail.is_none() && thumb_attempts < 6 {
                    thumb_attempts += 1;
                    thumbnail = read_thumbnail(&session).ok().flatten();
                }
                state.thumbnail = thumbnail.clone();
                state.youtube_id = youtube.video_id(&state);
                state
            }
            Some(Ok(None)) => MusicState::default(),
            Some(Err(_)) | None => {
                manager = None;
                MusicState::default()
            }
        };
        playing_flag.store(state.playing, Ordering::Relaxed);
        hub.publish(ID, &state);
        std::thread::sleep(Duration::from_millis(if state.playing { 500 } else { 1000 }));
    }
}

pub fn control(action: &str, payload: Value) -> Result<()> {
    let manager = SessionManager::RequestAsync()?.join()?;
    let Some(session) = pick_session(&manager)? else {
        return Ok(());
    };
    match action {
        "toggle" => session.TryTogglePlayPauseAsync()?.join()?,
        "play" => session.TryPlayAsync()?.join()?,
        "pause" => session.TryPauseAsync()?.join()?,
        "next" => session.TrySkipNextAsync()?.join()?,
        "previous" => session.TrySkipPreviousAsync()?.join()?,
        "focus" => {
            let title = session.TryGetMediaPropertiesAsync()?.join()?.Title()?.to_string();
            super::focus::focus(&session.SourceAppUserModelId()?.to_string(), &title);
            true
        }
        "seek" => {
            let ms = payload.as_u64().unwrap_or(0) as i64;
            session.TryChangePlaybackPositionAsync(ms * 10_000)?.join()?
        }
        _ => false,
    };
    Ok(())
}

/// Prefer a session that is actively playing; fall back to the system's current one.
fn pick_session(manager: &SessionManager) -> Result<Option<Session>> {
    let sessions = manager.GetSessions()?;
    for session in &sessions {
        if session.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing {
            return Ok(Some(session));
        }
    }
    Ok(manager.GetCurrentSession().ok())
}

fn read_state(manager: &SessionManager) -> Result<Option<(MusicState, Session)>> {
    let Some(session) = pick_session(manager)? else {
        return Ok(None);
    };
    let props = session.TryGetMediaPropertiesAsync()?.join()?;
    let info = session.GetPlaybackInfo()?;
    let controls = info.Controls()?;
    let timeline = session.GetTimelineProperties()?;

    let title = props.Title()?.to_string();
    if title.is_empty() {
        return Ok(None);
    }

    let playing = info.PlaybackStatus()? == Status::Playing;
    let duration_ms = (timeline.EndTime()?.Duration - timeline.StartTime()?.Duration).max(0) as u64 / 10_000;
    let mut position_ms = timeline.Position()?.Duration.max(0) as u64 / 10_000;
    let now = now_ms();
    if playing {
        // Timeline is only refreshed occasionally; project it to "now".
        let updated = (timeline.LastUpdatedTime()?.UniversalTime - EPOCH_DIFF_TICKS) / 10_000;
        if updated > 0 && (updated as u64) < now {
            position_ms += now - updated as u64;
        }
    }
    if duration_ms > 0 {
        position_ms = position_ms.min(duration_ms);
    }

    let app_id = session.SourceAppUserModelId()?.to_string();
    let state = MusicState {
        available: true,
        playing,
        title,
        artist: props.Artist()?.to_string(),
        album: props.AlbumTitle()?.to_string(),
        app_name: friendly_app_name(&app_id),
        app_id,
        position_ms,
        position_at: now,
        duration_ms,
        thumbnail: None,
        can_next: controls.IsNextEnabled()?,
        can_previous: controls.IsPreviousEnabled()?,
        youtube_id: None,
    };
    Ok(Some((state, session)))
}

fn read_thumbnail(session: &Session) -> Result<Option<String>> {
    let props = session.TryGetMediaPropertiesAsync()?.join()?;
    let Ok(reference) = props.Thumbnail() else {
        return Ok(None);
    };
    let stream = reference.OpenReadAsync()?.join()?;
    let size = stream.Size()? as u32;
    if size == 0 {
        return Ok(None);
    }
    let mime = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
    reader.LoadAsync(size)?.join()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf)?;
    let mime = if mime.is_empty() { "image/png".into() } else { mime };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(Some(format!("data:{mime};base64,{b64}")))
}

fn friendly_app_name(app_id: &str) -> String {
    let lower = app_id.to_lowercase();
    let known = [
        ("spotify", "Spotify"),
        ("chrome", "Chrome"),
        ("msedge", "Edge"),
        ("firefox", "Firefox"),
        ("308046b0af4a39cb", "Firefox"),
        ("opera", "Opera"),
        ("brave", "Brave"),
        ("zunemusic", "Media Player"),
        ("applemusic", "Apple Music"),
        ("vlc", "VLC"),
        ("deezer", "Deezer"),
        ("tidal", "TIDAL"),
        ("youtube", "YouTube Music"),
    ];
    if let Some((_, name)) = known.iter().find(|(k, _)| lower.contains(k)) {
        return name.to_string();
    }
    app_id
        .rsplit(['\\', '!'])
        .next()
        .unwrap_or(app_id)
        .trim_end_matches(".exe")
        .to_string()
}
