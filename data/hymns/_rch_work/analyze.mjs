import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
const paras = xml.split(/<w:p[ >]/).slice(1)
const lines = []
for (const p of paras) {
  // take everything up to the paragraph properties end? Just strip all tags.
  let t = p.replace(/<[^>]+>/g,'')
  t = t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')
  lines.push(t.replace(/\s+/g,' ').trim())
}
// hymn markers
const markerRe = /^RCH\s+(\d+)\b/i
const markers = []
lines.forEach((l,i)=>{ const m=l.match(markerRe); if(m) markers.push({n:+m[1], i, l}) })
console.log('hymn markers found:', markers.length)
console.log('first numbers:', markers.slice(0,10).map(m=>m.n).join(','))
console.log('last numbers:', markers.slice(-10).map(m=>m.n).join(','))
// gaps / non-sequential
let prev=0, gaps=[]
for(const m of markers){ if(m.n!==prev+1) gaps.push(`${prev}->${m.n}`); prev=m.n }
console.log('sequence anomalies:', gaps.slice(0,30).join('  '))
// chorus/refrain markers
const chorus = lines.filter(l=>/^(chorus|refrain)\b/i.test(l)).length
console.log('chorus/refrain lines:', chorus)
// how the marker line looks - any title after RCH N?
console.log('--- sample marker lines ---')
markers.slice(0,15).forEach(m=>console.log(JSON.stringify(m.l).slice(0,80)))
console.log('--- tail of doc (last 15 nonempty) ---')
lines.filter(l=>l).slice(-15).forEach(l=>console.log(JSON.stringify(l).slice(0,80)))
