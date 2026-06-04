# Hymn Live-Follow & Karaoke Projection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live output follow the choir hands-free through a whole hymn, and add an optional Spotify-style karaoke display mode, controlled by persisted settings.

**Architecture:** A pure matching module (`src/lib/hymn-follow.ts`) scores transcript-vs-lyric overlap and decides when to switch the projected stanza/line. `use-hymn-detection` caches the detected hymn's slides and re-projects via the existing `liveOverride` → live-output-panel → `setLiveVerse` path as singing continues (Component A). Karaoke mode (Component B) extends `VerseRenderData` with an optional `karaoke` block, draws scrolling highlighted lyrics on the broadcast canvas, and adds a `requestAnimationFrame` pump so the scroll eases and pushes NDI frames at FPS. Follow mode + responsiveness live in `settings-store` and are edited in the settings dialog.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Tauri (canvas → NDI), Bun (`bun x vitest run`).

**Commands:** run a test file with `bun x vitest run <path>`; typecheck with `bun run typecheck`. `bun` is at `C:\Users\Admin\.bun\bin\bun.exe` (not on PATH).

---

## File Structure

**Component A (build & verify first):**
- Create: `src/lib/hymn-follow.ts` — pure matcher: tokenize, overlap score, `bestIndex`, `nextIndex`, `flattenLines`, `pollIntervalFor`, and the `HymnFollowMode`/`FollowResponsiveness` types. No Tauri/store imports.
- Create: `src/lib/hymn-follow.test.ts` — unit tests for the matcher.
- Modify: `src/stores/settings-store.ts` — add persisted `hymnFollowMode` + `hymnFollowResponsiveness`.
- Modify: `src/hooks/use-hymn-detection.ts` — cache hymn slides, follow the singing, gate on settings.
- Modify: `src/stores/hymn-store.ts` — remove the superseded `autoDisplay`/`setAutoDisplay`.
- Modify: `src/stores/hymn-store.test.ts` — drop the two `autoDisplay` tests + reset field.
- Modify: `src/hooks/use-hymns.ts` — drop `autoDisplay`/`setAutoDisplay` from the hook surface.
- Modify: `src/components/panels/hymns-panel.tsx` — "Auto-display" switch mirrors `hymnFollowMode`.
- Modify: `src/components/settings-dialog.tsx` — "Hymn projection" controls in the Display section.

**Component B (build & verify second):**
- Modify: `src/types/broadcast.ts` — optional `karaoke` block on `VerseRenderData`.
- Create: `src/lib/karaoke-renderer.ts` — `karaokeLineGap`, `karaokeTargetScrollY`, `renderKaraoke`.
- Create: `src/lib/karaoke-renderer.test.ts` — layout math + draw-call tests with a fake ctx.
- Modify: `src/hooks/use-hymns.ts` — add `goLiveKaraoke` action.
- Modify: `src/hooks/use-hymn-detection.ts` — in karaoke mode, project lines + current line.
- Modify: `src/broadcast-canvas.tsx` — render karaoke + rAF scroll/NDI pump.

---

# COMPONENT A — Hands-free slide-follow

### Task A1: Pure matcher module

**Files:**
- Create: `src/lib/hymn-follow.ts`
- Test: `src/lib/hymn-follow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/hymn-follow.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  bestIndex,
  nextIndex,
  flattenLines,
  pollIntervalFor,
  MIN_OVERLAP,
} from "./hymn-follow"
import type { HymnStanza } from "@/types"

const stanza = (over: Partial<HymnStanza>): HymnStanza => ({
  id: 1, position: 1, kind: "verse", label: "1", text: "", ...over,
})

describe("pollIntervalFor", () => {
  it("maps responsiveness to ms", () => {
    expect(pollIntervalFor("relaxed")).toBe(1500)
    expect(pollIntervalFor("balanced")).toBe(900)
    expect(pollIntervalFor("snappy")).toBe(500)
  })
})

describe("bestIndex", () => {
  const texts = [
    "Great is Thy faithfulness O God my Father",
    "Summer and winter and springtime and harvest",
    "Pardon for sin and a peace that endureth",
  ]
  it("picks the best-overlapping item", () => {
    expect(bestIndex(texts, "summer and winter and springtime")).toBe(1)
  })
  it("defaults to 0 when nothing is heard", () => {
    expect(bestIndex(texts, "")).toBe(0)
  })
})

describe("nextIndex", () => {
  const texts = [
    "Great is Thy faithfulness O God my Father",   // 0
    "Great is Thy faithfulness morning by morning", // 1 (chorus)
    "Pardon for sin and a peace that endureth",     // 2
  ]
  it("switches to a clearly better, non-trivial match", () => {
    expect(nextIndex(texts, "pardon for sin and a peace", 0)).toBe(2)
  })
  it("stays put when already on the best match", () => {
    expect(nextIndex(texts, "pardon for sin and a peace", 2)).toBeNull()
  })
  it("ignores noise below the overlap floor", () => {
    expect(nextIndex(texts, "umm okay yeah the", 0)).toBeNull()
  })
  it("does not switch on a tie (no strictly-better match)", () => {
    // 'great is thy faithfulness' overlaps lines 0 and 1 equally.
    expect(nextIndex(texts, "great is thy faithfulness", 0)).toBeNull()
  })
})

describe("flattenLines", () => {
  it("flattens stanzas into non-empty lines in order", () => {
    const stanzas = [
      stanza({ text: "line a\nline b" }),
      stanza({ position: 2, label: "2", text: "line c\n\nline d" }),
    ]
    expect(flattenLines(stanzas)).toEqual(["line a", "line b", "line c", "line d"])
  })
})

describe("MIN_OVERLAP", () => {
  it("is 2", () => {
    expect(MIN_OVERLAP).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/lib/hymn-follow.test.ts`
Expected: FAIL — `Failed to resolve import "./hymn-follow"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/hymn-follow.ts`:

```ts
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
      return 1500
    case "snappy":
      return 500
    case "balanced":
    default:
      return 900
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/lib/hymn-follow.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hymn-follow.ts src/lib/hymn-follow.test.ts
git commit -m "Add pure hymn-follow matcher (overlap scoring, slide-switch decision)"
```

---

### Task A2: Persisted follow settings

**Files:**
- Modify: `src/stores/settings-store.ts`

- [ ] **Step 1: Add the types import and state fields**

In `src/stores/settings-store.ts`, add the import directly under the existing `load` import (line 2):

```ts
import type { HymnFollowMode, FollowResponsiveness } from "@/lib/hymn-follow"
```

Add these four members to the `SettingsState` interface (after `sttProvider: SttProvider`):

```ts
  hymnFollowMode: HymnFollowMode
  hymnFollowResponsiveness: FollowResponsiveness

  setHymnFollowMode: (mode: HymnFollowMode) => void
  setHymnFollowResponsiveness: (r: FollowResponsiveness) => void
```

Add the initial values to the `create(...)` object (after `sttProvider: "deepgram",`):

```ts
  hymnFollowMode: "slides",
  hymnFollowResponsiveness: "balanced",
```

Add the setters (after `setSttProvider: ...`):

```ts
  setHymnFollowMode: (hymnFollowMode) => set({ hymnFollowMode }),
  setHymnFollowResponsiveness: (hymnFollowResponsiveness) => set({ hymnFollowResponsiveness }),
```

Add both keys to `PERSISTED_KEYS` (after `"sttProvider",`):

```ts
  "hymnFollowMode",
  "hymnFollowResponsiveness",
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Verify existing settings tests still pass**

Run: `bun x vitest run src/stores/settings-store.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/stores/settings-store.ts
git commit -m "Add persisted hymn follow-mode and responsiveness settings"
```

---

### Task A3: Remove the superseded `autoDisplay` flag

**Files:**
- Modify: `src/stores/hymn-store.ts`
- Modify: `src/stores/hymn-store.test.ts`
- Modify: `src/hooks/use-hymns.ts`

- [ ] **Step 1: Remove `autoDisplay` from the store**

In `src/stores/hymn-store.ts`:
- Delete the interface lines `detections: HymnMatch[]` is kept, but remove:
  ```ts
  /** Auto-display the top detection on the live output when confident. */
  autoDisplay: boolean
  ```
  and
  ```ts
  setAutoDisplay: (v: boolean) => void
  ```
- Remove the initial value block (the comment + `autoDisplay: true,`):
  ```ts
  // On by default: as the choir sings, the detected hymn auto-projects.
  autoDisplay: true,
  ```
- Remove the action:
  ```ts
  setAutoDisplay: (autoDisplay) => set({ autoDisplay }),
  ```

- [ ] **Step 2: Update the hymn-store test**

In `src/stores/hymn-store.test.ts`:
- In the `beforeEach` reset object, remove the line `autoDisplay: true,`.
- Delete the whole `it("auto-display is on by default", ...)` test (lines 35–40).
- Delete the whole `it("setAutoDisplay toggles", ...)` test (lines 60–63).

- [ ] **Step 3: Remove `autoDisplay` from the hook surface**

In `src/hooks/use-hymns.ts`, inside `useHymns()`:
- Remove the selector line `const autoDisplay = useHymnStore((s) => s.autoDisplay)`.
- Remove `autoDisplay,` from the returned object.
- Remove `setAutoDisplay: useHymnStore((s) => s.setAutoDisplay),` from the returned object.

- [ ] **Step 4: Run the affected tests + typecheck**

Run: `bun x vitest run src/stores/hymn-store.test.ts src/hooks/use-hymns.test.ts`
Expected: PASS.
Run: `bun run typecheck`
Expected: errors only in `hymns-panel.tsx`/`use-hymn-detection.ts` (fixed in A4/A5) referencing `autoDisplay`. If `typecheck` fails only there, that is expected at this step.

- [ ] **Step 5: Commit**

```bash
git add src/stores/hymn-store.ts src/stores/hymn-store.test.ts src/hooks/use-hymns.ts
git commit -m "Remove superseded hymn-store autoDisplay flag"
```

---

### Task A4: Follow the singing in the detection hook

**Files:**
- Modify: `src/hooks/use-hymn-detection.ts`

- [ ] **Step 1: Replace the file with the follow-capable hook**

Replace the entire contents of `src/hooks/use-hymn-detection.ts` with:

```ts
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
    return () => clearInterval(id)
  }, [followMode, responsiveness])
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: errors only remaining in `hymns-panel.tsx` (references to `autoDisplay`), fixed in A5.

- [ ] **Step 3: Run the hymn suite (no regressions in pure helpers)**

Run: `bun x vitest run src/lib/hymn-follow.test.ts src/hooks/use-hymns.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-hymn-detection.ts
git commit -m "Follow the singing: re-project stanzas through the whole hymn"
```

---

### Task A5: Panel switch mirrors follow mode

**Files:**
- Modify: `src/components/panels/hymns-panel.tsx`

- [ ] **Step 1: Swap the auto-display switch to settings-backed follow mode**

In `src/components/panels/hymns-panel.tsx`:

Add an import near the other imports:

```ts
import { useSettingsStore } from "@/stores/settings-store"
```

In `HymnsPanel()`, remove `autoDisplay,` and `setAutoDisplay,` from the `useHymns()` destructure. Then add, just below that destructure:

```ts
  const hymnFollowMode = useSettingsStore((s) => s.hymnFollowMode)
  const setHymnFollowMode = useSettingsStore((s) => s.setHymnFollowMode)
  // Remember the last non-off mode so toggling back on restores Slides/Karaoke.
  const lastFollowModeRef = useRef<"slides" | "karaoke">(
    hymnFollowMode === "karaoke" ? "karaoke" : "slides",
  )
  useEffect(() => {
    if (hymnFollowMode !== "off") lastFollowModeRef.current = hymnFollowMode
  }, [hymnFollowMode])
```

Replace the `<Switch ... />` in the `PanelHeader` (the `Auto-display` control) with:

```tsx
        <label className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
          Follow
          <Switch
            checked={hymnFollowMode !== "off"}
            onCheckedChange={(on) =>
              setHymnFollowMode(on ? lastFollowModeRef.current : "off")
            }
          />
        </label>
```

(`useRef` and `useEffect` are already imported at the top of the file.)

- [ ] **Step 2: Typecheck (now clean)**

Run: `bun run typecheck`
Expected: NO errors anywhere.

- [ ] **Step 3: Full frontend test sweep**

Run: `bun x vitest run`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/hymns-panel.tsx
git commit -m "Hymns panel: Follow switch mirrors persisted follow mode"
```

---

### Task A6: Settings dialog — Hymn projection controls

**Files:**
- Modify: `src/components/settings-dialog.tsx`

- [ ] **Step 1: Add the controls to the Display Mode section**

In `src/components/settings-dialog.tsx`, in `DisplayModeSection()`, extend the store destructure:

```ts
  const {
    autoMode,
    setAutoMode,
    confidenceThreshold,
    setConfidenceThreshold,
    hymnFollowMode,
    setHymnFollowMode,
    hymnFollowResponsiveness,
    setHymnFollowResponsiveness,
  } = useSettingsStore()
```

Then, just before the closing `</div>` of the section's outer `<div className="flex flex-col gap-6">`, add a "Hymn projection" block:

```tsx
      {/* Hymn projection */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Hymn Projection
        </label>
        <RadioGroup
          value={hymnFollowMode}
          onValueChange={(v) => setHymnFollowMode(v as "off" | "slides" | "karaoke")}
          className="gap-3"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20">
            <RadioGroupItem value="slides" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Slides (follow)</span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Detects the hymn from the singing and auto-advances through the stanzas
                on the live output, one slide at a time.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20">
            <RadioGroupItem value="karaoke" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Karaoke (Spotify-style)</span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Shows the full lyrics on the live output with the current line highlighted
                and auto-scrolling as the choir sings (~1–2s follow lag).
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20">
            <RadioGroupItem value="off" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Off</span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                No automatic hymn projection. Detected hymns still show in the Hymns panel.
              </p>
            </div>
          </label>
        </RadioGroup>

        {hymnFollowMode !== "off" && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Follow Responsiveness
            </label>
            <Select
              value={hymnFollowResponsiveness}
              onValueChange={(v) =>
                setHymnFollowResponsiveness(v as "relaxed" | "balanced" | "snappy")
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relaxed">Relaxed (1.5s) — lowest CPU</SelectItem>
                <SelectItem value="balanced">Balanced (0.9s)</SelectItem>
                <SelectItem value="snappy">Snappy (0.5s) — most responsive</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[0.625rem] text-muted-foreground">
              How often the singing is re-checked to advance the hymn. Snappier feels more
              in-sync but uses more CPU and transcription lookups.
            </p>
          </div>
        )}
      </div>
```

(`RadioGroup`, `RadioGroupItem`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` are already imported at the top of the file.)

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings-dialog.tsx
git commit -m "Settings: Hymn projection mode + follow responsiveness controls"
```

---

### Task A7: Manual verification of Component A

- [ ] **Step 1: Launch dev**

Run (PowerShell): `$env:PATH = "C:\Users\Admin\.cargo\bin;C:\Users\Admin\.bun\bin;$env:PATH"; bun run tauri dev`

- [ ] **Step 2: Verify follow-through**

Start transcription, open the Hymns panel, confirm "Follow" is on (mirrors Settings → Display Mode → Hymn Projection = Slides). Sing/feed lyrics for Hymn 728 ("Great Is Thy Faithfulness"). Confirm the live output starts on the matched stanza and advances verse 1 → Refrain → verse 2 → verse 3 as you progress, and that singing the chorus again jumps back to the Refrain slide. Confirm it stays on the last slide when singing stops (no blanking).

- [ ] **Step 3: Stop dev.** Component A complete.

---

# COMPONENT B — Spotify-style karaoke mode

### Task B1: Karaoke payload field

**Files:**
- Modify: `src/types/broadcast.ts`

- [ ] **Step 1: Add the optional karaoke block**

In `src/types/broadcast.ts`, change the `VerseRenderData` interface to:

```ts
export interface VerseRenderData {
  reference: string
  segments: VerseSegment[]
  /** When present, the live output renders a scrolling karaoke view instead of
   *  a static slide. `lines` is the full ordered lyric; `currentLine` indexes it. */
  karaoke?: { lines: string[]; currentLine: number }
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors (optional field; existing call sites unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/types/broadcast.ts
git commit -m "Add optional karaoke block to VerseRenderData"
```

---

### Task B2: Karaoke renderer

**Files:**
- Create: `src/lib/karaoke-renderer.ts`
- Test: `src/lib/karaoke-renderer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/karaoke-renderer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { karaokeLineGap, karaokeTargetScrollY, renderKaraoke } from "./karaoke-renderer"
import type { BroadcastTheme } from "@/types/broadcast"

const theme = (): BroadcastTheme =>
  ({
    resolution: { width: 1920, height: 1080 },
    background: { type: "solid", color: "#000", gradient: null, image: null },
    verseText: { fontFamily: "Inter", color: "#fff" },
  }) as unknown as BroadcastTheme

describe("karaoke layout math", () => {
  it("line gap scales with resolution height", () => {
    expect(karaokeLineGap(theme())).toBe(Math.round(Math.round(1080 * 0.06) * 1.8))
  })
  it("target scroll centers the current line", () => {
    const gap = karaokeLineGap(theme())
    expect(karaokeTargetScrollY(theme(), 0)).toBe(0)
    expect(karaokeTargetScrollY(theme(), 3)).toBe(3 * gap)
  })
})

describe("renderKaraoke", () => {
  it("fills the background and draws each visible line once", () => {
    const calls: string[] = []
    const ctx = {
      canvas: { width: 1920, height: 1080 },
      fillRect: vi.fn(() => calls.push("fillRect")),
      clearRect: vi.fn(),
      fillText: vi.fn((t: string) => calls.push(`fillText:${t}`)),
      measureText: vi.fn(() => ({ width: 100 })),
      set font(_v: string) {},
      set fillStyle(_v: string) {},
      set globalAlpha(_v: number) {},
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
    } as unknown as CanvasRenderingContext2D

    renderKaraoke(ctx, theme(), { lines: ["one", "two", "three"], currentLine: 1 }, karaokeTargetScrollY(theme(), 1))

    expect(calls.filter((c) => c === "fillRect")).toHaveLength(1)
    expect(calls).toContain("fillText:one")
    expect(calls).toContain("fillText:two")
    expect(calls).toContain("fillText:three")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/lib/karaoke-renderer.test.ts`
Expected: FAIL — cannot resolve `./karaoke-renderer`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/karaoke-renderer.ts`:

```ts
import type { BroadcastTheme } from "@/types/broadcast"

export interface KaraokeData {
  lines: string[]
  currentLine: number
}

/** Font size for karaoke lines, in px (scales with output height). */
export function karaokeFontSize(theme: BroadcastTheme): number {
  return Math.round(theme.resolution.height * 0.06)
}

/** Vertical distance between karaoke lines, in px. */
export function karaokeLineGap(theme: BroadcastTheme): number {
  return Math.round(karaokeFontSize(theme) * 1.8)
}

/** Scroll offset that places `currentLine` at the vertical center. */
export function karaokeTargetScrollY(theme: BroadcastTheme, currentLine: number): number {
  return currentLine * karaokeLineGap(theme)
}

/**
 * Draw the full lyric as a vertically-scrolling list with the current line
 * bright/large and neighbours progressively dimmed. `scrollY` is supplied by
 * the caller (eased each animation frame) so the active line eases to center.
 */
export function renderKaraoke(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  data: KaraokeData,
  scrollY: number,
): void {
  const W = theme.resolution.width
  const H = theme.resolution.height

  // Background.
  if (theme.background.type === "transparent") {
    ctx.clearRect(0, 0, W, H)
  } else {
    ctx.fillStyle = theme.background.type === "solid" ? theme.background.color : "#000000"
    ctx.fillRect(0, 0, W, H)
  }

  const fontSize = karaokeFontSize(theme)
  const lineGap = karaokeLineGap(theme)
  const centerY = H / 2
  const family = theme.verseText.fontFamily
  const color = theme.verseText.color || "#ffffff"

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  data.lines.forEach((line, i) => {
    const y = centerY + i * lineGap - scrollY
    if (y < -lineGap || y > H + lineGap) return // cull offscreen lines
    const isCurrent = i === data.currentLine
    const dist = Math.abs(i - data.currentLine)
    const size = isCurrent ? Math.round(fontSize * 1.15) : fontSize
    ctx.font = `${isCurrent ? 700 : 500} ${size}px "${family}", sans-serif`
    ctx.globalAlpha = isCurrent ? 1 : Math.max(0.25, 0.7 - dist * 0.15)
    ctx.fillStyle = color
    ctx.fillText(line, W / 2, y)
  })

  ctx.globalAlpha = 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/lib/karaoke-renderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/karaoke-renderer.ts src/lib/karaoke-renderer.test.ts
git commit -m "Add karaoke canvas renderer (scrolling highlighted lyrics)"
```

---

### Task B3: `goLiveKaraoke` action

**Files:**
- Modify: `src/hooks/use-hymns.ts`

- [ ] **Step 1: Add the action**

In `src/hooks/use-hymns.ts`, just after the `goLiveSlide` function (before `export const hymnActions`):

```ts
/** Push a scrolling karaoke view (full lyrics + current line) to the live output. */
function goLiveKaraoke(reference: string, lines: string[], currentLine: number) {
  const bs = useBroadcastStore.getState()
  bs.setLiveOverride({
    reference,
    // Fallback content for non-karaoke renderers (in-app preview): the current line.
    segments: [{ text: lines[currentLine] ?? "" }],
    karaoke: { lines, currentLine },
  })
  bs.setLive(true)
}
```

Add `goLiveKaraoke,` to the `hymnActions` object (next to `goLiveSlide,`).

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-hymns.ts
git commit -m "Add goLiveKaraoke action for karaoke live output"
```

---

### Task B4: Karaoke line-follow in the detection hook

**Files:**
- Modify: `src/hooks/use-hymn-detection.ts`

- [ ] **Step 1: Cache flattened lines and project karaoke when in karaoke mode**

In `src/hooks/use-hymn-detection.ts`:

Extend the imports:

```ts
import { bestIndex, nextIndex, flattenLines, pollIntervalFor } from "@/lib/hymn-follow"
```

Change the follow cache ref to also hold the hymn's flat lyric lines, reference label, and the last projected line index:

```ts
  const followRef = useRef<{
    id: number
    slides: HymnSlide[]
    lines: string[]
    reference: string
  } | null>(null)
  const slideIdxRef = useRef(-1)
  const lineIdxRef = useRef(-1)
```

In the "New leading hymn" branch, after building `slides`, also build `lines` and store them, and project according to mode. Replace that whole branch with:

```ts
        // New leading hymn: load it, cache slides + lines, project.
        let follow = followRef.current
        if (!follow || follow.id !== top.id) {
          const detail = await hymnActions.getHymn(top.id)
          if (!detail) return
          const { linesPerSlide } = useHymnStore.getState()
          const slides = hymnActions.buildSlides(detail, detail.stanzas, linesPerSlide)
          if (slides.length === 0) return
          const lines = flattenLines(detail.stanzas)
          const reference = hymnReference(detail)
          follow = { id: top.id, slides, lines, reference }
          followRef.current = follow

          if (followMode === "karaoke" && lines.length > 0) {
            const idx = bestIndex(lines, transcript)
            lineIdxRef.current = idx
            hymnActions.goLiveKaraoke(reference, lines, idx)
          } else {
            const idx = bestIndex(slides.map((s) => s.text), transcript)
            slideIdxRef.current = idx
            useHymnStore.getState().setSlideIndex(idx)
            hymnActions.goLiveSlide(slides[idx])
          }
          return
        }
```

Replace the "Same hymn continues" branch with mode-aware following:

```ts
        // Same hymn continues — follow the singing.
        if (followMode === "karaoke" && follow.lines.length > 0) {
          const next = nextIndex(follow.lines, transcript, lineIdxRef.current)
          if (next != null) {
            lineIdxRef.current = next
            hymnActions.goLiveKaraoke(follow.reference, follow.lines, next)
          }
        } else {
          const next = nextIndex(follow.slides.map((s) => s.text), transcript, slideIdxRef.current)
          if (next != null && follow.slides[next]) {
            slideIdxRef.current = next
            useHymnStore.getState().setSlideIndex(next)
            hymnActions.goLiveSlide(follow.slides[next])
          }
        }
```

In the song-ended reset block (the `if (!top)` branch) and add `lineIdxRef.current = -1` next to `slideIdxRef.current = -1`.

Add `hymnReference` to the `use-hymns` import:

```ts
import { hymnActions, hymnReference, type HymnSlide } from "@/hooks/use-hymns"
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Run pure-helper + hook-related suites**

Run: `bun x vitest run src/lib/hymn-follow.test.ts src/lib/karaoke-renderer.test.ts src/hooks/use-hymns.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-hymn-detection.ts
git commit -m "Follow the singing at line granularity for karaoke mode"
```

---

### Task B5: Broadcast canvas — karaoke render + scroll/NDI pump

**Files:**
- Modify: `src/broadcast-canvas.tsx`

- [ ] **Step 1: Import the karaoke renderer**

At the top of `src/broadcast-canvas.tsx`, add:

```ts
import { renderKaraoke, karaokeTargetScrollY } from "@/lib/karaoke-renderer"
```

- [ ] **Step 2: Add scroll-state refs**

Inside `BroadcastCanvas`, alongside the other refs (after `pushingRef`):

```ts
  const scrollYRef = useRef(0) // eased karaoke scroll offset
  const rafRef = useRef<number | null>(null) // active animation-frame id
```

- [ ] **Step 3: Make `draw` render karaoke when present**

Replace the body of the `draw` callback's "has data" section so karaoke is handled before the normal verse render. Change:

```ts
    const { theme, verse } = data
    canvas.width = theme.resolution.width
    canvas.height = theme.resolution.height
    const result = renderVerse(ctx, theme, verse, {
      scale: 1,
      imageCache: imageCacheRef.current,
    })
    if (!result) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      logDebug("renderVerse returned null; drew fallback frame")
    }
```

to:

```ts
    const { theme, verse } = data
    canvas.width = theme.resolution.width
    canvas.height = theme.resolution.height

    if (verse?.karaoke) {
      renderKaraoke(ctx, theme, verse.karaoke, scrollYRef.current)
      return
    }

    const result = renderVerse(ctx, theme, verse, {
      scale: 1,
      imageCache: imageCacheRef.current,
    })
    if (!result) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      logDebug("renderVerse returned null; drew fallback frame")
    }
```

- [ ] **Step 4: Add the rAF scroll/NDI pump**

Add this `useEffect` right after the existing `draw`/`pushNdiFrame`/`pushNdiBurst` callbacks are defined and before the main listener `useEffect`:

```ts
  // While a karaoke payload is live, ease the scroll toward the current line and
  // push NDI frames continuously; otherwise idle (event-driven path handles it).
  useEffect(() => {
    let lastNdi = 0

    const animate = (now: number) => {
      const data = latestData.current
      const k = data?.verse?.karaoke
      if (!k) {
        rafRef.current = null
        return
      }
      const target = karaokeTargetScrollY(data!.theme, k.currentLine)
      // Exponential ease toward target; snap when close to avoid jitter.
      const delta = target - scrollYRef.current
      scrollYRef.current = Math.abs(delta) < 0.5 ? target : scrollYRef.current + delta * 0.15
      draw()

      const fps = ndiConfigRef.current.active ? ndiConfigRef.current.fps || 24 : 30
      if (now - lastNdi >= 1000 / fps) {
        lastNdi = now
        if (ndiConfigRef.current.active) void pushNdiFrame()
      }
      rafRef.current = requestAnimationFrame(animate)
    }

    const ensureRunning = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(animate)
    }

    const currentWindow = getCurrentWebviewWindow()
    const unlisten = currentWindow.listen<BroadcastPayload>("broadcast:verse-update", (event) => {
      if (event.payload.verse?.karaoke) ensureRunning()
    })

    return () => {
      unlisten.then((fn) => fn())
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [draw, pushNdiFrame])
```

(The existing main listener already sets `latestData.current` and calls `draw()` + `pushNdiBurst()` for every update, which correctly handles the non-karaoke and first-karaoke frames; this effect adds the continuous easing while karaoke stays live.)

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Build the frontend (the broadcast output is a separate entry)**

Run: `bun run build`
Expected: builds with no TypeScript errors (warnings about chunk size are fine).

- [ ] **Step 7: Commit**

```bash
git add src/broadcast-canvas.tsx
git commit -m "Broadcast canvas: render karaoke with eased scroll + NDI pump"
```

---

### Task B6: Manual verification of Component B

- [ ] **Step 1: Launch dev**

Run (PowerShell): `$env:PATH = "C:\Users\Admin\.cargo\bin;C:\Users\Admin\.bun\bin;$env:PATH"; bun run tauri dev`

- [ ] **Step 2: Switch to karaoke mode**

Settings → Display Mode → Hymn Projection → "Karaoke (Spotify-style)". Open/enable the broadcast output window.

- [ ] **Step 3: Verify follow + scroll**

Start transcription and sing/feed Hymn 728. Confirm the broadcast output shows the full lyrics with the current line highlighted, dimmed neighbours, and smooth auto-scroll that keeps the active line centered and advances as you sing. Confirm switching back to "Slides" returns to single-stanza projection.

- [ ] **Step 4: Stop dev.** Component B complete.

---

## Final verification

- [ ] Run the full test suite: `bun x vitest run` — all green.
- [ ] Typecheck: `bun run typecheck` — clean.
- [ ] Frontend build: `bun run build` — succeeds.
- [ ] (Optional, slow) Full installer build: `bun run tauri build`.

## Notes / known limitations

- Changing "lines per slide" mid-song does not rebuild the cached slides until the
  hymn is re-detected (acceptable; out of scope).
- The in-app preview/live-output *panels* show the current line as a normal slide; the
  full scrolling karaoke view renders on the broadcast output window / NDI (matches the
  "display live" goal). Bringing karaoke into the in-app panels can be a follow-up.
- Follow lag is ~1–2s by design (live ASR, not pre-timed lyrics); tune via the
  responsiveness setting.
```
