use rusty_leveldb::{LdbIterator, Options, DB};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

// Chromium localStorage LevelDB key format:
//   key   = "_file://" + 0x00 + 0x01 + <localStorage key as UTF-8>
//   value = 0x01 + <value as UTF-8>
const KEY_PREFIX: &[u8] = b"_file://\x00\x01";
const VALUE_PREFIX: u8 = 0x01;

fn airi_localstorage_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    config_dir
        .join("ai.moeru.airi")
        .join("Local Storage")
        .join("leveldb")
}

fn encode_key(key: &str) -> Vec<u8> {
    let mut buf = KEY_PREFIX.to_vec();
    buf.extend_from_slice(key.as_bytes());
    buf
}

fn decode_key(raw: &[u8]) -> Option<String> {
    if !raw.starts_with(KEY_PREFIX) {
        return None;
    }
    std::str::from_utf8(&raw[KEY_PREFIX.len()..])
        .ok()
        .map(|s| s.to_string())
}

fn encode_value(value: &str) -> Vec<u8> {
    let mut buf = vec![VALUE_PREFIX];
    buf.extend_from_slice(value.as_bytes());
    buf
}

fn decode_value(raw: &[u8]) -> Option<String> {
    match raw.first() {
        Some(0x01) => {
            // Modern Chromium format: 0x01 prefix + UTF-8
            std::str::from_utf8(&raw[1..]).ok().map(|s| s.to_string())
        }
        Some(0x00) => {
            // Legacy Chromium format: 0x00 prefix + UTF-16 LE
            let bytes = &raw[1..];
            if bytes.len() % 2 != 0 {
                return None;
            }
            let utf16: Vec<u16> = bytes
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            String::from_utf16(&utf16).ok()
        }
        _ => None,
    }
}

fn open_db() -> Result<DB, String> {
    let path = airi_localstorage_path();
    if !path.exists() {
        return Err(format!(
            "AIRI localStorage not found at {}. Is AIRI installed?",
            path.display()
        ));
    }
    let mut opts = Options::default();
    opts.create_if_missing = false;
    DB::open(&path, opts).map_err(|e| format!("Failed to open AIRI localStorage: {e}"))
}

// ─── Tauri Commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn airi_get_setting(key: String) -> Result<Option<String>, String> {
    let mut db = open_db()?;
    Ok(db.get(&encode_key(&key)).and_then(|v| decode_value(&v)))
}

#[tauri::command]
pub fn airi_set_setting(key: String, value: String) -> Result<(), String> {
    let mut db = open_db()?;
    db.put(&encode_key(&key), &encode_value(&value))
        .map_err(|e| format!("Write failed: {e}"))?;
    db.flush().map_err(|e| format!("Flush failed: {e}"))
}

#[tauri::command]
pub fn airi_delete_setting(key: String) -> Result<(), String> {
    let mut db = open_db()?;
    db.delete(&encode_key(&key))
        .map_err(|e| format!("Delete failed: {e}"))?;
    db.flush().map_err(|e| format!("Flush failed: {e}"))
}

#[derive(Serialize, Deserialize)]
pub struct AiriSettingEntry {
    pub key: String,
    pub value: String,
}

/// Returns all AIRI localStorage entries.
#[tauri::command]
pub fn airi_get_all_settings() -> Result<Vec<AiriSettingEntry>, String> {
    let mut db = open_db()?;
    let mut iter = db
        .new_iter()
        .map_err(|e| format!("Iterator failed: {e}"))?;

    iter.seek(KEY_PREFIX);

    let mut entries = Vec::new();
    while iter.valid() {
        let current = iter.current();
        match current {
            Some((k, v)) => {
                let k: Vec<u8> = k.to_vec();
                let v: Vec<u8> = v.to_vec();
                if !k.starts_with(KEY_PREFIX) {
                    break;
                }
                if let (Some(key), Some(value)) = (decode_key(&k), decode_value(&v)) {
                    entries.push(AiriSettingEntry { key, value });
                }
            }
            None => break,
        }
        iter.advance();
    }

    Ok(entries)
}

/// Atomically write multiple settings at once (safe batch update).
#[tauri::command]
pub fn airi_set_settings(settings: HashMap<String, String>) -> Result<(), String> {
    let mut db = open_db()?;
    for (key, value) in &settings {
        db.put(&encode_key(key), &encode_value(value))
            .map_err(|e| format!("Write failed for key '{key}': {e}"))?;
    }
    db.flush().map_err(|e| format!("Flush failed: {e}"))
}
