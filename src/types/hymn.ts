export interface Hymn {
  number: string
  title: string
  titleWithHymnNumber: string
  chorus?: string | null
  verses: string[]
  sound: string
  category?: string | null
}
