//! End-to-end tests for the Tauri command handlers.
//!
//! These build a mock Tauri app (`tauri::test`) with the real bundled database
//! managed as state, then invoke the actual `#[tauri::command]` functions —
//! exercising each data endpoint exactly as the frontend does. They skip
//! gracefully if `data/rhema.db` is absent (e.g. a clean CI checkout).
#![allow(clippy::pedantic, clippy::unwrap_used)]

use std::sync::Mutex;

use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::{App, Manager};

use crate::commands;
use crate::state::AppState;

fn app_with_db() -> Option<App<MockRuntime>> {
    let db_path =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../data/rhema.db");
    if !db_path.exists() {
        eprintln!("skipping command tests: {} not found", db_path.display());
        return None;
    }
    let db = rhema_bible::BibleDb::open(&db_path).expect("open rhema.db");
    let mut state = AppState::new();
    state.bible_db = Some(db);

    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("build mock app");
    app.manage(Mutex::new(state));
    Some(app)
}

macro_rules! app_or_skip {
    ($a:ident) => {
        let Some($a) = app_with_db() else {
            return;
        };
    };
}

// ── Hymn endpoints ──────────────────────────────────────────────────

#[test]
fn list_hymnals_endpoint() {
    app_or_skip!(app);
    let hymnals = commands::hymns::list_hymnals(app.state()).expect("list_hymnals");
    assert!(
        hymnals.iter().any(|h| h.slug == "pcn"),
        "expected a 'pcn' hymnal"
    );
}

#[test]
fn list_hymns_endpoint_full_and_filtered() {
    app_or_skip!(app);
    let all = commands::hymns::list_hymns(app.state(), None, Some(5000)).expect("all");
    assert!(all.len() >= 700, "expected the full corpus, got {}", all.len());

    let pcn =
        commands::hymns::list_hymns(app.state(), Some("pcn".into()), Some(5000)).expect("pcn");
    assert!(pcn.iter().all(|h| h.hymnal_slug == "pcn"));
    assert!(pcn.len() >= 700, "expected ~713 PCN hymns, got {}", pcn.len());
}

#[test]
fn get_hymn_by_number_endpoint_and_missing() {
    app_or_skip!(app);
    let d = commands::hymns::get_hymn_by_number(app.state(), "pcn".into(), 1)
        .expect("ok")
        .expect("pcn #1 exists");
    assert_eq!(d.hymn.number, Some(1));
    assert!(!d.stanzas.is_empty());

    assert!(commands::hymns::get_hymn_by_number(app.state(), "pcn".into(), 999_999)
        .expect("ok")
        .is_none());
}

#[test]
fn get_hymn_endpoint_roundtrip() {
    app_or_skip!(app);
    let d = commands::hymns::get_hymn_by_number(app.state(), "pcn".into(), 1)
        .unwrap()
        .unwrap();
    let again = commands::hymns::get_hymn(app.state(), d.hymn.id)
        .unwrap()
        .expect("by id");
    assert_eq!(again.hymn.id, d.hymn.id);
    assert_eq!(again.stanzas.len(), d.stanzas.len());
}

#[test]
fn search_hymns_endpoint() {
    app_or_skip!(app);
    let res = commands::hymns::search_hymns(app.state(), "praise".into(), Some(20))
        .expect("search");
    assert!(!res.is_empty(), "expected hits for 'praise'");
}

#[test]
fn detect_hymn_endpoint_roundtrips_from_own_lyrics() {
    app_or_skip!(app);
    // Build the query from a hymn's own stanza text at runtime (no hard-coded
    // lyrics), then assert detection finds that same hymn back.
    let d = commands::hymns::get_hymn_by_number(app.state(), "pcn".into(), 1)
        .unwrap()
        .unwrap();
    let q: String = d.stanzas[0]
        .text
        .split_whitespace()
        .take(8)
        .collect::<Vec<_>>()
        .join(" ");
    let matches = commands::hymns::detect_hymn(app.state(), q, Some(5)).expect("detect");
    assert!(
        matches.iter().any(|m| m.hymn.id == d.hymn.id),
        "detection should surface the source hymn"
    );
}

#[test]
fn detect_hymn_endpoint_ignores_stopwords() {
    app_or_skip!(app);
    let matches =
        commands::hymns::detect_hymn(app.state(), "the of and to a".into(), Some(5))
            .expect("detect");
    assert!(
        matches.is_empty(),
        "stopword-only speech must not detect a hymn"
    );
}

// ── Bible endpoints ─────────────────────────────────────────────────

#[test]
fn list_translations_endpoint() {
    app_or_skip!(app);
    let t = commands::bible::list_translations(app.state()).expect("translations");
    assert!(!t.is_empty(), "expected at least one translation");
}

#[test]
fn search_verses_endpoint() {
    app_or_skip!(app);
    let trans = commands::bible::list_translations(app.state()).expect("translations");
    let tid = trans[0].id;
    let verses = commands::bible::search_verses(app.state(), "beginning".into(), tid, 10)
        .expect("search_verses");
    assert!(!verses.is_empty(), "expected verse hits for 'beginning'");
}

#[test]
fn db_not_loaded_returns_error() {
    // A managed AppState without a DB must yield a clean error, not a panic.
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app");
    app.manage(Mutex::new(AppState::new()));
    let err = commands::hymns::list_hymnals(app.state()).unwrap_err();
    assert!(err.contains("not loaded"), "got: {err}");
}
