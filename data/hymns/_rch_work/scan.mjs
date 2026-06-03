import { readFileSync } from 'node:fs'
const xml=readFileSync('word/document.xml','utf-8')
function clean(p){let t=p.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<[^>]*>/g,'');return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')}
const paras=xml.split(/<\/w:p>/).map(clean)
const CORE=/^\s*RCH(?!\+)[.\t ]*(\d+)([ \t]*)(.*)$/i
const PLUS=/^\s*RCH\+\s*[A-Za-z]*\s*(\d+)[ \t]+(.*)$/i
paras.forEach((p,i)=>{ const s=p.trim(); if(/^RCH/i.test(s) && !CORE.test(p) && !PLUS.test(p)) console.log(i,JSON.stringify(s).slice(0,60)) })
