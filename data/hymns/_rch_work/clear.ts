import { Database } from "bun:sqlite"
const db = new Database("data/rhema.db")
const row = db.prepare("SELECT id FROM hymnals WHERE slug='pcn'").get() as any
if (row) {
  const ids = db.prepare("SELECT id FROM hymns WHERE hymnal_id=?").all(row.id) as any[]
  const delS = db.prepare("DELETE FROM hymn_stanzas WHERE hymn_id=?")
  for (const h of ids) delS.run(h.id)
  db.prepare("DELETE FROM hymns WHERE hymnal_id=?").run(row.id)
  console.log(`cleared ${ids.length} old pcn hymns`)
} else console.log("no existing pcn hymnal")
db.close()
