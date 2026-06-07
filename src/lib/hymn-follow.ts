/**
 * Pure helpers for following a hymn live as it is sung. No Tauri/store imports
 * so the matching logic can be unit-tested in a plain node environment.
 */
import type { HymnStanza } from "@/types"

export type HymnFollowMode = "off" | "slides" | "karaoke"
export type FollowResponsiveness = "relaxed" | "balanced" | "snappy"

/** Detection poll interval (ms) for each responsiveness setting. */
export function pollIntervalFor(r: FollowResponsiveness): number {
  switch (r) {
    case "relaxed":
      return 1200
    case "snappy":
      return 350
    case "balanced":
    default:
      return 700
  }
}

/** Minimum word-overlap for a slide/line switch to be trusted (anti-jitter). */
export const MIN_OVERLAP = 2

const NON_WORD = /[^a-z\s']/g

/** Lowercased content words (length > 2) heard in the transcript. */
export function heardWords(transcript: string): Set<string> {
  return new Set(
    transcript.toLowerCase().replace(NON_WORD, " ").split(/\s+/).filter((w) => w.length > 2),
  )
}

/** Count of an item's words that appear in the heard-word set. */
export function overlapScore(text: string, heard: Set<string>): number {
  if (heard.size === 0) return 0
  return text
    .toLowerCase()
    .replace(NON_WORD, " ")
    .split(/\s+/)
    .reduce((acc, w) => acc + (heard.has(w) ? 1 : 0), 0)
}

/** Index of the item whose text best overlaps the transcript (argmax; 0 default). */
export function bestIndex(texts: readonly string[], transcript: string): number {
  const heard = heardWords(transcript)
  if (heard.size === 0) return 0
  let bestIdx = 0
  let bestScore = -1
  texts.forEach((t, i) => {
    const score = overlapScore(t, heard)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  })
  return bestIdx
}

/**
 * Decide whether to switch the live item as singing continues. Returns the new
 * index, or null to stay on currentIndex. Switches only to a strictly-better,
 * non-trivial match (>= MIN_OVERLAP and beating the current item's score) so
 * garbled audio does not cause flapping.
 */
export function nextIndex(
  texts: readonly string[],
  transcript: string,
  currentIndex: number,
): number | null {
  const heard = heardWords(transcript)
  if (heard.size === 0) return null
  let bestIdx = 0
  let bestScore = -1
  texts.forEach((t, i) => {
    const score = overlapScore(t, heard)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  })
  if (bestScore < MIN_OVERLAP) return null
  if (bestIdx === currentIndex) return null
  const currentScore =
    currentIndex >= 0 && currentIndex < texts.length
      ? overlapScore(texts[currentIndex], heard)
      : -1
  if (bestScore <= currentScore) return null
  return bestIdx
}

/** Flatten a hymn's stanzas into ordered, non-empty lyric lines (for karaoke). */
export function flattenLines(stanzas: readonly HymnStanza[]): string[] {
  const lines: string[] = []
  for (const s of stanzas) {
    for (const raw of s.text.split("\n")) {
      const line = raw.trim()
      if (line) lines.push(line)
    }
  }
  return lines
}

// Common words worth nothing as recognition hints — skipped when priming.
const KEYTERM_STOP = new Set([
  "the", "and", "that", "this", "with", "from", "they", "them", "their", "have",
  "will", "shall", "unto", "thee", "thou", "thine", "your", "yours", "what",
  "when", "then", "than", "there", "here", "were", "was", "are", "for", "but",
  "all", "our", "his", "her", "him", "she", "you", "not", "who", "which",
])

/**
 * Distinctive words from a hymn (title + lyrics) to prime the speech recognizer
 * with — so the expected lyrics are transcribed accurately. Lowercased content
 * words (length >= 4, non-stop), de-duplicated in first-seen order, capped.
 */
export function hymnKeyterms(
  detail: { title: string; stanzas: readonly { text: string }[] },
  max = 60,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const consider = (raw: string) => {
    const w = raw.toLowerCase().replace(/[^a-z']/g, "")
    if (w.length >= 4 && !KEYTERM_STOP.has(w) && !seen.has(w)) {
      seen.add(w)
      out.push(w)
    }
  }
  for (const word of detail.title.split(/\s+/)) consider(word)
  for (const stanza of detail.stanzas) {
    for (const word of stanza.text.split(/\s+/)) consider(word)
  }
  return out.slice(0, max)
}

/** A transcript segment with a wall-clock timestamp (ms). */
export interface TimedSegment {
  text: string
  timestamp: number
}

/**
 * Build the rolling lyric window fed to the matcher: only segments newer than
 * `maxAgeMs` (so stale speech ages out instead of lingering for minutes) plus
 * the live partial, capped to the last `windowWords` words.
 */
export function recentLyricWindow(
  segments: readonly TimedSegment[],
  currentPartial: string,
  now: number,
  maxAgeMs = 20000,
  windowWords = 24,
): string {
  const fresh = segments
    .filter((s) => now - s.timestamp <= maxAgeMs)
    .map((s) => s.text)
  const text = `${fresh.join(" ")} ${currentPartial}`.trim()
  if (!text) return ""
  return text.split(/\s+/).slice(-windowWords).join(" ")
}
