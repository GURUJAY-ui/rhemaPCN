import { create } from "zustand"
import type { Hymn, HymnDetail, HymnMatch, Hymnal } from "@/types"

interface HymnState {
  hymnals: Hymnal[]
  hymns: Hymn[]
  searchResults: Hymn[]
  query: string

  selected: HymnDetail | null
  stanzaIndex: number

  /** Live detection candidates from the choir's singing (ranked). */
  detections: HymnMatch[]
  /** Auto-display the top detection on the live output when confident. */
  autoDisplay: boolean

  setHymnals: (h: Hymnal[]) => void
  setHymns: (h: Hymn[]) => void
  setSearchResults: (h: Hymn[]) => void
  setQuery: (q: string) => void
  setSelected: (h: HymnDetail | null) => void
  setStanzaIndex: (i: number) => void
  nextStanza: () => void
  prevStanza: () => void
  setDetections: (d: HymnMatch[]) => void
  setAutoDisplay: (v: boolean) => void
}

export const useHymnStore = create<HymnState>((set, get) => ({
  hymnals: [],
  hymns: [],
  searchResults: [],
  query: "",
  selected: null,
  stanzaIndex: 0,
  detections: [],
  autoDisplay: false,

  setHymnals: (hymnals) => set({ hymnals }),
  setHymns: (hymns) => set({ hymns }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setQuery: (query) => set({ query }),
  setSelected: (selected) => set({ selected, stanzaIndex: 0 }),
  setStanzaIndex: (stanzaIndex) => set({ stanzaIndex }),
  nextStanza: () => {
    const { selected, stanzaIndex } = get()
    if (!selected) return
    set({ stanzaIndex: Math.min(stanzaIndex + 1, selected.stanzas.length - 1) })
  },
  prevStanza: () => {
    const { stanzaIndex } = get()
    set({ stanzaIndex: Math.max(stanzaIndex - 1, 0) })
  },
  setDetections: (detections) => set({ detections }),
  setAutoDisplay: (autoDisplay) => set({ autoDisplay }),
}))
