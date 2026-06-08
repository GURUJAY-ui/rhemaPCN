import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
const paras = xml.split(/<\/w:p>/)
function clean(p){
  let t = p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'')
  t=t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')
  return t
}
const lines=paras.map(clean)
// lines whose trimmed start is Chorus or Refrain
const ch=[]; lines.forEach((l,i)=>{ if(/^\s*(chorus|refrain)\b/i.test(l.trim())) ch.push(i) })
console.log('standalone chorus/refrain blocks:', ch.length)
const i=ch[0]
console.log('--- around first real chorus para',i,'---')
for(let k=i-6;k<i+8;k++) console.log(k, JSON.stringify(lines[k]))
