import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import type { Hymn } from "@/types"
import { useHymnStore } from "@/stores/hymn-store"

const WORD_SPLIT_RE = /[\s,.!?;:"'“”‘’()\[\]—–]+/g

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
}

function textToWordSet(text: string) {
  return new Set(
    normalizeText(text)
      .split(WORD_SPLIT_RE)
      .filter((word) => word.length > 0),
  )
}

function hymnSearchText(hymn: Hymn) {
  return [
    hymn.titleWithHymnNumber,
    hymn.title,
    hymn.chorus ?? "",
    ...hymn.verses,
  ].join(" ")
}

function getHymnMatchScore(hymn: Hymn, transcriptWords: Set<string>) {
  const hymnWords = textToWordSet(hymnSearchText(hymn))
  if (hymnWords.size === 0 || transcriptWords.size === 0) {
    return 0
  }

  const sharedWords = [...hymnWords].filter((word) => transcriptWords.has(word)).length
  if (sharedWords < 5) {
    return 0
  }

  return sharedWords / transcriptWords.size
}

function findBestHymnMatch(transcript: string, hymns: Hymn[]) {
  const transcriptWords = textToWordSet(transcript)
  if (transcriptWords.size === 0) {
    return null
  }

  let bestHymn: Hymn | null = null
  let bestScore = 0

  for (const hymn of hymns) {
    const score = getHymnMatchScore(hymn, transcriptWords)
    if (score > bestScore) {
      bestScore = score
      bestHymn = hymn
    }
  }

  return bestScore >= 0.45 ? bestHymn : null
}

export function useHymns() {
  const hymns = useHymnStore((state) => state.hymns)
  const detectedHymn = useHymnStore((state) => state.detectedHymn)
  const setHymns = useHymnStore((state) => state.setHymns)
  const setDetectedHymn = useHymnStore((state) => state.setDetectedHymn)

  useEffect(() => {
    invoke<Hymn[]>("get_hymns")
      .then(setHymns)
      .catch(() => {
        // Ignore load failures for now; the transcript view still works.
      })
  }, [setHymns])

  useTauriEvent<{ text: string }>("transcript_final", (payload) => {
    const match = findBestHymnMatch(payload.text, useHymnStore.getState().hymns)
    setDetectedHymn(match)
  })

  return { hymns, detectedHymn }
}
