import { create } from "zustand"
import type { Hymn, HymnDetail, HymnMatch, Hymnal } from "@/types"

/** How many lyric lines to show per projected slide. "stanza" = whole stanza. */
export type LinesPerSlide = "stanza" | 2 | 4 | 6

interface HymnState {
  hymnals: Hymnal[]
  hymns: Hymn[]
  searchResults: Hymn[]
  query: string

  selected: HymnDetail | null
  /** Index into the derived slide list (see buildSlides). */
  slideIndex: number
  linesPerSlide: LinesPerSlide

  /** Live detection candidates from the choir's singing (ranked). */
  detections: HymnMatch[]
  /** Auto-display the top detection on the live output when confident. */
  autoDisplay: boolean

  setHymnals: (h: Hymnal[]) => void
  setHymns: (h: Hymn[]) => void
  setSearchResults: (h: Hymn[]) => void
  setQuery: (q: string) => void
  setSelected: (h: HymnDetail | null) => void
  setSlideIndex: (i: number) => void
  setLinesPerSlide: (n: LinesPerSlide) => void
  setDetections: (d: HymnMatch[]) => void
  setAutoDisplay: (v: boolean) => void
}

export const useHymnStore = create<HymnState>((set) => ({
  hymnals: [],
  hymns: [],
  searchResults: [],
  query: "",
  selected: null,
  slideIndex: 0,
  linesPerSlide: "stanza",
  detections: [],
  autoDisplay: false,

  setHymnals: (hymnals) => set({ hymnals }),
  setHymns: (hymns) => set({ hymns }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setQuery: (query) => set({ query }),
  setSelected: (selected) => set({ selected, slideIndex: 0 }),
  setSlideIndex: (slideIndex) => set({ slideIndex }),
  setLinesPerSlide: (linesPerSlide) => set({ linesPerSlide, slideIndex: 0 }),
  setDetections: (detections) => set({ detections }),
  setAutoDisplay: (autoDisplay) => set({ autoDisplay }),
}))
