import { readFileSync } from 'node:fs'
const xml=readFileSync('word/document.xml','utf-8')
function clean(p){let t=p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'');return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')}
const paras=xml.split(/<\/w:p>/).map(clean)
for(let k=18240;k<=18307;k++){ if(paras[k].trim()) console.log(k,JSON.stringify(paras[k]).slice(0,62)) }
