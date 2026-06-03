import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
const paras = xml.split(/<\/w:p>/)
function clean(p){
  let t = p.replace(/<w:tab\/>/g,'\t').replace(/<[^>]*>/g,'')
  t = t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')
  return t.replace(/ /g,' ')
}
const lines = paras.map(clean)
const markerRe = /^\s*RCH\s+(\d+)(?:\t|\s)/i
const markers=[]
lines.forEach((l,i)=>{const m=l.match(markerRe); if(m) markers.push({n:+m[1],i,meter:l.replace(/^\s*RCH\s+\d+\s*\t?/i,'').trim()})})
console.log('markers:',markers.length)
let prev=0,gaps=[]
for(const m of markers){if(m.n!==prev+1)gaps.push(`${prev}->${m.n}`);prev=m.n}
console.log('anomalies('+gaps.length+'):',gaps.slice(0,30).join(' '))
console.log('max number:',Math.max(...markers.map(m=>m.n)))
console.log('--- sample meters ---')
markers.slice(0,8).forEach(m=>console.log('RCH',m.n,'meter=',JSON.stringify(m.meter)))
// what comes right after a marker (to see if title or verse-1)
console.log('--- lines after marker RCH 1 ---')
const i1=markers[0].i
for(let k=i1;k<i1+7;k++) console.log(k, JSON.stringify(lines[k].slice(0,60)))
