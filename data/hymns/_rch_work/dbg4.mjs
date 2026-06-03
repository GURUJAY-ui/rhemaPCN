import { readFileSync } from 'node:fs'
const xml=readFileSync('word/document.xml','utf-8')
function clean(p){let t=p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'');return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')}
const paras=xml.split(/<\/w:p>/).map(clean)
const CORE=/^\s*RCH(?!\+)[ \t]*(\d+)([ \t]*)(.*)$/i
const PLUS=/^\s*RCH\+[ \t]*(\d+)[ \t]+(.*)$/i
const mk=[]
paras.forEach((p,i)=>{const pm=p.match(PLUS),cm=p.match(CORE); if(pm)mk.push({i,t:'P',n:+pm[1],raw:p}); else if(cm)mk.push({i,t:'C',n:+cm[1],raw:p})})
const plus=mk.filter(m=>m.t==='P')
console.log('core markers:',mk.filter(m=>m.t==='C').length,' plus markers:',plus.length)
console.log('plus range:',plus[0].n,'..',plus[plus.length-1].n)
// sequence anomalies among PLUS (excluding the 7567 typo)
let prev=plus[0].n-1, an=[]
for(const m of plus){ if(m.n!==prev+1) an.push(`${prev}->${m.n}`); prev=m.n }
console.log('PLUS anomalies:',an.join('  '))
// tail
console.log('--- last 6 PLUS ---'); plus.slice(-6).forEach(m=>console.log('P',m.n,JSON.stringify(m.raw).slice(0,50)))
// 624 context (core)
const i=paras.findIndex(p=>/^\s*RCH(?!\+)[ \t]*623\b/.test(p))
console.log('--- around core 623 ---'); for(let k=i;k<i+18;k++){if(paras[k].trim())console.log(k,JSON.stringify(paras[k]).slice(0,55))}
