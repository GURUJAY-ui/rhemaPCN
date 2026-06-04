#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;
use tauri::State;

use crate::state::AppState;
use rhema_bible::{Hymn, HymnDetail, HymnMatch, Hymnal};

#[tauri::command]
pub fn list_hymnals(state: State<'_, Mutex<AppState>>) -> Result<Vec<Hymnal>, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    let db = app_state
        .bible_db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.list_hymnals().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_hymns(
    state: State<'_, Mutex<AppState>>,
    hymnal_slug: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Hymn>, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    let db = app_state
        .bible_db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.list_hymns(hymnal_slug.as_deref(), limit.unwrap_or(2000))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_hymn(
    state: State<'_, Mutex<AppState>>,
    hymn_id: i64,
) -> Result<Option<HymnDetail>, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    let db = app_state
        .bible_db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.get_hymn(hymn_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_hymn_by_number(
    state: State<'_, Mutex<AppState>>,
    hymnal_slug: String,
    number: i64,
) -> Result<Option<HymnDetail>, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    let db = app_state
        .bible_db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.get_hymn_by_number(&hymnal_slug, number)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_hymns(
    state: State<'_, Mutex<AppState>>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<Hymn>, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    let db = app_state
        .bible_db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.search_hymns(&query, limit.unwrap_or(30))
        .map_err(|e| e.to_string())
}

/// Detect which hymn a (possibly noisy) transcript of singing belongs to.
/// Returns ranked candidates with a 0..1 confidence; the frontend decides
/// when to auto-display based on a confidence threshold.
#[tauri::command]
pub fn detect_hymn(
    state: State<'_, Mutex<AppState>>,
    transcript: String,
    limit: Option<usize>,
) -> Result<Vec<HymnMatch>, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    let db = app_state
        .bible_db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    let matches = db
        .detect_hymn(&transcript, limit.unwrap_or(5))
        .map_err(|e| e.to_string())?;

    if matches.is_empty() {
        log::info!("[HYMN-DETECT] {transcript:?} -> no candidates");
    } else {
        let summary: Vec<String> = matches
            .iter()
            .take(3)
            .map(|m| {
                let num = m
                    .hymn
                    .number
                    .map_or_else(|| "—".to_string(), |n| n.to_string());
                format!("#{num} {} ({:.0}%)", m.hymn.title, m.confidence * 100.0)
            })
            .collect();
        log::info!(
            "[HYMN-DETECT] {transcript:?} -> {} candidate(s): {}",
            matches.len(),
            summary.join(", ")
        );
    }

    Ok(matches)
}
