import { useEffect, useRef } from "react"
import { useTranscriptStore, useHymnStore } from "@/stores"
import { useSettingsStore } from "@/stores/settings-store"
import { hymnActions, type HymnSlide } from "@/hooks/use-hymns"
import { bestIndex, nextIndex, pollIntervalFor } from "@/lib/hymn-follow"
import type { HymnMatch } from "@/types"

// Detection tuning.
const WINDOW_WORDS = 24 // size of the rolling lyric window fed to the matcher
const MIN_WORDS = 6 // need at least this many words before guessing
const SHOW_CONFIDENCE = 0.3 // weaker matches are dropped from the candidate list
const STABLE_POLLS = 2 // the same hymn must lead this many polls to count
const AUTO_DISPLAY_CONFIDENCE = 0.45 // top match must beat this to auto-show

/** Build a rolling window of the most recent transcript words. */
function recentTranscript(): string {
  const { segments, currentPartial } = useTranscriptStore.getState()
  const tail = segments.slice(-6).map((s) => s.text).join(" ")
  const text = `${tail} ${currentPartial}`.trim()
  const words = text.split(/\s+/)
  return words.slice(-WINDOW_WORDS).join(" ")
}

/**
 * Continuously detect which hymn the choir is singing and, while follow mode is
 * on, keep the live output tracking the singing: it loads the detected hymn,
 * projects the best-matching stanza, and re-projects as later stanzas/choruses
 * are sung — until the song ends (the last slide then stays on screen).
 *
 * Mount once (e.g. in App) so it runs for the whole session.
 */
export function useHymnDetection() {
  const followMode = useSettingsStore((s) => s.hymnFollowMode)
  const responsiveness = useSettingsStore((s) => s.hymnFollowResponsiveness)

  const lastQueryRef = useRef("")
  const leadingIdRef = useRef<number | null>(null) // hymn currently leading
  const stableCountRef = useRef(0) // consecutive polls it has led
  const missCountRef = useRef(0) // consecutive polls with no candidate
  const runningRef = useRef(false)
  // The hymn being followed + its built slides, and the last projected index.
  const followRef = useRef<{ id: number; slides: HymnSlide[] } | null>(null)
  const slideIdxRef = useRef(-1)

  useEffect(() => {
    const tick = async () => {
      if (runningRef.current) return
      const { isTranscribing } = useTranscriptStore.getState()
      if (!isTranscribing) return

      const transcript = recentTranscript()
      if (transcript.split(/\s+/).length < MIN_WORDS) return
      if (transcript === lastQueryRef.current) return
      lastQueryRef.current = transcript

      runningRef.current = true
      try {
        const matches = await hymnActions.detectHymn(transcript, 5)
        const candidates = matches.filter((m) => m.confidence >= SHOW_CONFIDENCE)
        const top: HymnMatch | undefined = candidates[0]

        // Nothing plausible — clear the banner after a couple of empty polls and
        // stop following (the last projected slide stays on the live output).
        if (!top) {
          if (++missCountRef.current >= STABLE_POLLS) {
            useHymnStore.getState().setDetections([])
            leadingIdRef.current = null
            stableCountRef.current = 0
            followRef.current = null
            slideIdxRef.current = -1
          }
          return
        }
        missCountRef.current = 0

        // Require the same hymn to lead several polls before trusting it.
        if (top.id === leadingIdRef.current) stableCountRef.current++
        else {
          leadingIdRef.current = top.id
          stableCountRef.current = 1
        }
        if (stableCountRef.current < STABLE_POLLS) return

        useHymnStore.getState().setDetections(candidates)

        if (followMode === "off" || top.confidence < AUTO_DISPLAY_CONFIDENCE) return

        // New leading hymn: load it, cache slides, project the best stanza.
        let follow = followRef.current
        if (!follow || follow.id !== top.id) {
          const detail = await hymnActions.getHymn(top.id)
          if (!detail) return
          const { linesPerSlide } = useHymnStore.getState()
          const slides = hymnActions.buildSlides(detail, detail.stanzas, linesPerSlide)
          if (slides.length === 0) return
          follow = { id: top.id, slides }
          followRef.current = follow
          const idx = bestIndex(slides.map((s) => s.text), transcript)
          slideIdxRef.current = idx
          useHymnStore.getState().setSlideIndex(idx)
          hymnActions.goLiveSlide(slides[idx])
          return
        }

        // Same hymn continues — follow the singing through the stanzas.
        const texts = follow.slides.map((s) => s.text)
        const next = nextIndex(texts, transcript, slideIdxRef.current)
        if (next != null && follow.slides[next]) {
          slideIdxRef.current = next
          useHymnStore.getState().setSlideIndex(next)
          hymnActions.goLiveSlide(follow.slides[next])
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
      // Reset per-session state so a settings change restarts the loop cleanly.
      runningRef.current = false
      followRef.current = null
      slideIdxRef.current = -1
      lastQueryRef.current = ""
      leadingIdRef.current = null
      stableCountRef.current = 0
      missCountRef.current = 0
    }
  }, [followMode, responsiveness])
}
