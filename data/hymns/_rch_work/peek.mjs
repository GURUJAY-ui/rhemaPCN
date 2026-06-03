import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
const paras = xml.split(/<\/w:p>/)
function clean(p){
  let t = p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'')
  t = t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')
  return t
}
const lines = paras.map(clean)
// find first line containing 'Chorus' or 'Refrain'
let idx = lines.findIndex(l=>/chorus|refrain/i.test(l))
console.log('first chorus at para',idx)
for(let k=idx-12;k<idx+8;k++) console.log(k, JSON.stringify(lines[k]))
