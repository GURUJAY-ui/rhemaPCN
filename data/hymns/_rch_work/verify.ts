import { Database } from "bun:sqlite"
const db = new Database("data/rhema.db")
const hl = db.prepare("SELECT id,slug,title FROM hymnals WHERE slug='pcn'").get() as any
console.log("hymnal:", hl.slug, "|", hl.title)
const n = db.prepare("SELECT COUNT(*) n FROM hymns WHERE hymnal_id=?").get(hl.id) as any
console.log("pcn hymn count:", n.n)
const range = db.prepare("SELECT MIN(number) lo, MAX(number) hi FROM hymns WHERE hymnal_id=?").get(hl.id) as any
console.log("number range:", range.lo, "..", range.hi)
// FTS search
const fts = db.prepare("SELECT number,title FROM hymns_fts WHERE hymns_fts MATCH 'amazing grace' LIMIT 3").all()
console.log("FTS 'amazing grace':", JSON.stringify(fts))
const fts2 = db.prepare("SELECT number,title FROM hymns_fts WHERE hymns_fts MATCH 'blessed assurance' LIMIT 3").all()
console.log("FTS 'blessed assurance':", JSON.stringify(fts2))
// stanzas for #715
const h = db.prepare("SELECT id,title FROM hymns WHERE hymnal_id=? AND number=715").get(hl.id) as any
const st = db.prepare("SELECT position,kind,label FROM hymn_stanzas WHERE hymn_id=? ORDER BY position").all(h.id)
console.log("#715", h.title, "stanzas:", JSON.stringify(st))
// total fts rows
const fc = db.prepare("SELECT COUNT(*) n FROM hymns_fts").get() as any
console.log("fts rows:", fc.n)
db.close()
