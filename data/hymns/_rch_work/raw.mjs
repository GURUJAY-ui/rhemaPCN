import { readFileSync } from 'node:fs'
const xml = readFileSync('word/document.xml','utf-8')
const paras = xml.split(/<\/w:p>/)
// find first few paragraphs whose stripped text starts with RCH
let count=0
for(const p of paras){
  const t=p.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim()
  if(/^RCH\s*\d/i.test(t)){
    console.log('===== PARA stripped:',JSON.stringify(t.slice(0,40)))
    // show the inner run/text structure compactly
    const inner = p.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g,'<RPR/>').replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g,'<PPR/>')
    // show only tag skeleton with text
    const skel = inner.match(/<w:t[^>]*>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>/g)
    console.log('  runs:', JSON.stringify(skel))
    if(++count>=5) break
  }
}
