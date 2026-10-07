//! Performance counters (PDH): the numbers Task Manager shows. Counters are
//! added by their English path, which works on any Windows display language.

use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
    PdhGetFormattedCounterValue, PdhOpenQueryW, PDH_FMT, PDH_FMT_COUNTERVALUE, PDH_FMT_COUNTERVALUE_ITEM_W,
    PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
};
use windows::core::{HSTRING, PCWSTR};

const PDH_MORE_DATA: u32 = 0x8000_07D2;
const OK: u32 = 0;
const PDH_FMT_NOCAP100: u32 = 0x8000;
/// Doubles, and percentages over 100 kept (CPU utility goes above it with turbo).
const FORMAT: PDH_FMT = PDH_FMT(PDH_FMT_DOUBLE.0 | PDH_FMT_NOCAP100);

pub struct Query(PDH_HQUERY);

// The handle is only touched by the thread that owns the query.
unsafe impl Send for Query {}

impl Query {
    pub fn open() -> Option<Self> {
        let mut handle = PDH_HQUERY::default();
        (unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut handle) } == OK).then_some(Query(handle))
    }

    pub fn add(&self, path: &str) -> Option<Counter> {
        let mut counter = PDH_HCOUNTER::default();
        (unsafe { PdhAddEnglishCounterW(self.0, &HSTRING::from(path), 0, &mut counter) } == OK)
            .then_some(Counter(counter))
    }

    /// Takes a sample. Rates (`/sec`, `%`) need two of them.
    pub fn collect(&self) -> bool {
        unsafe { PdhCollectQueryData(self.0) == OK }
    }
}

impl Drop for Query {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.0);
        }
    }
}

pub struct Counter(PDH_HCOUNTER);

impl Counter {
    pub fn value(&self) -> Option<f64> {
        let mut value = PDH_FMT_COUNTERVALUE::default();
        let status = unsafe { PdhGetFormattedCounterValue(self.0, FORMAT, None, &mut value) };
        (status == OK && value.CStatus == OK).then_some(unsafe { value.Anonymous.doubleValue })
    }

    /// Every instance of a wildcard counter (`\Process(*)\…`), by name.
    pub fn values(&self) -> Vec<(String, f64)> {
        let format = FORMAT;
        let (mut size, mut count) = (0u32, 0u32);
        let status = unsafe { PdhGetFormattedCounterArrayW(self.0, format, &mut size, &mut count, None) };
        if status != PDH_MORE_DATA || size == 0 {
            return Vec::new();
        }
        // u64 storage keeps the items aligned.
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        let status = unsafe { PdhGetFormattedCounterArrayW(self.0, format, &mut size, &mut count, Some(items)) };
        if status != OK {
            return Vec::new();
        }
        let items = unsafe { std::slice::from_raw_parts(items, count as usize) };
        items
            .iter()
            .filter(|i| i.FmtValue.CStatus == OK)
            .filter_map(|i| {
                let name = unsafe { i.szName.to_string() }.ok()?;
                Some((name, unsafe { i.FmtValue.Anonymous.doubleValue }))
            })
            .collect()
    }
}
