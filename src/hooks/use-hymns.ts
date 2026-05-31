import { invoke } from "@tauri-apps/api/core"
import { useHymnStore } from "@/stores"
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

/** Human-readable reference label for a hymn stanza. */
export function hymnReference(hymn: Pick<Hymn, "number" | "title">, stanza?: HymnStanza): string {
  const base = hymn.number != null ? `Hymn ${hymn.number}` : hymn.title
  if (!stanza) return base
  const label =
    stanza.kind === "verse" ? `Verse ${stanza.label ?? stanza.position}` : stanza.label ?? stanza.kind
  return `${base} · ${label}`
}

/** Map a hymn stanza onto the broadcast renderer's VerseRenderData. */
function stanzaToRenderData(hymn: Hymn | HymnDetail, stanza: HymnStanza): VerseRenderData {
  return {
    reference: hymnReference(hymn, stanza),
    segments: [{ text: stanza.text }],
  }
}

/** Push a hymn stanza to the live broadcast/NDI output using the active theme. */
function goLiveWithStanza(hymn: Hymn | HymnDetail, stanza: HymnStanza) {
  const bs = useBroadcastStore.getState()
  bs.setLiveVerse(stanzaToRenderData(hymn, stanza))
  bs.setLive(true)
}

export const hymnActions = {
  loadHymnals,
  loadHymns,
  getHymn,
  getHymnByNumber,
  searchHymns,
  detectHymn,
  goLiveWithStanza,
  hymnReference,
}

export function useHymns() {
  const hymnals = useHymnStore((s) => s.hymnals)
  const hymns = useHymnStore((s) => s.hymns)
  const searchResults = useHymnStore((s) => s.searchResults)
  const query = useHymnStore((s) => s.query)
  const selected = useHymnStore((s) => s.selected)
  const stanzaIndex = useHymnStore((s) => s.stanzaIndex)
  const detections = useHymnStore((s) => s.detections)
  const autoDisplay = useHymnStore((s) => s.autoDisplay)

  return {
    hymnals,
    hymns,
    searchResults,
    query,
    selected,
    stanzaIndex,
    detections,
    autoDisplay,
    setQuery: useHymnStore((s) => s.setQuery),
    setSelected: useHymnStore((s) => s.setSelected),
    setStanzaIndex: useHymnStore((s) => s.setStanzaIndex),
    nextStanza: useHymnStore((s) => s.nextStanza),
    prevStanza: useHymnStore((s) => s.prevStanza),
    setAutoDisplay: useHymnStore((s) => s.setAutoDisplay),
    ...hymnActions,
  }
}
