//! Calendars from an iCalendar link: Google's "secret address in iCal
//! format", Outlook's published calendars, iCloud… Recurring events are
//! expanded with the `rrule` crate; edited instances (`RECURRENCE-ID`) replace
//! the occurrence they override.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use chrono::{DateTime, Days, NaiveDate, NaiveDateTime, TimeZone};
use rrule::{RRule, RRuleSet, Tz, Unvalidated};

use super::{CalEvent, Error, find_meeting_url};

const DAY_MS: i64 = 86_400_000;
/// Instances kept per recurring event within the window.
const MAX_INSTANCES: u16 = 500;
const MAX_EVENTS: usize = 3000;

/// What a feed gives besides its events.
pub struct Feed {
    pub name: Option<String>,
    /// `#RRGGBB`, when the feed names one (iCloud does).
    pub color: Option<String>,
    pub events: Vec<CalEvent>,
}

/// `webcal://` (what "subscribe" buttons hand out) is plain https.
pub fn normalize(url: &str) -> Option<String> {
    let url = url.trim();
    let url = match url.strip_prefix("webcal://") {
        Some(rest) => format!("https://{rest}"),
        None => url.to_string(),
    };
    let parsed = url::Url::parse(&url).ok()?;
    (matches!(parsed.scheme(), "https" | "http") && parsed.host_str().is_some()).then_some(url)
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .into()
}

/// Downloads the feed and returns its events overlapping `[from, to)` (unix ms).
pub fn fetch(url: &str, key: &str, from: u64, to: u64) -> Result<Feed, Error> {
    let mut res = agent()
        .get(url)
        .header("User-Agent", "windows-dynamic-island")
        .call()
        .map_err(|_| Error::Network)?;
    match res.status().as_u16() {
        200 => {}
        401 | 403 => return Err(Error::Unauthorized),
        404 | 410 => return Err(Error::NotFound),
        _ => return Err(Error::Http),
    }
    let body = res
        .body_mut()
        .with_config()
        .limit(20 * 1024 * 1024)
        .read_to_string()
        .map_err(|_| Error::Network)?;
    if !body.contains("BEGIN:VCALENDAR") {
        return Err(Error::Invalid);
    }
    Ok(parse(&body, key, from as i64, to as i64))
}

/// One content line: `NAME;PARAM=value:VALUE`.
struct Prop {
    name: String,
    params: Vec<(String, String)>,
    value: String,
}

impl Prop {
    fn param(&self, name: &str) -> Option<&str> {
        self.params.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
}

fn parse_line(line: &str) -> Option<Prop> {
    // The value starts at the first ':' outside a quoted parameter.
    let mut quoted = false;
    let colon = line.char_indices().find_map(|(i, c)| match c {
        '"' => {
            quoted = !quoted;
            None
        }
        ':' if !quoted => Some(i),
        _ => None,
    })?;
    let (head, value) = (&line[..colon], &line[colon + 1..]);
    let mut parts = head.split(';');
    let name = parts.next()?.trim().to_ascii_uppercase();
    let params = parts
        .filter_map(|p| p.split_once('='))
        .map(|(k, v)| (k.trim().to_ascii_uppercase(), v.trim_matches('"').to_string()))
        .collect();
    Some(Prop {
        name,
        params,
        value: value.to_string(),
    })
}

/// Long lines continue on lines starting with a space or a tab.
fn unfold(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in text.lines() {
        match (raw.strip_prefix([' ', '\t']), lines.last_mut()) {
            (Some(rest), Some(last)) => last.push_str(rest),
            _ => lines.push(raw.to_string()),
        }
    }
    lines
}

fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n' | 'N') => out.push('\n'),
            Some(other) => out.push(other),
            None => {}
        }
    }
    out.trim().to_string()
}

#[derive(Default)]
struct VEvent {
    uid: String,
    summary: String,
    location: Option<String>,
    description: String,
    url: Option<String>,
    conference: Option<String>,
    cancelled: bool,
    start: Option<Prop>,
    end: Option<Prop>,
    duration: Option<String>,
    rrules: Vec<String>,
    rdates: Vec<Prop>,
    exdates: Vec<Prop>,
    recurrence_id: Option<Prop>,
}

fn parse(text: &str, key: &str, from: i64, to: i64) -> Feed {
    let mut feed = Feed {
        name: None,
        color: None,
        events: Vec::new(),
    };
    let mut vevents: Vec<VEvent> = Vec::new();
    // Components we're in, innermost last (VCALENDAR > VEVENT > VALARM…).
    let mut stack: Vec<String> = Vec::new();

    for line in unfold(text) {
        let Some(p) = parse_line(&line) else { continue };
        match p.name.as_str() {
            "BEGIN" => {
                let component = p.value.trim().to_ascii_uppercase();
                if component == "VEVENT" && stack.len() == 1 {
                    vevents.push(VEvent::default());
                }
                stack.push(component);
                continue;
            }
            "END" => {
                stack.pop();
                continue;
            }
            _ => {}
        }
        match stack.as_slice() {
            [cal] if cal == "VCALENDAR" => match p.name.as_str() {
                "X-WR-CALNAME" => feed.name = Some(unescape(&p.value)).filter(|s| !s.is_empty()),
                "X-APPLE-CALENDAR-COLOR" => {
                    let c = p.value.trim();
                    if c.starts_with('#') && c.len() >= 7 {
                        feed.color = Some(c[..7].to_string());
                    }
                }
                _ => {}
            },
            [_, ev] if ev == "VEVENT" => {
                let Some(e) = vevents.last_mut() else { continue };
                match p.name.as_str() {
                    "UID" => e.uid = p.value.trim().to_string(),
                    "SUMMARY" => e.summary = unescape(&p.value),
                    "LOCATION" => e.location = Some(unescape(&p.value)).filter(|s| !s.is_empty()),
                    "DESCRIPTION" => e.description = unescape(&p.value),
                    "URL" => e.url = Some(p.value.trim().to_string()).filter(|u| u.starts_with("http")),
                    "X-GOOGLE-CONFERENCE" | "X-MICROSOFT-SKYPETEAMSMEETINGURL" => {
                        e.conference = Some(p.value.trim().to_string())
                    }
                    "STATUS" => e.cancelled = p.value.trim().eq_ignore_ascii_case("CANCELLED"),
                    "DTSTART" => e.start = Some(p),
                    "DTEND" => e.end = Some(p),
                    "DURATION" => e.duration = Some(p.value),
                    "RRULE" => e.rrules.push(p.value),
                    "RDATE" => e.rdates.push(p),
                    "EXDATE" => e.exdates.push(p),
                    "RECURRENCE-ID" => e.recurrence_id = Some(p),
                    _ => {}
                }
            }
            _ => {}
        }
    }

    // Occurrences replaced by an edited instance, per UID.
    let mut overridden: HashMap<&str, HashSet<i64>> = HashMap::new();
    for e in &vevents {
        if let Some((at, _)) = e.recurrence_id.as_ref().and_then(when) {
            overridden.entry(e.uid.as_str()).or_default().insert(at.timestamp_millis());
        }
    }

    for e in &vevents {
        if e.cancelled {
            continue;
        }
        let skip = if e.recurrence_id.is_some() { None } else { overridden.get(e.uid.as_str()) };
        expand(e, key, from, to, skip, &mut feed.events);
        if feed.events.len() >= MAX_EVENTS {
            break;
        }
    }
    feed.events.truncate(MAX_EVENTS);
    feed
}

/// Date-time of a DTSTART-like property, and whether it is a whole day.
fn when(p: &Prop) -> Option<(DateTime<Tz>, bool)> {
    let v = p.value.trim();
    if p.param("VALUE") == Some("DATE") || v.len() == 8 {
        let date = NaiveDate::parse_from_str(v, "%Y%m%d").ok()?;
        return Some((at_local_midnight(date)?, true));
    }
    let (naive, utc) = match v.strip_suffix('Z') {
        Some(s) => (s, true),
        None => (v, false),
    };
    let naive = NaiveDateTime::parse_from_str(naive, "%Y%m%dT%H%M%S").ok()?;
    let tz = if utc { Tz::UTC } else { p.param("TZID").and_then(timezone).unwrap_or(Tz::LOCAL) };
    Some((tz.from_local_datetime(&naive).earliest()?, false))
}

fn at_local_midnight(date: NaiveDate) -> Option<DateTime<Tz>> {
    Tz::LOCAL.from_local_datetime(&date.and_hms_opt(0, 0, 0)?).earliest()
}

/// IANA names ("America/Sao_Paulo"), also behind the "/mozilla.org/…/" prefix
/// some apps add. Windows names (Outlook) fall back to local time.
fn timezone(id: &str) -> Option<Tz> {
    let id = id.trim();
    let parse = |s: &str| s.parse::<chrono_tz::Tz>().ok().map(Tz::Tz);
    parse(id).or_else(|| {
        let parts: Vec<&str> = id.trim_matches('/').split('/').collect();
        (2..=3)
            .filter(|n| parts.len() >= *n)
            .find_map(|n| parse(&parts[parts.len() - n..].join("/")))
    })
}

/// `[+-]P[nW][nD][T[nH][nM][nS]]` in ms.
fn duration_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    let (negative, s) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };
    let mut total = 0i64;
    let mut number = String::new();
    let mut time = false;
    for c in s.strip_prefix('P')?.chars() {
        match c {
            '0'..='9' => number.push(c),
            'T' => time = true,
            unit => {
                let n: i64 = std::mem::take(&mut number).parse().ok()?;
                total += n * match (unit, time) {
                    ('W', _) => 7 * DAY_MS,
                    ('D', _) => DAY_MS,
                    ('H', true) => 3_600_000,
                    ('M', true) => 60_000,
                    ('S', true) => 1000,
                    _ => return None,
                };
            }
        }
    }
    Some(if negative { -total } else { total })
}

/// Comma-separated date-times of an RDATE / EXDATE line.
fn date_list(p: &Prop) -> impl Iterator<Item = DateTime<Tz>> + '_ {
    p.value.split(',').filter_map(|v| {
        let single = Prop {
            name: String::new(),
            params: p.params.clone(),
            value: v.to_string(),
        };
        when(&single).map(|(dt, _)| dt)
    })
}

/// Pulls `UNTIL` out of a rule: the crate only accepts it in UTC (or local
/// time for floating events), feeds often send a date or a zoned time.
/// The caller applies it as the end of the expansion instead.
fn split_until(rule: &str, start: &Prop) -> (String, Option<i64>) {
    let mut until = None;
    let kept: Vec<&str> = rule
        .split(';')
        .filter(|part| match part.split_once('=') {
            Some((k, v)) if k.trim().eq_ignore_ascii_case("UNTIL") => {
                let p = Prop {
                    name: String::new(),
                    params: start.params.iter().filter(|(k, _)| k == "TZID").cloned().collect(),
                    value: v.to_string(),
                };
                // A date-only UNTIL includes that whole day.
                until = when(&p).map(|(dt, all_day)| dt.timestamp_millis() + if all_day { DAY_MS } else { 0 });
                false
            }
            _ => true,
        })
        .collect();
    (kept.join(";"), until)
}

fn expand(e: &VEvent, key: &str, from: i64, to: i64, skip: Option<&HashSet<i64>>, out: &mut Vec<CalEvent>) {
    let Some(start_prop) = &e.start else { return };
    let Some((start, all_day)) = when(start_prop) else { return };
    let length = e
        .end
        .as_ref()
        .and_then(when)
        .map(|(end, _)| end.timestamp_millis() - start.timestamp_millis())
        .or_else(|| e.duration.as_deref().and_then(duration_ms))
        .unwrap_or(if all_day { DAY_MS } else { 0 })
        .max(0);

    let starts: Vec<DateTime<Tz>> = if e.rrules.is_empty() && e.rdates.is_empty() {
        vec![start]
    } else {
        let mut set = RRuleSet::new(start);
        let mut untils = Vec::new();
        for rule in &e.rrules {
            let (rule, until) = split_until(rule, start_prop);
            if let Ok(rule) = rule.parse::<RRule<Unvalidated>>().and_then(|r| r.validate(start)) {
                set = set.rrule(rule);
                untils.push(until);
            }
        }
        for dt in e.rdates.iter().flat_map(date_list) {
            set = set.rdate(dt);
        }
        for dt in e.exdates.iter().flat_map(date_list) {
            set = set.exdate(dt);
        }
        // Every rule bounded: stop at the last UNTIL.
        let until = untils.iter().copied().collect::<Option<Vec<i64>>>().and_then(|u| u.into_iter().max());
        let before = until.map_or(to, |u| u.min(to));
        let (Some(after), Some(before)) = (utc(from - length - 1), utc(before)) else { return };
        if before <= after {
            return;
        }
        set.after(after).before(before).all(MAX_INSTANCES).dates
    };

    let conference = e.conference.clone().or_else(|| {
        find_meeting_url(e.location.as_deref().unwrap_or_default()).or_else(|| find_meeting_url(&e.description))
    });
    for occurrence in starts {
        let begin = occurrence.timestamp_millis();
        if skip.is_some_and(|s| s.contains(&begin)) {
            continue;
        }
        let end = if all_day {
            // Whole days, so a DST change doesn't spill into the next day.
            let days = ((length + DAY_MS / 2) / DAY_MS).max(1) as u64;
            occurrence
                .date_naive()
                .checked_add_days(Days::new(days))
                .and_then(at_local_midnight)
                .map_or(begin + length, |d| d.timestamp_millis())
        } else {
            begin + length
        };
        if end <= from || begin >= to || (end == begin && begin < from) {
            continue;
        }
        out.push(CalEvent {
            id: format!("{key}/{}/{begin}", e.uid),
            calendar: key.to_string(),
            title: e.summary.clone(),
            start: begin.max(0) as u64,
            end: end.max(begin).max(0) as u64,
            all_day,
            location: e.location.clone(),
            meeting_url: conference.clone(),
            url: e.url.clone(),
        });
    }
}

fn utc(ms: i64) -> Option<DateTime<Tz>> {
    Tz::UTC.timestamp_millis_opt(ms).single()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(s: &str) -> i64 {
        DateTime::parse_from_rfc3339(s).unwrap().timestamp_millis()
    }

    const FEED: &str = "BEGIN:VCALENDAR\r\n\
X-WR-CALNAME:Work\r\n\
BEGIN:VEVENT\r\n\
UID:weekly\r\n\
SUMMARY:Stand\r\n  up\r\n\
DTSTART;TZID=America/Sao_Paulo:20261005T090000\r\n\
DTEND;TZID=America/Sao_Paulo:20261005T091500\r\n\
RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261031\r\n\
EXDATE;TZID=America/Sao_Paulo:20261007T090000\r\n\
DESCRIPTION:Join: https://meet.google.com/abc-defg-hij\\nThanks\r\n\
BEGIN:VALARM\r\n\
DESCRIPTION:alarm\r\n\
END:VALARM\r\n\
END:VEVENT\r\n\
BEGIN:VEVENT\r\n\
UID:weekly\r\n\
RECURRENCE-ID;TZID=America/Sao_Paulo:20261012T090000\r\n\
SUMMARY:Stand up (moved)\r\n\
DTSTART;TZID=America/Sao_Paulo:20261012T100000\r\n\
DTEND;TZID=America/Sao_Paulo:20261012T101500\r\n\
END:VEVENT\r\n\
BEGIN:VEVENT\r\n\
UID:holiday\r\n\
SUMMARY:Holiday\r\n\
DTSTART;VALUE=DATE:20261012\r\n\
DTEND;VALUE=DATE:20261013\r\n\
END:VEVENT\r\n\
BEGIN:VEVENT\r\n\
UID:gone\r\n\
SUMMARY:Cancelled\r\n\
STATUS:CANCELLED\r\n\
DTSTART:20261006T120000Z\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";

    #[test]
    fn expands_recurring_events() {
        let feed = parse(FEED, "ics:x", ms("2026-10-01T00:00:00Z"), ms("2026-12-01T00:00:00Z"));
        assert_eq!(feed.name.as_deref(), Some("Work"));

        let stand_ups: Vec<_> = feed.events.iter().filter(|e| e.title == "Stand up").collect();
        // Mondays and Wednesdays of October from the 5th, minus the 7th (EXDATE)
        // and the 12th (moved), until the 31st.
        let days: Vec<i64> = stand_ups.iter().map(|e| e.start as i64).collect();
        assert_eq!(
            days,
            [5, 14, 19, 21, 26, 28]
                .iter()
                .map(|d| ms(&format!("2026-10-{d:02}T09:00:00-03:00")))
                .collect::<Vec<_>>()
        );
        assert_eq!(stand_ups[0].end - stand_ups[0].start, 15 * 60_000);
        assert_eq!(stand_ups[0].meeting_url.as_deref(), Some("https://meet.google.com/abc-defg-hij"));

        let moved = feed.events.iter().find(|e| e.title == "Stand up (moved)").unwrap();
        assert_eq!(moved.start as i64, ms("2026-10-12T10:00:00-03:00"));

        let holiday = feed.events.iter().find(|e| e.title == "Holiday").unwrap();
        assert!(holiday.all_day);
        assert!(!feed.events.iter().any(|e| e.title == "Cancelled"));
    }

    #[test]
    fn parses_durations() {
        assert_eq!(duration_ms("PT1H30M"), Some(90 * 60_000));
        assert_eq!(duration_ms("P1D"), Some(DAY_MS));
        assert_eq!(duration_ms("-P1W"), Some(-7 * DAY_MS));
        assert_eq!(duration_ms("P1H"), None);
    }

    #[test]
    fn normalizes_links() {
        assert_eq!(normalize(" webcal://a.com/x.ics ").as_deref(), Some("https://a.com/x.ics"));
        assert_eq!(normalize("ftp://a.com/x.ics"), None);
        assert_eq!(normalize("not a link"), None);
    }

    #[test]
    fn resolves_timezones() {
        assert!(timezone("Europe/Lisbon").is_some());
        assert!(timezone("/mozilla.org/20050126_1/America/New_York").is_some());
        assert!(timezone("E. South America Standard Time").is_none());
    }
}
