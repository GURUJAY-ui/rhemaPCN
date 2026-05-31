export interface Hymnal {
  id: number
  slug: string
  title: string
  language: string
}

export interface Hymn {
  id: number
  hymnal_id: number
  hymnal_slug: string
  hymnal_title: string
  number: number | null
  title: string
  author: string | null
  category: string | null
  themes: string | null
  scriptures: string | null
  source: string | null
}

export interface HymnStanza {
  id: number
  position: number
  kind: string
  label: string | null
  text: string
}

/** A hymn plus its ordered stanzas (Hymn fields are flattened in). */
export interface HymnDetail extends Hymn {
  stanzas: HymnStanza[]
}

/** A hymn matched from search/detection, with BM25 rank + 0..1 confidence. */
export interface HymnMatch extends Hymn {
  rank: number
  confidence: number
}
