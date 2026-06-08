// Parse RCH PLUS docx -> hymns JSON for build-hymns.ts
import { readFileSync, writeFileSync } from 'node:fs'

const xml = readFileSync('word/document.xml', 'utf-8')

// Each paragraph -> one "line". Internal <w:br/> stays as \n. Tabs preserved.
function cleanPara(p) {
  let t = p
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]*>/g, '')
  t = t
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
  return t
}
const paras = xml.split(/<\/w:p>/).map(cleanPara)

// Two marker styles:
//   core:  "RCH 1\t10.10.10.10."  (no title; meter after the number)
//   plus:  "RCH+ 714  AMAZING GRACE  [THWC 202]"  (titled song w/ source ref)
// Tolerate source typos: "RCH. 624" (period), "RCH+GSC 755" (stray letters).
const CORE = /^\s*RCH(?!\+)[.\t ]*(\d+)([ \t]*)(.*)$/i
const PLUS = /^\s*RCH\+\s*[A-Za-z]*\s*(\d+)[ \t]+(.*)$/i
const VERSE = /^(\d+)\.[\t ]?/
const CHORUS = /^(chorus|refrain)\b/i

// Normalize a block of text: split on \n, trim each line, drop empties, rejoin.
function normText(s) {
  return s
    .split('\n')
    .map((l) => l.replace(/\t/g, ' ').replace(/[ ]+/g, ' ').trim())
    .filter((l) => l !== '')
    .join('\n')
    .trim()
}

// A trailing attribution line carries a year (e.g. "Reginald Heber 1783-1826.",
// "Samuel Longfellow, 1819-92.", "St. Francis of Assisi, 1182-1226,"). We detect
// it on the LAST line of a hymn rather than by indentation, because in the PLUS
// section chorus/continuation lines are also tab-indented.
const AUTHOR_RE = /\b\d{3,4}\s*[-–]?\s*\d{0,4}\.?\s*$/
function looksLikeAuthor(line) {
  // has a 3-4 digit year-ish number near the end, and isn't a long lyric line
  return AUTHOR_RE.test(line) && line.length <= 60 && /[A-Za-z]/.test(line)
}

// Split a PLUS marker's "title  REF" tail into a clean title + source note.
// Source refs are codes from other hymnals: THWC, BH, SS&S, MP, TPH, etc.
function splitTitleSource(raw) {
  let t = raw.replace(/\t/g, ' ').replace(/[ ]+/g, ' ').trim()
  const refs = []
  t = t.replace(/\[([^\]]*)\]/g, (_, x) => { refs.push(x.trim()); return '' }).trim()
  // unclosed bracket, e.g. "BLESSED QUIETNESS [BH 278"
  t = t.replace(/\s*\[([^\]]*)$/, (_, x) => { refs.push(x.trim()); return '' }).trim()
  const REF = /[\s,]+(?:THWC|BH|SS\s*&\s*S|SSS|SS|MP|TPH|SCS|GHS|GH|HHH|HMH|RED|STF|GSC|RCH|ANON)\.?\s*\d*\s*$/i
  while (REF.test(t)) { const m = t.match(REF); refs.unshift(m[0].trim()); t = t.slice(0, m.index).trim() }
  t = t.replace(/[ ]+/g, ' ').replace(/[\s,]+$/, '').trim()
  return { title: t || null, source: refs.length ? `RCH PLUS [${refs.join('; ')}]` : 'RCH PLUS' }
}

// Find marker paragraph indices (either style).
const markerIdx = []
paras.forEach((p, i) => { if (PLUS.test(p) || CORE.test(p)) markerIdx.push(i) })

const hymns = []
let prevNum = 0
const parseFailures = []

for (let mi = 0; mi < markerIdx.length; mi++) {
  const start = markerIdx[mi]
  const end = mi + 1 < markerIdx.length ? markerIdx[mi + 1] : paras.length

  let number, meter = null, givenTitle = null, source = 'RCH'
  const pm = paras[start].match(PLUS)
  if (pm) {
    // PLUS song: number + title (+ optional bracketed/tab source ref)
    number = +pm[1]
    const ts = splitTitleSource(pm[2])
    givenTitle = ts.title
    source = ts.source
  } else {
    const m = paras[start].match(CORE)
    const digits = m[1]
    const hadWs = m[2].length > 0
    const rest = m[3]
    const exp = String(prevNum + 1)
    if (hadWs) {
      number = +digits
      meter = rest
    } else if (digits.startsWith(exp) && digits !== exp) {
      number = prevNum + 1
      meter = digits.slice(exp.length) + rest
    } else {
      number = +digits
      meter = rest
    }
    meter = meter.replace(/\t/g, ' ').replace(/[ ]+/g, ' ').trim().replace(/^[.\s]+/, '')
    if (meter === '') meter = null
  }
  prevNum = number

  // Walk the body paragraphs, grouping into stanzas.
  const stanzas = []
  let author = null
  let cur = null // {kind,label,parts:[]}
  const flush = () => {
    if (cur) {
      const text = normText(cur.parts.join('\n'))
      if (text) stanzas.push({ kind: cur.kind, label: cur.label, text })
      cur = null
    }
  }

  for (let i = start + 1; i < end; i++) {
    const raw = paras[i]
    if (raw.trim() === '') continue
    const noTab = raw.replace(/^\t+/, '')

    const vm = noTab.match(VERSE)
    const cm = noTab.match(CHORUS)
    if (vm) {
      flush()
      cur = { kind: 'verse', label: vm[1], parts: [noTab.replace(VERSE, '')] }
    } else if (cm) {
      flush()
      const kind = cm[1].toLowerCase() === 'refrain' ? 'refrain' : 'chorus'
      const label = cm[1][0].toUpperCase() + cm[1].slice(1).toLowerCase()
      const after = noTab.replace(CHORUS, '').replace(/^[\s:.\-]+/, '')
      cur = { kind, label, parts: after ? [after] : [] }
    } else {
      if (!cur) cur = { kind: 'verse', label: '1', parts: [] } // unnumbered verse 1
      cur.parts.push(noTab)
    }
  }
  flush()

  // Pull a trailing attribution line off the last stanza into `author`.
  if (stanzas.length) {
    const last = stanzas[stanzas.length - 1]
    const lines = last.text.split('\n')
    if (lines.length >= 1 && looksLikeAuthor(lines[lines.length - 1])) {
      author = lines.pop().trim()
      if (lines.length) last.text = lines.join('\n')
      else stanzas.pop() // the stanza was nothing but the attribution
    }
  }

  const firstLine = stanzas.length ? stanzas[0].text.split('\n')[0] : null
  const title = givenTitle || firstLine || `RCH ${number}`
  if (stanzas.length === 0) parseFailures.push(number)

  hymns.push({ number, title, author, meter, source, stanzas })
}

// ---- resolve number typos & collisions (faithful, deterministic) ----
// Reserve every plausible (<=2000) printed number so we never steal a real one.
const valid = hymns.map((h) => h.number).filter((n) => n >= 1 && n <= 2000)
const reserved = new Set(valid)
const assigned = new Set()
let nextFree = Math.max(...valid) + 1
let prevAssigned = 0
const renumbered = []
for (const h of hymns) {
  let n = h.number
  if (n > 2000 || assigned.has(n)) {
    const orig = n
    const gap = prevAssigned + 1 // typo case: prefer the natural sequence gap
    if (n > 2000 && !reserved.has(gap) && !assigned.has(gap)) {
      n = gap
    } else {
      while (reserved.has(nextFree) || assigned.has(nextFree)) nextFree++
      n = nextFree
    }
    renumbered.push(`${orig} -> ${n} (${h.title})`)
  }
  h.number = n
  assigned.add(n)
  prevAssigned = n
}
hymns.sort((a, b) => a.number - b.number)
if (renumbered.length) console.log('renumbered:', renumbered.join(' | '))

// ---- validation report ----
const nums = hymns.map((h) => h.number)
const max = Math.max(...nums)
const missing = []
for (let n = 1; n <= max; n++) if (!nums.includes(n)) missing.push(n)
const dups = nums.filter((n, i) => nums.indexOf(n) !== i)

console.log('hymns parsed     :', hymns.length)
console.log('max number       :', max)
console.log('missing numbers  :', missing.length ? missing.join(',') : 'none')
console.log('duplicate numbers:', dups.length ? dups.join(',') : 'none')
console.log('empty stanzas    :', parseFailures.length ? parseFailures.join(',') : 'none')
console.log('with chorus/refr :', hymns.filter((h) => h.stanzas.some((s) => s.kind !== 'verse')).length)
console.log('with author      :', hymns.filter((h) => h.author).length)
const avgStanzas = (hymns.reduce((a, h) => a + h.stanzas.length, 0) / hymns.length).toFixed(1)
console.log('avg stanzas/hymn :', avgStanzas)
console.log('single-stanza    :', hymns.filter((h) => h.stanzas.length === 1).length)

const out = {
  // Replace the existing in-app hymnal (slug 'pcn') with the authoritative RCH
  // text from the docx. The PCN's hymn book is the Revised Church Hymnary.
  hymnal: {
    slug: 'pcn',
    title: 'Presbyterian Church of Nigeria Hymn Book (RCH)',
    language: 'en',
    license: 'public-domain',
  },
  hymns,
}
writeFileSync('../rch-hymns.json', JSON.stringify(out, null, 2))
console.log('\nwrote ../rch-hymns.json')

// dump a few samples for eyeballing
console.log('\n===== SAMPLES =====')
for (const n of [1, 13, 255]) {
  const h = hymns.find((x) => x.number === n)
  if (!h) continue
  console.log(`\n--- RCH ${h.number} | title="${h.title}" | meter=${h.meter} | author=${h.author}`)
  h.stanzas.forEach((s) => console.log(`  [${s.kind} ${s.label}] ${JSON.stringify(s.text).slice(0, 70)}`))
}
