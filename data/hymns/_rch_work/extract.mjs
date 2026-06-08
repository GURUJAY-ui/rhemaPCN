import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
const paras = xml.split(/<w:p[ >]/).slice(1)
const out = []
for (const p of paras) {
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m=>m[1])
  let t = texts.join('')
  t = t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')
  const styleM = p.match(/<w:pStyle w:val="([^"]+)"/)
  const style = styleM ? styleM[1] : ''
  out.push({style, t})
}
console.log('TOTAL PARAS:', out.length)
let shown=0
for (const o of out) {
  if (o.t.trim()==='' ) continue
  console.log((o.style||'-').padEnd(14), '|', JSON.stringify(o.t).slice(0,100))
  if (++shown>=70) break
}
