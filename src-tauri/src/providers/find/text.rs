//! Matching what was typed against the text read off the screen, the way a
//! browser's find in page does: ignoring case and accents, across the words
//! of a line, and boxing only the part of a word that matched.

use std::collections::BTreeMap;

/// Screen pixels (physical).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub fn union(self, other: Rect) -> Rect {
        let (x, y) = (self.x.min(other.x), self.y.min(other.y));
        let right = (self.x + self.w).max(other.x + other.w);
        let bottom = (self.y + self.h).max(other.y + other.h);
        Rect { x, y, w: right - x, h: bottom - y }
    }

    pub fn center(self) -> (f64, f64) {
        (self.x + self.w / 2.0, self.y + self.h / 2.0)
    }
}

#[derive(Debug, Clone)]
pub struct Word {
    pub text: String,
    pub rect: Rect,
}

/// A line of text as the OCR read it, on monitor `monitor`.
#[derive(Debug, Clone, Default)]
pub struct Line {
    pub words: Vec<Word>,
    pub monitor: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Found {
    pub rect: Rect,
    pub monitor: usize,
}

/// One char, lowercase and without its accent ("Ã" → "a").
pub fn fold(c: char) -> char {
    match c.to_lowercase().next().unwrap_or(c) {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ý' | 'ÿ' => 'y',
        other => other,
    }
}

/// The query as it is matched: folded, with single spaces between words.
fn normalize(query: &str) -> Vec<char> {
    let words: Vec<String> = query.split_whitespace().map(|w| w.chars().map(fold).collect()).collect();
    words.join(" ").chars().collect()
}

/// Every match of `query`, line by line (the lines come in reading order).
pub fn find(lines: &[Line], query: &str) -> Vec<Found> {
    let needle = normalize(query);
    let mut found = Vec::new();
    if needle.is_empty() {
        return found;
    }
    for line in lines {
        // The line as one string, each char pointing back at (word, char in it).
        let mut chars = Vec::new();
        let mut owners = Vec::new();
        for (i, word) in line.words.iter().enumerate() {
            if i > 0 {
                chars.push(' ');
                owners.push(None);
            }
            for (j, c) in word.text.chars().enumerate() {
                chars.push(fold(c));
                owners.push(Some((i, j)));
            }
        }
        let mut start = 0;
        while start + needle.len() <= chars.len() {
            if chars[start..start + needle.len()] == needle[..] {
                if let Some(rect) = span_rect(line, &owners[start..start + needle.len()]) {
                    found.push(Found { rect, monitor: line.monitor });
                }
                start += needle.len();
            } else {
                start += 1;
            }
        }
    }
    found
}

/// The box around the matched chars: of each word, the slice of its width
/// those chars take (by count, which is close enough for screen fonts).
fn span_rect(line: &Line, owners: &[Option<(usize, usize)>]) -> Option<Rect> {
    let mut spans: BTreeMap<usize, (usize, usize)> = BTreeMap::new();
    for &(word, ch) in owners.iter().flatten() {
        let span = spans.entry(word).or_insert((ch, ch));
        span.0 = span.0.min(ch);
        span.1 = span.1.max(ch);
    }
    spans
        .into_iter()
        .map(|(word, (first, last))| {
            let word = &line.words[word];
            let n = word.text.chars().count().max(1) as f64;
            let r = word.rect;
            let x0 = r.x + r.w * first as f64 / n;
            let x1 = r.x + r.w * (last + 1) as f64 / n;
            Rect { x: x0, y: r.y, w: x1 - x0, h: r.h }
        })
        .reduce(Rect::union)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(monitor: usize, y: f64, words: &[(&str, f64, f64)]) -> Line {
        Line {
            monitor,
            words: words
                .iter()
                .map(|&(text, x, w)| Word { text: text.to_string(), rect: Rect { x, y, w, h: 20.0 } })
                .collect(),
        }
    }

    #[test]
    fn ignores_case_and_accents() {
        let lines = [line(0, 0.0, &[("Ação", 0.0, 40.0), ("RÁPIDA", 50.0, 60.0)])];
        assert_eq!(find(&lines, "acao").len(), 1);
        assert_eq!(find(&lines, "AÇÃO rápida").len(), 1);
        assert_eq!(find(&lines, "rapido").len(), 0);
    }

    #[test]
    fn boxes_only_the_matched_part_of_a_word() {
        // "Dynamic": 7 chars over 70 px; "nam" is chars 2..=4.
        let lines = [line(0, 10.0, &[("Dynamic", 100.0, 70.0)])];
        let found = find(&lines, "nam");
        assert_eq!(found, [Found { rect: Rect { x: 120.0, y: 10.0, w: 30.0, h: 20.0 }, monitor: 0 }]);
    }

    #[test]
    fn a_phrase_spans_words() {
        let lines = [line(1, 0.0, &[("Find", 0.0, 40.0), ("on", 50.0, 20.0), ("screen", 80.0, 60.0)])];
        let found = find(&lines, "on   SCREEN");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].rect, Rect { x: 50.0, y: 0.0, w: 90.0, h: 20.0 });
        assert_eq!(found[0].monitor, 1);
    }

    #[test]
    fn finds_every_occurrence_in_reading_order() {
        let lines = [
            line(0, 0.0, &[("banana", 0.0, 60.0)]),
            line(0, 30.0, &[("ana", 0.0, 30.0), ("e", 40.0, 10.0), ("Ana", 60.0, 30.0)]),
        ];
        let found = find(&lines, "ana");
        // "banana" holds one non-overlapping "ana" (chars 1..=3), then two more.
        assert_eq!(found.len(), 3);
        assert_eq!(found[0].rect.y, 0.0);
        assert_eq!(found[1].rect.x, 0.0);
        assert_eq!(found[2].rect.x, 60.0);
    }

    #[test]
    fn nothing_typed_finds_nothing() {
        let lines = [line(0, 0.0, &[("text", 0.0, 40.0)])];
        assert!(find(&lines, "   ").is_empty());
    }
}
