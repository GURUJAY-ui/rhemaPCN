#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use serde::Serialize;

use crate::state::AppState;
use rhema_bible::{Book, CrossReference, Translation, Verse};

fn bible_db_path(app: &AppHandle) -> std::path::PathBuf {
    let base_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let dev_db = base_dir.join("data").join("rhema.db");

    app.path()
        .resource_dir()
        .map(|p| p.join("rhema.db"))
        .ok()
        .filter(|p| p.exists())
        .unwrap_or(dev_db)
}

fn ensure_bible_db<'a>(app: &'a AppHandle, state: &'a mut AppState) -> Result<&'a rhema_bible::BibleDb, String> {
    if state.bible_db.is_none() {
        let db_path = bible_db_path(app);
        if !db_path.exists() {
            return Err(format!("Bible database not found at {}", db_path.display()));
        }

        let bible_db = rhema_bible::BibleDb::open(&db_path)
            .map_err(|e| format!("Failed to open Bible database: {e}"))?;

        state.bible_db = Some(bible_db);
        log::info!("Bible database loaded from {}", db_path.display());
    }

    state
        .bible_db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())
}

#[tauri::command]
pub fn list_translations(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<Translation>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;
    db.list_translations().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_books(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    translation_id: i64,
) -> Result<Vec<Book>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;
    db.list_books(translation_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chapter(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    translation_id: i64,
    book_number: i32,
    chapter: i32,
) -> Result<Vec<Verse>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;
    db.get_chapter(translation_id, book_number, chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_verse(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    translation_id: i64,
    book_number: i32,
    chapter: i32,
    verse: i32,
) -> Result<Option<Verse>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;
    db.get_verse(translation_id, book_number, chapter, verse)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_verses(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    query: String,
    translation_id: i64,
    limit: usize,
) -> Result<Vec<Verse>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;
    db.search_verses(&query, translation_id, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cross_references(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    book_number: i32,
    chapter: i32,
    verse: i32,
) -> Result<Vec<CrossReference>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;
    db.get_cross_references(book_number, chapter, verse)
        .map_err(|e| e.to_string())
}

/// Get the active translation ID
#[tauri::command]
pub fn get_active_translation(
    state: State<'_, Mutex<AppState>>,
) -> Result<i64, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    Ok(app_state.active_translation_id)
}

/// Set the active translation by ID
#[tauri::command]
pub fn set_active_translation(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    translation_id: i64,
) -> Result<i64, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;
    let translations = db.list_translations().map_err(|e| e.to_string())?;
    if !translations.iter().any(|t| t.id == translation_id) {
        return Err(format!("Translation ID {translation_id} not found"));
    }

    app_state.active_translation_id = translation_id;
    log::info!("[BIBLE] Active translation set to ID {translation_id}");
    Ok(translation_id)
}

#[derive(Serialize)]
pub struct VerseSearchRow {
    pub book_number: i32,
    pub book_name: String,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

#[tauri::command]
pub fn get_translation_verses_for_search(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    translation_id: i64,
) -> Result<Vec<VerseSearchRow>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let db = ensure_bible_db(&app, &mut app_state)?;

    db.load_translation_verses_for_search(translation_id)
        .map(|rows| {
            rows.into_iter()
                .map(|v| VerseSearchRow {
                    book_number: v.book_number,
                    book_name: v.book_name,
                    chapter: v.chapter,
                    verse: v.verse,
                    text: v.text,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}
