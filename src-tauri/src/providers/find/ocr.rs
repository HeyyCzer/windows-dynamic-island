//! The text on the screen through Windows' own OCR (`Windows.Media.Ocr`, in
//! the languages of the user's profile), each word with its box in screen
//! pixels. Pictures bigger than the OCR takes are read in overlapping tiles.

use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;
use windows::Win32::Foundation::RECT;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};

use super::text::{Line, Rect, Word};
use crate::screen::Image;

/// How much neighbouring tiles share, so a word cut by one edge is whole in the other.
const OVERLAP: u32 = 160;
/// Used when Windows doesn't say how big a picture its OCR takes.
const DEFAULT_MAX: u32 = 2600;
/// Lines whose middles are this close (in pixels) count as one row when
/// tiles are put back in reading order.
const ROW: f64 = 12.0;

/// One monitor's picture and where it sits on the desktop.
pub struct Shot {
    pub rect: RECT,
    pub image: Image,
}

/// A piece of one side of the picture, and the part of it whose words it keeps
/// (each overlap is split in the middle, so no word is read twice).
#[derive(Debug, Clone, Copy, PartialEq)]
struct Tile {
    start: u32,
    size: u32,
    keep_from: u32,
    keep_to: u32,
}

impl Tile {
    fn owns(&self, at: f32) -> bool {
        at >= self.keep_from as f32 && at < self.keep_to as f32
    }
}

fn tiles(len: u32, max: u32, overlap: u32) -> Vec<Tile> {
    debug_assert!(overlap < max);
    if len <= max {
        return vec![Tile { start: 0, size: len, keep_from: 0, keep_to: len }];
    }
    let step = max - overlap;
    let mut starts: Vec<u32> = (0..).map(|i| i * step).take_while(|&s| s + max < len).collect();
    starts.push(len - max);
    let mut tiles: Vec<Tile> =
        starts.iter().map(|&start| Tile { start, size: max, keep_from: 0, keep_to: len }).collect();
    for i in 1..tiles.len() {
        // Halfway through the overlap between this tile and the one before.
        let border = (tiles[i].start + tiles[i - 1].start + max) / 2;
        tiles[i - 1].keep_to = border;
        tiles[i].keep_from = border;
    }
    tiles
}

fn bitmap(bgra: &[u8], width: u32, height: u32) -> windows::core::Result<SoftwareBitmap> {
    let writer = DataWriter::new()?;
    writer.WriteBytes(bgra)?;
    SoftwareBitmap::CreateCopyFromBuffer(&writer.DetachBuffer()?, BitmapPixelFormat::Bgra8, width as i32, height as i32)
}

/// Reads every monitor's picture; lines come back in reading order. Fails
/// with `noOcr` (no OCR for the profile's languages) or `failed` (nothing
/// could be read).
pub fn read(shots: &[Shot]) -> Result<Vec<Line>, &'static str> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    // No OCR for any of the profile's languages (Settings → Time & language).
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| "noOcr")?;
    // Tiles narrower than two overlaps would barely move forward.
    let max = OcrEngine::MaxImageDimension().unwrap_or(DEFAULT_MAX).max(OVERLAP * 4);
    let mut lines = Vec::new();
    let (mut tried, mut failed) = (0, 0);
    for (monitor, shot) in shots.iter().enumerate() {
        let (rows, columns) = (tiles(shot.image.height, max, OVERLAP), tiles(shot.image.width, max, OVERLAP));
        let start = lines.len();
        for &ty in &rows {
            for &tx in &columns {
                tried += 1;
                // A tile that can't be read leaves a gap; the rest still counts.
                if let Err(e) = read_tile(&engine, shot, monitor, tx, ty, &mut lines) {
                    log::warn!("find: OCR of monitor {monitor} failed: {e}");
                    failed += 1;
                }
            }
        }
        // Tiles break the order: top to bottom, then left to right.
        if rows.len() * columns.len() > 1 {
            lines[start..].sort_by_key(|l| {
                let first = l.words[0].rect;
                (((first.y + first.h / 2.0) / ROW).round() as i64, first.x as i64)
            });
        }
    }
    if tried == 0 || failed == tried {
        return Err("failed");
    }
    Ok(lines)
}

fn read_tile(
    engine: &OcrEngine,
    shot: &Shot,
    monitor: usize,
    tx: Tile,
    ty: Tile,
    lines: &mut Vec<Line>,
) -> windows::core::Result<()> {
    let Some(tile) = shot.image.crop(tx.start as i32, ty.start as i32, tx.size as i32, ty.size as i32) else {
        return Ok(());
    };
    let picture = bitmap(&tile.bgra, tile.width, tile.height)?;
    let result = engine.RecognizeAsync(&picture)?.join()?;
    for line in result.Lines()? {
        let mut words = Vec::new();
        for word in line.Words()? {
            let r = word.BoundingRect()?;
            let (x, y) = (tx.start as f32 + r.X, ty.start as f32 + r.Y);
            if !tx.owns(x + r.Width / 2.0) || !ty.owns(y + r.Height / 2.0) {
                continue;
            }
            words.push(Word {
                text: word.Text()?.to_string(),
                rect: Rect {
                    x: (shot.rect.left as f32 + x) as f64,
                    y: (shot.rect.top as f32 + y) as f64,
                    w: r.Width as f64,
                    h: r.Height as f64,
                },
            });
        }
        if !words.is_empty() {
            lines.push(Line { words, monitor });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_small_picture_is_one_tile() {
        assert_eq!(tiles(1080, 2600, 160), [Tile { start: 0, size: 1080, keep_from: 0, keep_to: 1080 }]);
    }

    #[test]
    fn a_wide_picture_is_cut_with_overlaps() {
        // An ultrawide 3440 px with a 2600 px OCR: two tiles sharing 1760 px.
        let t = tiles(3440, 2600, 160);
        assert_eq!(t.len(), 2);
        assert_eq!((t[0].start, t[1].start), (0, 840));
        assert_eq!(t[1].start + t[1].size, 3440);
        // Each pixel belongs to exactly one tile.
        assert_eq!(t[0].keep_from, 0);
        assert_eq!(t[0].keep_to, t[1].keep_from);
        assert_eq!(t[1].keep_to, 3440);
        assert!(t[0].keep_to > t[1].start && t[0].keep_to < t[0].start + t[0].size);
    }

    #[test]
    fn a_huge_picture_takes_several_tiles() {
        let t = tiles(7680, 2600, 160);
        assert!(t.len() >= 3);
        for pair in t.windows(2) {
            // Consecutive tiles overlap by at least `OVERLAP`.
            assert!(pair[0].start + pair[0].size >= pair[1].start + 160);
            assert_eq!(pair[0].keep_to, pair[1].keep_from);
        }
        assert_eq!(t.last().map(|l| l.start + l.size), Some(7680));
    }
}
