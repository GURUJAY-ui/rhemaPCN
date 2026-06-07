import { useEffect, useRef } from "react"
import { useTranscriptStore, useHymnStore } from "@/stores"
import { useSettingsStore } from "@/stores/settings-store"
import { hymnActions, hymnReference, type HymnSlide } from "@/hooks/use-hymns"
import {
  bestIndex,
  nextIndex,
  flattenLines,
  recentLyricWindow,
  pollIntervalFor,
} from "@/lib/hymn-follow"
import type { HymnDetail } from "@/types"
import type { LinesPerSlide } from "@/stores/hymn-store"

// Tuning.
const MIN_WORDS = 3 // need at least this many recent words before matching
const SHOW_CONFIDENCE = 0.3 // weaker matches are dropped from the suggestion banner
const MISS_CLEARS = 2 // empty polls before the suggestion banner is cleared

/** Everything the follow loop needs about the hymn currently being projected. */
interface FollowCache {
  id: number
  slides: HymnSlide[]
  slideTexts: string[]
  lines: string[]
  reference: string
}

function buildCache(detail: HymnDetail, linesPerSlide: LinesPerSlide): FollowCache {
  const slides = hymnActions.buildSlides(detail, detail.stanzas, linesPerSlide)
  return {
    id: detail.id,
    slides,
    slideTexts: slides.map((s) => s.text),
    lines: flattenLines(detail.stanzas),
    reference: hymnReference(detail),
  }
}

/** The recent rolling lyric window from the live transcript. */
function recentWindow(): string {
  const { segments, currentPartial } = useTranscriptStore.getState()
  return recentLyricWindow(segments, currentPartial, Date.now())
}

/**
 * Drives live hymn projection from the *operator-selected* hymn (chosen via the
 * Hymns panel or by tapping a detection suggestion). When follow mode is on, the
 * live output tracks the singing **within that one hymn** — robust to noisy
 * speech-to-text because it matches one hymn's ~20 lines, not all 881 hymns.
 *
 * Blind detection from the transcript is kept only as a non-committal suggestion
 * (the detection banner) — it never auto-projects, so it cannot false-fire a
 * hymn during the sermon.
 *
 * Mount once (e.g. in App) so it runs for the whole session.
 */
export function useHymnDetection() {
  const followMode = useSettingsStore((s) => s.hymnFollowMode)
  const responsiveness = useSettingsStore((s) => s.hymnFollowResponsiveness)
  const selectedId = useHymnStore((s) => s.selected?.id ?? null)
  const linesPerSlide = useHymnStore((s) => s.linesPerSlide)

  const followRef = useRef<FollowCache | null>(null)
  const slideIdxRef = useRef(-1)
  const lineIdxRef = useRef(-1)
  const lastQueryRef = useRef("")
  const missCountRef = useRef(0)
  const runningRef = useRef(false)

  // Cue the selected hymn live as soon as follow mode is on (or the selection /
  // slide layout / mode changes). Starts from the best-matching slide/line for
  // whatever has been sung so far, then the poll loop keeps it tracking.
  useEffect(() => {
    if (followMode === "off") {
      followRef.current = null
      slideIdxRef.current = -1
      lineIdxRef.current = -1
      return
    }
    const selected = useHymnStore.getState().selected
    if (!selected) {
      followRef.current = null
      slideIdxRef.current = -1
      lineIdxRef.current = -1
      return
    }
    const cache = buildCache(selected, linesPerSlide)
    followRef.current = cache
    const transcript = recentWindow()
    if (followMode === "karaoke" && cache.lines.length > 0) {
      const idx = bestIndex(cache.lines, transcript)
      lineIdxRef.current = idx
      hymnActions.goLiveKaraoke(cache.reference, cache.lines, idx)
    } else if (cache.slides.length > 0) {
      const idx = bestIndex(cache.slideTexts, transcript)
      slideIdxRef.current = idx
      useHymnStore.getState().setSlideIndex(idx)
      hymnActions.goLiveSlide(cache.slides[idx])
    }
  }, [selectedId, followMode, linesPerSlide])

  // Poll the live transcript: refresh the (non-committal) suggestion banner and,
  // when a hymn is cued, follow the singing through it.
  useEffect(() => {
    const tick = async () => {
      if (runningRef.current) return
      if (!useTranscriptStore.getState().isTranscribing) return

      const transcript = recentWindow()
      if (transcript.split(/\s+/).length < MIN_WORDS) return
      if (transcript === lastQueryRef.current) return
      lastQueryRef.current = transcript

      runningRef.current = true
      try {
        // (1) Suggestions only — never auto-projects. detect_hymn is strict
        // (phrase/AND), so it stays quiet during ordinary speech.
        const candidates = (await hymnActions.detectHymn(transcript, 5)).filter(
          (m) => m.confidence >= SHOW_CONFIDENCE,
        )
        if (candidates.length > 0) {
          useHymnStore.getState().setDetections(candidates)
          missCountRef.current = 0
        } else if (++missCountRef.current >= MISS_CLEARS) {
          useHymnStore.getState().setDetections([])
        }

        // (2) Follow the cued hymn (1-of-N line match — robust to STT noise).
        if (followMode === "off") return
        const cache = followRef.current
        if (!cache) return

        if (followMode === "karaoke" && cache.lines.length > 0) {
          const next = nextIndex(cache.lines, transcript, lineIdxRef.current)
          if (next != null) {
            lineIdxRef.current = next
            hymnActions.goLiveKaraoke(cache.reference, cache.lines, next)
          }
        } else {
          const next = nextIndex(cache.slideTexts, transcript, slideIdxRef.current)
          if (next != null && cache.slides[next]) {
            slideIdxRef.current = next
            useHymnStore.getState().setSlideIndex(next)
            hymnActions.goLiveSlide(cache.slides[next])
          }
        }
      } catch (err) {
        console.warn("[hymn-detect]", err)
      } finally {
        runningRef.current = false
      }
    }

    const id = setInterval(() => void tick(), pollIntervalFor(responsiveness))
    return () => {
      clearInterval(id)
      runningRef.current = false
      lastQueryRef.current = ""
      missCountRef.current = 0
    }
  }, [followMode, responsiveness])
}
