import { readFileSync } from 'node:fs'
const xml=readFileSync('word/document.xml','utf-8')
function clean(p){let t=p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'');return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')}
const paras=xml.split(/<\/w:p>/).map(clean)
function findMarkerNear(test){ for(let i=0;i<paras.length;i++) if(test(paras[i])) return i; return -1 }
// where is 624? search any 'RCH' line with 624 or 625 boundary - find end of 623 block
let i=paras.findIndex(p=>/^\s*RCH(?!\+)[ \t]*623\b/.test(p))
// next core marker after 623
let j=-1; for(let k=i+1;k<paras.length;k++){ if(/^\s*RCH/.test(paras[k])){j=k;break} }
console.log('623 at',i,'next marker at',j,':',JSON.stringify(paras[j]).slice(0,55))
console.log('  paras',i,'->',j,'tail:')
for(let k=j-4;k<=j+1;k++) if(paras[k].trim()) console.log('   ',k,JSON.stringify(paras[k]).slice(0,55))
// 755: find 754 and 756 PLUS
let p754=paras.findIndex(p=>/^\s*RCH\+[ \t]*754\b/.test(p))
let p756=paras.findIndex(p=>/^\s*RCH\+[ \t]*756\b/.test(p))
console.log('\n754 at',p754,' 756 at',p756)
for(let k=p756-6;k<=p756;k++) if(paras[k].trim()) console.log('   ',k,JSON.stringify(paras[k]).slice(0,55))
// duplicate 860
const d=[]; paras.forEach((p,k)=>{ if(/^\s*RCH\+[ \t]*860\b/.test(p)) d.push(k) })
console.log('\n860 markers at:',d)
d.forEach(k=>console.log('   ',k,JSON.stringify(paras[k]).slice(0,55)))
