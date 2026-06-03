import { readFileSync } from 'node:fs'
const xml=readFileSync('word/document.xml','utf-8')
function clean(p){let t=p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'');return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')}
const paras=xml.split(/<\/w:p>/).map(clean)
const CORE=/^\s*RCH(?!\+)[ \t]*(\d+)([ \t]*)(.*)$/i
const PLUS=/^\s*RCH\+[ \t]*(\d+)[ \t]+(.*)$/i
const mk=[]
paras.forEach((p,i)=>{const pm=p.match(PLUS),cm=p.match(CORE); if(pm)mk.push({i,t:'P',n:+pm[1],raw:p}); else if(cm)mk.push({i,t:'C',n:+cm[1],raw:p})})
console.log('total markers:',mk.length)
// show transition around 713/714 and any number jumps >50
let prev=0
for(const m of mk){
  if(Math.abs(m.n-prev)>30 || m.n>720){
    console.log(m.t,m.n,'@',m.i,JSON.stringify(m.raw).slice(0,60))
  }
  prev=m.n
}
console.log('--- all PLUS markers (first 40) ---')
mk.filter(m=>m.t==='P').slice(0,40).forEach(m=>console.log('P',m.n,JSON.stringify(m.raw).slice(0,55)))
