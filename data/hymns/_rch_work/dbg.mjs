import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
function clean(p){let t=p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'');return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')}
const paras=xml.split(/<\/w:p>/).map(clean)
// count paragraphs that, after stripping leading tabs, start with chorus/refrain
const CH=/^(chorus|refrain)\b/i
let c=0; const ex=[]
paras.forEach((p,i)=>{const n=p.replace(/^\t+/,''); if(CH.test(n)){c++; if(ex.length<8)ex.push([i,JSON.stringify(p).slice(0,50)])}})
console.log('paras starting chorus/refrain (after tab strip):',c)
ex.forEach(e=>console.log(' ',e[0],e[1]))
// also count where chorus/refrain appears at start WITH leading text? maybe it's mid-line e.g 'CHORUS:' or inside \n
let inl=0
paras.forEach(p=>{ if(/\n\s*(chorus|refrain)\b/i.test(p)) inl++ })
console.log('paras with chorus/refrain after an internal newline:',inl)
// 214 and 624 markers
;[213,214,215,623,624,625].forEach(N=>{
  const idx=paras.findIndex(p=>new RegExp('^\s*RCH\s+'+N+'\b').test(p))
  console.log(`marker RCH ${N}: paraIdx=${idx}`, idx>=0?JSON.stringify(paras[idx]).slice(0,50):'')
})
// look around where 214 should be: find 213 marker then show next paras
const i213=paras.findIndex(p=>/^\s*RCH\s+213\b/.test(p))
console.log('--- around RCH 213 (idx',i213,') ---')
for(let k=i213;k<i213+30;k++){ if(paras[k].trim()) console.log(k,JSON.stringify(paras[k]).slice(0,60)) }
