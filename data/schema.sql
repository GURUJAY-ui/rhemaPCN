CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    abbreviation TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    language TEXT NOT NULL,
    license TEXT NOT NULL,
    is_copyrighted INTEGER NOT NULL DEFAULT 0,
    is_downloaded INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_id INTEGER NOT NULL REFERENCES translations(id),
    book_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    testament TEXT NOT NULL,
    UNIQUE(translation_id, book_number)
);

CREATE TABLE IF NOT EXISTS verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_id INTEGER NOT NULL REFERENCES translations(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    book_number INTEGER NOT NULL,
    book_name TEXT NOT NULL,
    book_abbreviation TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(translation_id, book_number, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_verses_chapter ON verses(translation_id, book_number, chapter);

CREATE TABLE IF NOT EXISTS cross_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_book INTEGER NOT NULL,
    from_chapter INTEGER NOT NULL,
    from_verse INTEGER NOT NULL,
    to_book INTEGER NOT NULL,
    to_chapter INTEGER NOT NULL,
    to_verse_start INTEGER NOT NULL,
    to_verse_end INTEGER NOT NULL,
    votes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crossref_from ON cross_references(from_book, from_chapter, from_verse);

CREATE TABLE IF NOT EXISTS embedding_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_id INTEGER NOT NULL REFERENCES translations(id),
    model_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    computed_at TEXT,
    UNIQUE(translation_id, model_name)
);

-- ── Hymns ──────────────────────────────────────────────────────────────────
-- A hymnal is a named collection (e.g. the PCN hymn book). Hymns belong to a
-- hymnal and carry the book's own numbering. Stanzas (verses/choruses) are
-- stored as ordered rows so they can be rendered one-at-a-time to the screen,
-- mirroring how Bible verses flow through the broadcast pipeline.

CREATE TABLE IF NOT EXISTS hymnals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,          -- stable id, e.g. 'pcn'
    title TEXT NOT NULL,                -- e.g. 'Presbyterian Church of Nigeria Hymn Book'
    language TEXT NOT NULL DEFAULT 'en',
    license TEXT NOT NULL DEFAULT 'public-domain'
);

CREATE TABLE IF NOT EXISTS hymns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hymnal_id INTEGER NOT NULL REFERENCES hymnals(id),
    number INTEGER,                     -- hymn number within the hymnal (NULL if unknown)
    title TEXT NOT NULL,
    author TEXT,                        -- words author / translator
    tune TEXT,                          -- tune name, if known
    meter TEXT,                         -- e.g. '11.12.12.10'
    category TEXT,                      -- thematic section, e.g. 'Adoration and Praise'
    themes TEXT,                        -- comma-separated topical tags
    scriptures TEXT,                    -- related scripture references
    source TEXT,                        -- provenance, e.g. 'pcnnewhavenenugu.org'
    UNIQUE(hymnal_id, number)
);

CREATE INDEX IF NOT EXISTS idx_hymns_number ON hymns(hymnal_id, number);

CREATE TABLE IF NOT EXISTS hymn_stanzas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hymn_id INTEGER NOT NULL REFERENCES hymns(id),
    position INTEGER NOT NULL,          -- 1-based display order
    kind TEXT NOT NULL DEFAULT 'verse', -- 'verse' | 'chorus' | 'refrain'
    label TEXT,                         -- e.g. '1', 'Chorus'
    text TEXT NOT NULL,                 -- stanza lines joined by '\n'
    UNIQUE(hymn_id, position)
);

CREATE INDEX IF NOT EXISTS idx_hymn_stanzas_hymn ON hymn_stanzas(hymn_id, position);
