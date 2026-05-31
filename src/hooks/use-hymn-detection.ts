import { useEffect, useRef } from "react"
import { useTranscriptStore, useHymnStore } from "@/stores"
import { hymnActions, type HymnSlide } from "@/hooks/use-hymns"
import type { HymnMatch } from "@/types"

// Detection tuning.
const POLL_MS = 1500 // how often to re-evaluate the rolling transcript
const WINDOW_WORDS = 24 // size of the rolling lyric window fed to the matcher
const MIN_WORDS = 6 // need at least this many words before guessing (avoids speech noise)
const SHOW_CONFIDENCE = 0.3 // weaker matches are dropped from the candidate list
const STABLE_POLLS = 2 // the same hymn must lead this many polls in a row to count
const AUTO_DISPLAY_CONFIDENCE = 0.45 // top match must beat this to auto-show

/** Build a rolling window of the most recent transcript words. */
function recentTranscript(): string {
  const { segments, currentPartial } = useTranscriptStore.getState()
  const tail = segments.slice(-6).map((s) => s.text).join(" ")
  const text = `${tail} ${currentPartial}`.trim()
  const words = text.split(/\s+/)
  return words.slice(-WINDOW_WORDS).join(" ")
}

/** Pick the slide whose words best overlap the heard lyrics. */
function bestSlideIndex(slides: HymnSlide[], transcript: string): number {
  const heard = new Set(
    transcript.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter((w) => w.length > 2)
  )
  if (heard.size === 0) return 0
  let bestIdx = 0
  let bestScore = -1
  slides.forEach((s, i) => {
    const words = s.text.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/)
    const score = words.reduce((acc, w) => acc + (heard.has(w) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  })
  return bestIdx
}

/**
 * Continuously detect which hymn the choir is singing from the live transcript.
 * Updates the hymn store's `detections`, and — when `autoDisplay` is on and the
 * top match is confident — loads the hymn and pushes the best-matching stanza
 * to the live output.
 *
 * Mount once (e.g. in App) so it runs for the whole session.
 */
export function useHymnDetection() {
  const lastQueryRef = useRef("")
  const lastShownRef = useRef<number | null>(null)
  const leadingIdRef = useRef<number | null>(null) // hymn currently leading
  const stableCountRef = useRef(0) // consecutive polls it has led
  const missCountRef = useRef(0) // consecutive polls with no candidate
  const runningRef = useRef(false)

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

        // Nothing plausible — clear the banner after a couple of empty polls.
        if (!top) {
          if (++missCountRef.current >= STABLE_POLLS) {
            useHymnStore.getState().setDetections([])
            leadingIdRef.current = null
            stableCountRef.current = 0
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

        const { autoDisplay } = useHymnStore.getState()
        if (
          autoDisplay &&
          top.confidence >= AUTO_DISPLAY_CONFIDENCE &&
          top.id !== lastShownRef.current
        ) {
          const detail = await hymnActions.getHymn(top.id)
          if (detail) {
            const { linesPerSlide } = useHymnStore.getState()
            const slides = hymnActions.buildSlides(detail, detail.stanzas, linesPerSlide)
            const idx = bestSlideIndex(slides, transcript)
            useHymnStore.getState().setSlideIndex(idx)
            hymnActions.goLiveSlide(slides[idx])
            lastShownRef.current = top.id
          }
        }
      } catch (err) {
        console.warn("[hymn-detect]", err)
      } finally {
        runningRef.current = false
      }
    }

    const id = setInterval(() => void tick(), POLL_MS)
    return () => clearInterval(id)
  }, [])
}
