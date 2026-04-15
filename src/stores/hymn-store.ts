import { create } from "zustand"
import type { Hymn } from "@/types"

interface HymnState {
  hymns: Hymn[]
  detectedHymn: Hymn | null
  setHymns: (hymns: Hymn[]) => void
  setDetectedHymn: (detectedHymn: Hymn | null) => void
  clearHymns: () => void
}

export const useHymnStore = create<HymnState>((set) => ({
  hymns: [],
  detectedHymn: null,
  setHymns: (hymns) => set({ hymns }),
  setDetectedHymn: (detectedHymn) => set({ detectedHymn }),
  clearHymns: () => set({ hymns: [], detectedHymn: null }),
}))
