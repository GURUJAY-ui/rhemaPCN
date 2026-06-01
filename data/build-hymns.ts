/**
 * Imports hymns into rhema.db from a JSON source.
 * Run: bun run data/build-hymns.ts [path/to/hymns.json]
 *
 * Idempotent and additive: it does NOT drop the database (unlike
 * build-bible-db.ts), so it can be run any time to add or refresh hymns
 * without rebuilding the Bible tables. Re-importing a hymn with the same
 * (hymnal, number) replaces that hymn's stanzas.
 *
 * Default source: data/hymns/pcn-hymns-seed.json
 */

import { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const DATA_DIR = import.meta.dir
const DB_PATH = join(DATA_DIR, "rhema.db")
const SCHEMA_PATH = join(DATA_DIR, "schema.sql")
const SOURCE_PATH = process.argv[2] ?? join(DATA_DIR, "hymns", "pcn-hymns-seed.json")

interface StanzaJSON {
  kind?: "verse" | "chorus" | "refrain"
  label?: string
  text: string
}

interface HymnJSON {
  number?: number | null
  title: string
  author?: string | null
  tune?: string | null
  meter?: string | null
  category?: string | null
  themes?: string | null
  scriptures?: string | null
  source?: string | null
  stanzas: StanzaJSON[]
}

interface HymnSourceJSON {
  hymnal: { slug: string; title: string; language?: string; license?: string }
  hymns: HymnJSON[]
}

function ensureSchema(db: Database) {
  // All statements are CREATE ... IF NOT EXISTS, so this is safe on an
  // existing database — it only adds the hymn tables if missing.
  const schema = readFileSync(SCHEMA_PATH, "utf-8")
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt + ";")
  }
  // Migrate older databases: add hymn columns introduced after first release.
  const cols = new Set(
    (db.prepare("PRAGMA table_info(hymns)").all() as { name: string }[]).map((c) => c.name)
  )
  for (const col of ["category", "themes", "scriptures"]) {
    if (!cols.has(col)) db.exec(`ALTER TABLE hymns ADD COLUMN ${col} TEXT;`)
  }

  // Standalone FTS index over hymn title + full lyrics (rebuilt on each run).
  db.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS hymns_fts USING fts5(hymn_id UNINDEXED, number UNINDEXED, title, lyrics, tokenize='unicode61');"
  )
}

function main() {
  console.log(`📖 Importing hymns from ${SOURCE_PATH}`)

  let source: HymnSourceJSON
  try {
    source = JSON.parse(readFileSync(SOURCE_PATH, "utf-8"))
  } catch (e) {
    console.error(`❌ Could not read/parse source: ${(e as Error).message}`)
    process.exit(1)
  }

  const db = new Database(DB_PATH, { create: true })
  ensureSchema(db)

  const { hymnal } = source

  // Upsert hymnal by slug.
  db.prepare(
    `INSERT INTO hymnals (slug, title, language, license)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET title=excluded.title, language=excluded.language, license=excluded.license`
  ).run(hymnal.slug, hymnal.title, hymnal.language ?? "en", hymnal.license ?? "public-domain")

  const hymnalId = (
    db.prepare("SELECT id FROM hymnals WHERE slug = ?").get(hymnal.slug) as { id: number }
  ).id

  const findByNumber = db.prepare(
    "SELECT id FROM hymns WHERE hymnal_id = ? AND number = ?"
  )
  const deleteStanzas = db.prepare("DELETE FROM hymn_stanzas WHERE hymn_id = ?")
  const deleteHymn = db.prepare("DELETE FROM hymns WHERE id = ?")
  const insertHymn = db.prepare(
    `INSERT INTO hymns (hymnal_id, number, title, author, tune, meter, category, themes, scriptures, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertStanza = db.prepare(
    `INSERT INTO hymn_stanzas (hymn_id, position, kind, label, text)
     VALUES (?, ?, ?, ?, ?)`
  )

  let imported = 0
  db.exec("BEGIN TRANSACTION")
  for (const hymn of source.hymns) {
    // Replace existing hymn with the same number (idempotent re-import).
    if (hymn.number != null) {
      const existing = findByNumber.get(hymnalId, hymn.number) as { id: number } | null
      if (existing) {
        deleteStanzas.run(existing.id)
        deleteHymn.run(existing.id)
      }
    }

    const { lastInsertRowid } = insertHymn.run(
      hymnalId,
      hymn.number ?? null,
      hymn.title,
      hymn.author ?? null,
      hymn.tune ?? null,
      hymn.meter ?? null,
      hymn.category ?? null,
      hymn.themes ?? null,
      hymn.scriptures ?? null,
      hymn.source ?? null
    )
    const hymnId = Number(lastInsertRowid)

    hymn.stanzas.forEach((s, i) => {
      insertStanza.run(hymnId, i + 1, s.kind ?? "verse", s.label ?? String(i + 1), s.text)
    })
    imported++
  }
  db.exec("COMMIT")

  // Rebuild the FTS index from scratch.
  db.exec("DELETE FROM hymns_fts;")
  db.exec(
    `INSERT INTO hymns_fts (hymn_id, number, title, lyrics)
     SELECT h.id, h.number, h.title,
            (SELECT group_concat(s.text, char(10)) FROM hymn_stanzas s WHERE s.hymn_id = h.id)
     FROM hymns h;`
  )

  // Fold the WAL into the main .db file so a plain file copy (Tauri resource
  // bundling / dev resource copy) includes the hymns AND the FTS index.
  // Without this, FTS writes can linger in the -wal sidecar and a copied DB
  // ends up with an empty hymns_fts (search + detection silently return nothing).
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);")

  const total = (db.prepare("SELECT COUNT(*) AS n FROM hymns").get() as { n: number }).n
  console.log(`✓ Imported ${imported} hymn(s). Hymnal now holds ${total} total.`)
  db.close()
}

main()
