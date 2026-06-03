import { readFileSync } from 'node:fs'
const xml=readFileSync('word/document.xml','utf-8')
function clean(p){let t=p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'');return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')}
const paras=xml.split(/<\/w:p>/).map(clean)
console.log('total paras:',paras.length)
const M=/^\s*RCH\s*(\d+)\b/i
let last=-1,lastN=0
paras.forEach((p,i)=>{const m=p.match(M); if(m){last=i;lastN=+m[1]}})
console.log('last RCH marker: RCH',lastN,'at para',last)
console.log('--- paras after last marker ---')
let shown=0
for(let k=last;k<paras.length && shown<50;k++){ if(paras[k].trim()){console.log(k,JSON.stringify(paras[k]).slice(0,70));shown++} }
