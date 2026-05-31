//! Hymn storage, retrieval, and lyric-based search/detection.
//!
//! Hymns live in the same `SQLite` database as the Bible (`rhema.db`) in the
//! `hymnals`, `hymns`, and `hymn_stanzas` tables, with an FTS5 index
//! (`hymns_fts`) over title + lyrics. Detection of a sung hymn reuses the same
//! BM25 phrase/AND/OR strategy as verse search: as the choir's words are
//! transcribed, the accumulated text is matched against hymn lyrics and the
//! best-ranked hymn is surfaced.

use rusqlite::Connection;
use serde::Serialize;

use crate::db::BibleDb;
use crate::error::BibleError;
use crate::search::{build_and_query, build_or_query, build_phrase_query};

#[derive(Serialize, Clone, Debug)]
pub struct Hymnal {
    pub id: i64,
    pub slug: String,
    pub title: String,
    pub language: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Hymn {
    pub id: i64,
    pub hymnal_id: i64,
    pub hymnal_slug: String,
    pub hymnal_title: String,
    pub number: Option<i64>,
    pub title: String,
    pub author: Option<String>,
    pub category: Option<String>,
    pub themes: Option<String>,
    pub scriptures: Option<String>,
    pub source: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct HymnStanza {
    pub id: i64,
    pub position: i64,
    pub kind: String,
    pub label: Option<String>,
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct HymnDetail {
    #[serde(flatten)]
    pub hymn: Hymn,
    pub stanzas: Vec<HymnStanza>,
}

/// A hymn matched by full-text search, with its BM25 rank.
#[derive(Serialize, Clone, Debug)]
pub struct HymnMatch {
    /// BM25 rank (negative; more negative = more relevant).
    pub rank: f64,
    /// Heuristic 0..1 confidence derived from rank + term coverage.
    pub confidence: f64,
    #[serde(flatten)]
    pub hymn: Hymn,
}

const HYMN_COLS: &str = "h.id, h.hymnal_id, hl.slug, hl.title, h.number, h.title, \
     h.author, h.category, h.themes, h.scriptures, h.source";

fn map_hymn(row: &rusqlite::Row) -> rusqlite::Result<Hymn> {
    Ok(Hymn {
        id: row.get(0)?,
        hymnal_id: row.get(1)?,
        hymnal_slug: row.get(2)?,
        hymnal_title: row.get(3)?,
        number: row.get(4)?,
        title: row.get(5)?,
        author: row.get(6)?,
        category: row.get(7)?,
        themes: row.get(8)?,
        scriptures: row.get(9)?,
        source: row.get(10)?,
    })
}

impl BibleDb {
    fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, BibleError> {
        self.conn.lock().map_err(|e| BibleError::Internal(e.to_string()))
    }

    /// List all hymnals (collections) in the database.
    pub fn list_hymnals(&self) -> Result<Vec<Hymnal>, BibleError> {
        let conn = self.lock_conn()?;
        let mut stmt =
            conn.prepare("SELECT id, slug, title, language FROM hymnals ORDER BY title")?;
        let rows = stmt.query_map([], |row| {
            Ok(Hymnal {
                id: row.get(0)?,
                slug: row.get(1)?,
                title: row.get(2)?,
                language: row.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// List hymns, optionally filtered to one hymnal slug. Numbered hymns sort
    /// first (by number), then unnumbered hymns alphabetically by title.
    #[expect(clippy::cast_possible_wrap, reason = "limit is a small page size")]
    pub fn list_hymns(
        &self,
        hymnal_slug: Option<&str>,
        limit: usize,
    ) -> Result<Vec<Hymn>, BibleError> {
        let conn = self.lock_conn()?;
        let order = "ORDER BY (h.number IS NULL), h.number, h.title";
        let (sql, slug_param) = match hymnal_slug {
            Some(slug) => (
                format!(
                    "SELECT {HYMN_COLS} FROM hymns h JOIN hymnals hl ON hl.id = h.hymnal_id \
                     WHERE hl.slug = ?1 {order} LIMIT ?2"
                ),
                Some(slug.to_string()),
            ),
            None => (
                format!(
                    "SELECT {HYMN_COLS} FROM hymns h JOIN hymnals hl ON hl.id = h.hymnal_id \
                     {order} LIMIT ?1"
                ),
                None,
            ),
        };
        let mut stmt = conn.prepare(&sql)?;
        let rows = match slug_param {
            Some(slug) => stmt.query_map(rusqlite::params![slug, limit as i64], map_hymn)?,
            None => stmt.query_map(rusqlite::params![limit as i64], map_hymn)?,
        };
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn fetch_stanzas(&self, conn: &Connection, hymn_id: i64) -> Result<Vec<HymnStanza>, BibleError> {
        let mut stmt = conn.prepare(
            "SELECT id, position, kind, label, text FROM hymn_stanzas \
             WHERE hymn_id = ?1 ORDER BY position",
        )?;
        let rows = stmt.query_map(rusqlite::params![hymn_id], |row| {
            Ok(HymnStanza {
                id: row.get(0)?,
                position: row.get(1)?,
                kind: row.get(2)?,
                label: row.get(3)?,
                text: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Fetch a single hymn with its ordered stanzas by primary key.
    pub fn get_hymn(&self, hymn_id: i64) -> Result<Option<HymnDetail>, BibleError> {
        let conn = self.lock_conn()?;
        let sql = format!(
            "SELECT {HYMN_COLS} FROM hymns h JOIN hymnals hl ON hl.id = h.hymnal_id \
             WHERE h.id = ?1"
        );
        let hymn = conn
            .query_row(&sql, rusqlite::params![hymn_id], map_hymn)
            .ok();
        match hymn {
            Some(hymn) => {
                let stanzas = self.fetch_stanzas(&conn, hymn.id)?;
                Ok(Some(HymnDetail { hymn, stanzas }))
            }
            None => Ok(None),
        }
    }

    /// Fetch a hymn by its number within a hymnal (e.g. PCN #316).
    pub fn get_hymn_by_number(
        &self,
        hymnal_slug: &str,
        number: i64,
    ) -> Result<Option<HymnDetail>, BibleError> {
        let conn = self.lock_conn()?;
        let sql = format!(
            "SELECT {HYMN_COLS} FROM hymns h JOIN hymnals hl ON hl.id = h.hymnal_id \
             WHERE hl.slug = ?1 AND h.number = ?2"
        );
        let hymn = conn
            .query_row(&sql, rusqlite::params![hymnal_slug, number], map_hymn)
            .ok();
        match hymn {
            Some(hymn) => {
                let stanzas = self.fetch_stanzas(&conn, hymn.id)?;
                Ok(Some(HymnDetail { hymn, stanzas }))
            }
            None => Ok(None),
        }
    }

    /// Run a BM25-ranked FTS query against `hymns_fts`. Title is weighted above
    /// lyrics so a title-word query ranks the right hymn first.
    #[expect(clippy::cast_possible_wrap, reason = "limit is a small page size")]
    fn run_hymn_fts(
        conn: &Connection,
        match_query: &str,
        limit: usize,
    ) -> Result<Vec<HymnMatch>, BibleError> {
        if match_query.is_empty() {
            return Ok(vec![]);
        }
        // Column order in hymns_fts: hymn_id, number, title, lyrics.
        let sql = format!(
            "SELECT bm25(hymns_fts, 0.0, 0.0, 8.0, 2.0) AS rank, {HYMN_COLS} \
             FROM hymns_fts fts \
             JOIN hymns h ON h.id = fts.hymn_id \
             JOIN hymnals hl ON hl.id = h.hymnal_id \
             WHERE hymns_fts MATCH ?1 \
             ORDER BY rank LIMIT ?2"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![match_query, limit as i64], |row| {
            let rank: f64 = row.get(0)?;
            let hymn = Hymn {
                id: row.get(1)?,
                hymnal_id: row.get(2)?,
                hymnal_slug: row.get(3)?,
                hymnal_title: row.get(4)?,
                number: row.get(5)?,
                title: row.get(6)?,
                author: row.get(7)?,
                category: row.get(8)?,
                themes: row.get(9)?,
                scriptures: row.get(10)?,
                source: row.get(11)?,
            };
            // Map BM25 rank (typically ~ -0.5 .. -20) to a rough 0..1 confidence.
            let confidence = (-rank / 12.0).clamp(0.0, 1.0);
            Ok(HymnMatch { rank, confidence, hymn })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Search hymns by title or lyric text (phrase → AND → OR fallback).
    pub fn search_hymns(&self, query: &str, limit: usize) -> Result<Vec<Hymn>, BibleError> {
        let matches = self.search_hymns_ranked(query, limit)?;
        Ok(matches.into_iter().map(|m| m.hymn).collect())
    }

    /// Search hymns and keep BM25 ranks/confidence — the basis for detection.
    pub fn search_hymns_ranked(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<HymnMatch>, BibleError> {
        let conn = self.lock_conn()?;

        let phrase = build_phrase_query(query);
        let mut results = Self::run_hymn_fts(&conn, &phrase, limit)?;

        if results.len() < limit {
            let and_q = build_and_query(query);
            if !and_q.is_empty() {
                results.extend(Self::run_hymn_fts(&conn, &and_q, limit)?);
            }
        }
        if results.len() < limit {
            let or_q = build_or_query(query);
            if !or_q.is_empty() {
                results.extend(Self::run_hymn_fts(&conn, &or_q, limit)?);
            }
        }

        // Deduplicate by hymn id, keeping the best (first) occurrence.
        let mut seen = std::collections::HashSet::new();
        let deduped: Vec<HymnMatch> = results
            .into_iter()
            .filter(|m| seen.insert(m.hymn.id))
            .take(limit)
            .collect();
        Ok(deduped)
    }

    /// Detect which hymn is being sung from a (possibly noisy) transcript.
    /// Returns ranked candidates; the caller decides when confidence is high
    /// enough to display. Phrase matches on sung lyrics rank highest.
    pub fn detect_hymn(&self, transcript: &str, limit: usize) -> Result<Vec<HymnMatch>, BibleError> {
        self.search_hymns_ranked(transcript, limit)
    }
}
