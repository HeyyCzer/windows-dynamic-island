//! Pictures on the clipboard travel as a DIB (a BMP without its file header).
//! The history keeps them as PNG files plus a small thumbnail for the UI.

use std::hash::{Hash, Hasher};

/// Anything bigger is skipped (a 8K screenshot is ~33 MP).
const MAX_PIXELS: u64 = 60_000_000;
const BI_RGB: u32 = 0;
const BI_BITFIELDS: u32 = 3;
const HEADER: usize = 40;

/// RGBA pixels, top-down rows.
#[derive(Debug, Clone, PartialEq)]
pub struct Picture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

fn u16_at(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

/// `CF_DIB` bytes → picture. Handles the 24/32-bit uncompressed DIBs that
/// Windows and apps put on the clipboard (screenshots, copied images).
pub fn from_dib(bytes: &[u8]) -> Option<Picture> {
    let header_size = u32_at(bytes, 0)? as usize;
    let width = i32::from_le_bytes(bytes.get(4..8)?.try_into().ok()?);
    let height = i32::from_le_bytes(bytes.get(8..12)?.try_into().ok()?);
    let bits = u16_at(bytes, 14)?;
    let compression = u32_at(bytes, 16)?;
    if header_size < HEADER || width <= 0 || height == 0 || !matches!(bits, 24 | 32) {
        return None;
    }
    if compression != BI_RGB && !(compression == BI_BITFIELDS && bits == 32) {
        return None;
    }
    let (w, h) = (width as u32, height.unsigned_abs());
    if w as u64 * h as u64 > MAX_PIXELS {
        return None;
    }
    // A plain BITMAPINFOHEADER with bit fields is followed by the 3 color masks.
    let masks = if compression == BI_BITFIELDS && header_size == HEADER { 12 } else { 0 };
    let start = header_size + masks;
    let bpp = bits as usize / 8;
    let stride = (w as usize * bits as usize).div_ceil(32) * 4;
    let data = bytes.get(start..start + stride * h as usize)?;
    let bottom_up = height > 0;

    let mut rgba = Vec::with_capacity(w as usize * h as usize * 4);
    for y in 0..h as usize {
        let row = if bottom_up { h as usize - 1 - y } else { y };
        let line = &data[row * stride..row * stride + w as usize * bpp];
        for px in line.chunks_exact(bpp) {
            rgba.extend_from_slice(&[px[2], px[1], px[0], if bpp == 4 { px[3] } else { 255 }]);
        }
    }
    // Most apps leave the alpha byte of 32-bit DIBs at zero: that means opaque.
    if bpp == 4 && rgba.as_chunks::<4>().0.iter().all(|p| p[3] == 0) {
        rgba.as_chunks_mut::<4>().0.iter_mut().for_each(|p| p[3] = 255);
    }
    Some(Picture { width: w, height: h, rgba })
}

/// Picture → `CF_DIB` bytes (32-bit, bottom-up: what every app reads).
pub fn to_dib(p: &Picture) -> Vec<u8> {
    let mut out = Vec::with_capacity(HEADER + p.rgba.len());
    out.extend_from_slice(&(HEADER as u32).to_le_bytes());
    out.extend_from_slice(&(p.width as i32).to_le_bytes());
    out.extend_from_slice(&(p.height as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // planes
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&BI_RGB.to_le_bytes());
    out.extend_from_slice(&(p.rgba.len() as u32).to_le_bytes());
    out.extend_from_slice(&[0u8; 16]); // resolution, palette
    let row = p.width as usize * 4;
    for y in (0..p.height as usize).rev() {
        for px in p.rgba[y * row..(y + 1) * row].as_chunks::<4>().0 {
            out.extend_from_slice(&[px[2], px[1], px[0], px[3]]);
        }
    }
    out
}

pub fn encode_png(p: &Picture) -> Result<Vec<u8>, String> {
    let opaque = p.rgba.as_chunks::<4>().0.iter().all(|px| px[3] == 255);
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, p.width, p.height);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);
    let mut writer;
    if opaque {
        encoder.set_color(png::ColorType::Rgb);
        writer = encoder.write_header().map_err(|e| e.to_string())?;
        let rgb: Vec<u8> = p.rgba.as_chunks::<4>().0.iter().flat_map(|px| [px[0], px[1], px[2]]).collect();
        writer.write_image_data(&rgb).map_err(|e| e.to_string())?;
    } else {
        encoder.set_color(png::ColorType::Rgba);
        writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(&p.rgba).map_err(|e| e.to_string())?;
    }
    writer.finish().map_err(|e| e.to_string())?;
    Ok(out)
}

/// Decodes the PNGs written by [`encode_png`] (8-bit RGB or RGBA).
pub fn decode_png(bytes: &[u8]) -> Option<Picture> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let data = &buf[..info.buffer_size()];
    let rgba = match info.color_type {
        png::ColorType::Rgba => data.to_vec(),
        png::ColorType::Rgb => data.as_chunks::<3>().0.iter().flat_map(|px| [px[0], px[1], px[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => data.as_chunks::<2>().0.iter().flat_map(|px| [px[0], px[0], px[0], px[1]]).collect(),
        png::ColorType::Grayscale => data.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::Indexed => return None,
    };
    Some(Picture { width: info.width, height: info.height, rgba })
}

/// Width and height from a PNG's header, without decoding it.
pub fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.get(..8)? != b"\x89PNG\r\n\x1a\n" || bytes.get(12..16)? != b"IHDR" {
        return None;
    }
    Some((
        u32::from_be_bytes(bytes.get(16..20)?.try_into().ok()?),
        u32::from_be_bytes(bytes.get(20..24)?.try_into().ok()?),
    ))
}

/// Scaled down (area average) so the longest side is at most `max_side`.
pub fn thumbnail(p: &Picture, max_side: u32) -> Picture {
    let scale = (max_side as f64 / p.width.max(p.height) as f64).min(1.0);
    let w = ((p.width as f64 * scale).round() as u32).max(1);
    let h = ((p.height as f64 * scale).round() as u32).max(1);
    if (w, h) == (p.width, p.height) {
        return p.clone();
    }
    let mut rgba = Vec::with_capacity((w * h * 4) as usize);
    for oy in 0..h {
        let y0 = oy * p.height / h;
        let y1 = ((oy + 1) * p.height / h).max(y0 + 1);
        for ox in 0..w {
            let x0 = ox * p.width / w;
            let x1 = ((ox + 1) * p.width / w).max(x0 + 1);
            let mut sum = [0u32; 4];
            for y in y0..y1 {
                let row = (y * p.width) as usize;
                for x in x0..x1 {
                    let i = (row + x as usize) * 4;
                    for (s, &v) in sum.iter_mut().zip(&p.rgba[i..i + 4]) {
                        *s += v as u32;
                    }
                }
            }
            let n = (y1 - y0) * (x1 - x0);
            rgba.extend(sum.iter().map(|s| (s / n) as u8));
        }
    }
    Picture { width: w, height: h, rgba }
}

/// Cheap identity for spotting the same picture copied twice.
pub fn fingerprint(p: &Picture) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (p.width, p.height).hash(&mut h);
    // Every 7th pixel is plenty to tell screenshots apart.
    for px in p.rgba.as_chunks::<4>().0.iter().step_by(7) {
        px.hash(&mut h);
    }
    h.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2×2 DIB: red, green / blue, white (top row first), `bits` per pixel.
    fn dib(bits: u16, top_down: bool, alpha: u8) -> Vec<u8> {
        let rows: [[[u8; 3]; 2]; 2] = [[[255, 0, 0], [0, 255, 0]], [[0, 0, 255], [255, 255, 255]]];
        let mut out = Vec::new();
        out.extend_from_slice(&40u32.to_le_bytes());
        out.extend_from_slice(&2i32.to_le_bytes());
        out.extend_from_slice(&(if top_down { -2i32 } else { 2 }).to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&bits.to_le_bytes());
        out.extend_from_slice(&[0u8; 24]);
        let order: Vec<usize> = if top_down { vec![0, 1] } else { vec![1, 0] };
        for r in order {
            let mut line = Vec::new();
            for [red, green, blue] in rows[r] {
                line.extend_from_slice(&[blue, green, red]);
                if bits == 32 {
                    line.push(alpha);
                }
            }
            while line.len() % 4 != 0 {
                line.push(0);
            }
            out.extend_from_slice(&line);
        }
        out
    }

    const EXPECTED: [u8; 16] = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

    #[test]
    fn reads_dibs() {
        for (bits, top_down, alpha) in [(24, false, 0), (32, false, 0), (32, true, 0), (32, false, 255)] {
            let p = from_dib(&dib(bits, top_down, alpha)).expect("parsed");
            assert_eq!((p.width, p.height), (2, 2));
            assert_eq!(p.rgba, EXPECTED, "{bits} bits, top_down={top_down}");
        }
    }

    #[test]
    fn rejects_odd_dibs() {
        assert_eq!(from_dib(&[0; 10]), None);
        let mut eight_bit = dib(24, false, 0);
        eight_bit[14] = 8;
        assert_eq!(from_dib(&eight_bit), None);
        let truncated = dib(32, false, 0);
        assert_eq!(from_dib(&truncated[..truncated.len() - 1]), None);
    }

    #[test]
    fn dib_round_trip() {
        let p = from_dib(&dib(32, false, 0)).unwrap();
        assert_eq!(from_dib(&to_dib(&p)), Some(p));
    }

    #[test]
    fn png_round_trip() {
        let opaque = from_dib(&dib(24, false, 0)).unwrap();
        let bytes = encode_png(&opaque).unwrap();
        assert_eq!(png_size(&bytes), Some((2, 2)));
        assert_eq!(decode_png(&bytes), Some(opaque.clone()));

        let mut clear = opaque;
        clear.rgba[3] = 10;
        assert_eq!(decode_png(&encode_png(&clear).unwrap()), Some(clear));
    }

    #[test]
    fn thumbnails() {
        let p = Picture { width: 400, height: 100, rgba: vec![200; 400 * 100 * 4] };
        let t = thumbnail(&p, 200);
        assert_eq!((t.width, t.height), (200, 50));
        assert!(t.rgba.iter().all(|&c| c == 200));
        assert_eq!(thumbnail(&t, 300), t);
    }
}
