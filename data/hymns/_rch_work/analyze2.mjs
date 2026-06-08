import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
const paras = xml.split(/<\/w:p>/)
function clean(p){
  // keep only inside <w:t> tags to be safe, but also handle malformed: strip all tags then decode
  let t = p.replace(/<[^>]*>/g,'')
  t = t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')
  return t.replace(/[ \t]+/g,' ').trim()
}
const lines = paras.map(clean)
const markerRe = /^RCH\s*[-–]?\s*(\d+)\b/i
const markers=[]
lines.forEach((l,i)=>{const m=l.match(markerRe); if(m) markers.push({n:+m[1],i,l})})
console.log('markers:',markers.length,'| first:',markers.slice(0,8).map(m=>m.n).join(','),'| last:',markers.slice(-8).map(m=>m.n).join(','))
let prev=0,gaps=[]
for(const m of markers){if(m.n!==prev+1)gaps.push(`${prev}->${m.n}`);prev=m.n}
console.log('anomalies('+gaps.length+'):',gaps.slice(0,40).join(' '))
console.log('chorus/refrain:',lines.filter(l=>/^(chorus|refrain)/i.test(l)).length)
console.log('--- sample markers ---')
markers.slice(0,12).forEach(m=>console.log(m.n,'::',JSON.stringify(m.l).slice(0,70)))
