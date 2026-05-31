import { invoke } from "@tauri-apps/api/core"
import { useHymnStore } from "@/stores"
import type { LinesPerSlide } from "@/stores/hymn-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import type { Hymn, HymnDetail, HymnMatch, Hymnal, HymnStanza, VerseRenderData } from "@/types"

// Stable action functions using getState() — same pattern as bibleActions.

async function loadHymnals() {
  const hymnals = await invoke<Hymnal[]>("list_hymnals")
  useHymnStore.getState().setHymnals(hymnals)
  return hymnals
}

async function loadHymns(hymnalSlug?: string, limit = 2000) {
  const hymns = await invoke<Hymn[]>("list_hymns", { hymnalSlug: hymnalSlug ?? null, limit })
  useHymnStore.getState().setHymns(hymns)
  return hymns
}

async function getHymn(hymnId: number) {
  const detail = await invoke<HymnDetail | null>("get_hymn", { hymnId })
  if (detail) useHymnStore.getState().setSelected(detail)
  return detail
}

async function getHymnByNumber(hymnalSlug: string, number: number) {
  const detail = await invoke<HymnDetail | null>("get_hymn_by_number", { hymnalSlug, number })
  if (detail) useHymnStore.getState().setSelected(detail)
  return detail
}

async function searchHymns(query: string, limit = 30) {
  const results = await invoke<Hymn[]>("search_hymns", { query, limit })
  useHymnStore.getState().setSearchResults(results)
  return results
}

async function detectHymn(transcript: string, limit = 5) {
  return invoke<HymnMatch[]>("detect_hymn", { transcript, limit })
}

/** A single projectable unit (whole stanza, or an N-line chunk of one). */
export interface HymnSlide {
  reference: string
  text: string
}

/** Human-readable reference label for a hymn stanza. */
export function hymnReference(hymn: Pick<Hymn, "number" | "title">, stanza?: HymnStanza): string {
  const base = hymn.number != null ? `Hymn ${hymn.number}` : hymn.title
  if (!stanza) return base
  const label =
    stanza.kind === "verse" ? `Verse ${stanza.label ?? stanza.position}` : stanza.label ?? stanza.kind
  return `${base} · ${label}`
}

/**
 * Flatten a hymn into projectable slides. With `"stanza"` each stanza is one
 * slide; with a number, each stanza is split into chunks of that many lines
 * (chunks never cross stanza boundaries). When a stanza spans multiple slides
 * the reference gains a page marker (e.g. "Verse 2 (2/3)").
 */
export function buildSlides(hymn: Hymn, stanzas: HymnStanza[], linesPerSlide: LinesPerSlide): HymnSlide[] {
  const slides: HymnSlide[] = []
  for (const stanza of stanzas) {
    const ref = hymnReference(hymn, stanza)
    if (linesPerSlide === "stanza") {
      slides.push({ reference: ref, text: stanza.text })
      continue
    }
    const lines = stanza.text.split("\n")
    const pages = Math.ceil(lines.length / linesPerSlide)
    for (let p = 0; p < pages; p++) {
      const chunk = lines.slice(p * linesPerSlide, (p + 1) * linesPerSlide).join("\n")
      slides.push({
        reference: pages > 1 ? `${ref} (${p + 1}/${pages})` : ref,
        text: chunk,
      })
    }
  }
  return slides
}

function slideToRenderData(slide: HymnSlide): VerseRenderData {
  return { reference: slide.reference, segments: [{ text: slide.text }] }
}

/** Push a projectable slide to the live broadcast/NDI output using the active theme. */
function goLiveSlide(slide: HymnSlide) {
  const bs = useBroadcastStore.getState()
  bs.setLiveVerse(slideToRenderData(slide))
  bs.setLive(true)
}

export const hymnActions = {
  loadHymnals,
  loadHymns,
  getHymn,
  getHymnByNumber,
  searchHymns,
  detectHymn,
  goLiveSlide,
  buildSlides,
  hymnReference,
}

export function useHymns() {
  const hymnals = useHymnStore((s) => s.hymnals)
  const hymns = useHymnStore((s) => s.hymns)
  const searchResults = useHymnStore((s) => s.searchResults)
  const query = useHymnStore((s) => s.query)
  const selected = useHymnStore((s) => s.selected)
  const slideIndex = useHymnStore((s) => s.slideIndex)
  const linesPerSlide = useHymnStore((s) => s.linesPerSlide)
  const detections = useHymnStore((s) => s.detections)
  const autoDisplay = useHymnStore((s) => s.autoDisplay)

  return {
    hymnals,
    hymns,
    searchResults,
    query,
    selected,
    slideIndex,
    linesPerSlide,
    detections,
    autoDisplay,
    setQuery: useHymnStore((s) => s.setQuery),
    setSelected: useHymnStore((s) => s.setSelected),
    setSlideIndex: useHymnStore((s) => s.setSlideIndex),
    setLinesPerSlide: useHymnStore((s) => s.setLinesPerSlide),
    setAutoDisplay: useHymnStore((s) => s.setAutoDisplay),
    ...hymnActions,
  }
}
