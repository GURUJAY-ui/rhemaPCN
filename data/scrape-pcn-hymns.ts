/**
 * Scrapes hymns from the PCN New Haven (Enugu) public hymn pages and writes a
 * JSON file in the same shape as pcn-hymns-seed.json, ready for build-hymns.ts.
 *
 *   bun run data/scrape-pcn-hymns.ts [startId] [endId] [outFile]
 *   # default: 1..1000 -> data/hymns/pcn-hymns-scraped.json
 *
 * Be a good citizen: this hits someone else's server once per hymn. It is
 * rate-limited (DELAY_MS between requests) and skips missing/empty pages.
 * Run it deliberately, not in a tight loop. The lyrics on the source contain
 * occasional typos; treat the result as a draft to proofread, and prefer the
 * hand-checked seed entries where they exist (build-hymns.ts dedupes by number).
 *
 * No external dependencies — HTML is parsed with small regexes against the
 * page's stable `<div id="wrap">` block.
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"

const DATA_DIR = import.meta.dir
const START = Number(process.argv[2] ?? 1)
const END = Number(process.argv[3] ?? 1000)
const OUT = process.argv[4] ?? join(DATA_DIR, "hymns", "pcn-hymns-scraped.json")
const BASE = "https://pcnnewhavenenugu.org/hymn?id="
const DELAY_MS = 600
const MAX_CONSECUTIVE_MISSES = 25 // stop early once we run past the end of the book

interface Stanza { kind: "verse" | "chorus" | "refrain"; label: string; text: string }
interface Hymn { number: number; title: string; source: string; stanzas: Stanza[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&[a-zA-Z]+;/g, " ")
}

/** Pull the inner text of <div id="wrap">…</div>, converting <br> to newlines. */
function extractWrap(html: string): string | null {
  const m = html.match(/<div id="wrap">([\s\S]*?)<\/div>/i)
  if (!m) return null
  return decodeEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "") // strip any remaining tags
  ).trim()
}

/** Split wrap text into stanzas. Stanzas are separated by blank lines and each
 *  starts with a leading "N." which we strip. A "chorus"/"refrain" line marks kind. */
function parseStanzas(wrap: string): Stanza[] {
  const blocks = wrap
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)

  const stanzas: Stanza[] = []
  for (const block of blocks) {
    const firstLine = block.split("\n")[0].toLowerCase()
    const kind: Stanza["kind"] = /^(chorus|refrain)\b/.test(firstLine)
      ? firstLine.startsWith("refrain")
        ? "refrain"
        : "chorus"
      : "verse"

    const labelMatch = block.match(/^\s*(\d+)\.\s*/)
    const label =
      kind === "verse"
        ? labelMatch?.[1] ?? String(stanzas.length + 1)
        : kind === "chorus"
          ? "Chorus"
          : "Refrain"

    const text = block
      .replace(/^\s*\d+\.\s*/, "")
      .replace(/^\s*(chorus|refrain)\s*:?\s*/i, "")
      .trim()

    if (text) stanzas.push({ kind, label, text })
  }
  return stanzas
}

async function fetchHymn(id: number): Promise<Hymn | null> {
  const res = await fetch(`${BASE}${id}`, {
    headers: { "User-Agent": "rhema-hymn-import (church use)" },
  })
  if (!res.ok) return null
  const html = await res.text()
  const wrap = extractWrap(html)
  if (!wrap) return null

  const stanzas = parseStanzas(wrap)
  if (stanzas.length === 0) return null

  // Title = first line of the first stanza (hymnal convention).
  const title = stanzas[0].text.split("\n")[0].replace(/[;,.\s]+$/, "").trim()
  if (!title) return null

  return { number: id, title, source: "pcnnewhavenenugu.org", stanzas }
}

async function main() {
  console.log(`🌐 Scraping hymns ${START}..${END} from ${BASE}`)
  const hymns: Hymn[] = []
  let consecutiveMisses = 0

  for (let id = START; id <= END; id++) {
    try {
      const hymn = await fetchHymn(id)
      if (hymn) {
        hymns.push(hymn)
        consecutiveMisses = 0
        if (hymns.length % 25 === 0) console.log(`  …${hymns.length} hymns so far (at #${id})`)
      } else {
        consecutiveMisses++
      }
    } catch (e) {
      console.warn(`  ⚠ #${id} failed: ${(e as Error).message}`)
      consecutiveMisses++
    }

    if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
      console.log(`  ⏹ ${MAX_CONSECUTIVE_MISSES} consecutive misses — assuming end of hymnal at ~#${id}`)
      break
    }
    await sleep(DELAY_MS)
  }

  const out = {
    hymnal: {
      slug: "pcn",
      title: "Presbyterian Church of Nigeria Hymn Book",
      language: "en",
      license: "public-domain",
    },
    _note: `Scraped from pcnnewhavenenugu.org on ${new Date().toISOString().slice(0, 10)}. Draft — proofread before trusting (source has occasional typos).`,
    hymns,
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`✓ Wrote ${hymns.length} hymns to ${OUT}`)
  console.log(`  Next: bun run data/build-hymns.ts ${OUT}`)
}

main()
