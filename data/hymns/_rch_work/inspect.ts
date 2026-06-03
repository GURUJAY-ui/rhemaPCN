import { Database } from "bun:sqlite"
const db = new Database("data/rhema.db")
const hymnals = db.prepare("SELECT id,slug,title FROM hymnals").all()
console.log("hymnals:", JSON.stringify(hymnals))
for (const h of hymnals as any[]) {
  const c = db.prepare("SELECT COUNT(*) n FROM hymns WHERE hymnal_id=?").get(h.id) as any
  console.log(`  ${h.slug}: ${c.n} hymns`)
}
console.log("total hymns:", (db.prepare("SELECT COUNT(*) n FROM hymns").get() as any).n)
