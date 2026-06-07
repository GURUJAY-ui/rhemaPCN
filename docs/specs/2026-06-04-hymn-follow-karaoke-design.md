# Hymn live-follow & Spotify-style karaoke projection — Design

**Date:** 2026-06-04
**Branch:** `feat/hymn-follow-karaoke`
**Status:** Shipped — see "Implementation pivot" below for how the design changed during live testing.

## Implementation pivot (2026-06-07)

Live testing changed the approach. The original plan auto-detected *which* hymn
was being sung (1-of-881) from the transcript and auto-projected it. In practice
that was unreliable and unsafe:

- Speech-to-text transcribes singing poorly (garbled lyrics → no match).
- Loosening the matcher to compensate made ordinary speech false-fire hymns
  (common words like "morning"/"see" score ~0.99 against the refrain), which
  would project hymns during the sermon.

What actually shipped instead:

1. **Follow the operator-cued hymn, not blind detection.** The operator selects
   a hymn (search + click, or tap a detection *suggestion*); the engine then
   tracks the singing **within that one hymn** — a robust 1-of-~20-lines match
   that ignores STT noise (garbage words aren't in the hymn) and never fires
   during the sermon. Blind `detect_hymn` is kept only as a non-committal
   suggestion banner.
2. **Keyterm priming.** When a hymn is cued, Deepgram is primed with that hymn's
   distinctive vocabulary (`SttConfig.keyterms`) instead of the default Bible
   terms, so its lyrics transcribe accurately → tighter following. Changing the
   cued hymn re-primes via a guarded stream restart.
3. **Window freshness + latency tuning.** A time-based transcript window
   (`recentLyricWindow`) ages out stale speech; poll cadence tightened
   (snappy default) for responsiveness.

Components A (slide-follow) and B (karaoke render + scroll/NDI pump) shipped as
designed below; only the *trigger* changed from auto-detect to operator-cue.

## Problem

When the choir sings, the app is meant to detect the hymn and project it live, advancing
through the stanzas automatically. Two gaps:

1. **Auto-advance is frozen.** `use-hymn-detection.ts` projects exactly one slide when a
   hymn is first detected, then sets a `lastShownRef` guard
   (`top.id !== lastShownRef.current`) that prevents any further re-projection for that
   hymn. The live output sticks on whichever stanza matched first and never moves on — so
   later verses and the chorus may never appear. Reported symptom: "Great Is Thy
   Faithfulness — I never saw the chorus." (The chorus *is* in the data, stored as
   `kind=refrain`, `label="Refrain"`, once after verse 1; it simply was never reached.)

2. **No "follow-along" display.** The user wants a Spotify-lyrics-style view: detect the
   song, follow the singing, and display it live with the current line highlighted and the
   lyrics auto-scrolling.

## Goals

- Hands-free: once detected, the live output follows the singing through the whole hymn
  until it ends, with no operator clicks.
- A selectable **karaoke display mode** (Spotify style) on the projected/live output, with
  the active line highlighted and smooth auto-scroll.
- Settings (persisted) and settings-dialog UI to control follow mode and responsiveness.

## Non-goals

- No millisecond word-level timing. We drive off live microphone → transcription → fuzzy
  lyric match, which has inherent lag. Realistic target: **line/phrase-level follow with
  ~1–2 s lag**, smooth scroll. Not Spotify's pre-authored LRC precision.
- No change to hymn data, schema, or labels. "Refrain" stays "Refrain". The original
  complaint is resolved by fixing advancing, not relabeling.
- No new STT/transcription work; reuse the existing transcript store + `detect_hymn`.

## Architecture decisions

1. Karaoke renders on the **projected/live output** (and therefore the preview, which
   mirrors it) — matching "display live."
2. Karaoke is a **selectable mode**, not a replacement. Traditional slide projection
   remains the default.
3. Follow on/off and responsiveness live in **persisted settings** (`settings-store`),
   controlled from the settings dialog. The hymns-panel "Auto-display" switch becomes a
   quick mirror of `hymnFollowMode !== "off"`.
4. **Phased build:** ship and verify Component A (slide-follow) before building
   Component B (karaoke).

### Why the renderer/animation note matters

NDI frames are pixels read off the broadcast `<canvas>` via `ctx.getImageData`
(`broadcast-canvas.tsx`). The output only redraws **on change** (a 3-frame burst per
`broadcast:verse-update`, plus a 2 s keepalive) — there is no continuous render loop.

- Component A (slide mode) fits this model unchanged: each new stanza is a new
  `verse-update` push.
- Component B (karaoke scroll) needs the renderer to draw multi-line highlighted lyrics
  **and** an animation pump that drives frames at FPS while the scroll offset eases toward
  its target.

## Settings model (new)

Add to `settings-store` (both persisted via the existing `PERSISTED_KEYS` mechanism):

- `hymnFollowMode: "off" | "slides" | "karaoke"` — default `"slides"`. Source of truth for
  whether/how the live output follows the singing. Supersedes the unsaved `autoDisplay`
  flag in `hymn-store` (panel switch becomes a mirror: on ⇒ last non-off mode, off ⇒
  `"off"`).
- `hymnFollowResponsiveness: "relaxed" | "balanced" | "snappy"` — default `"balanced"`.
  Maps to the detection poll interval: relaxed 1500 ms, balanced 900 ms, snappy 500 ms.

Settings-dialog UI: a new "Hymn projection" section with a segmented control for the mode
(Off / Slides / Karaoke) and a dropdown (or segmented control) for responsiveness.

## Component A — Slide-follow engine (build first)

**Files:** `src/hooks/use-hymn-detection.ts` (refactor), `src/hooks/use-hymn-detection.test.ts` (new).

- Extract the slide-picking heuristic (today inlined as `bestSlideIndex`) into a pure,
  exported function:

  ```ts
  // Returns the index to switch to, or null for "stay on currentIndex".
  nextSlideIndex(slides: HymnSlide[], transcript: string, currentIndex: number): number | null
  ```

  Rules:
  - Score each slide by word-overlap with the heard transcript (lowercased, stripped,
    words length > 2), as today.
  - Switch only when the best slide differs from `currentIndex` **and** its score is
    non-trivial (≥ `MIN_SLIDE_OVERLAP`, e.g. 2 matched words) and beats the current
    slide's score. Otherwise return `null` (anti-jitter; ignore garbled/empty windows).

- Refactor the hook to separate **which hymn** from **which slide**:
  - New confident hymn (stable for `STABLE_POLLS`) → load detail, cache `{ id, slides }`
    in a ref, project the best slide, reset the slide pointer.
  - Same hymn continues → every poll, recompute `nextSlideIndex` against the cached slides
    and re-project via the existing `setSlideIndex` + `goLiveSlide` only when it returns a
    new index. Naturally handles chorus-after-each-verse and out-of-order verses without
    duplicating data.
  - Song ends (no candidate for `STABLE_POLLS`) → clear detections, **leave the last slide
    on screen** (no blanking), reset follow-state so the next song starts clean.
  - Replace the `lastShownRef` guard accordingly; gate on `hymnFollowMode !== "off"`.
  - Poll interval derives from `hymnFollowResponsiveness`.

**Tests:** `nextSlideIndex` directly — verse→chorus→verse following, chorus repeat
(returns to the single refrain slide), no-overlap noise (returns `null`), and a clear new
match (returns the new index).

This component alone delivers "detect → follow → switch through verses till the song ends"
in slide mode, with no renderer changes.

## Component B — Spotify karaoke mode (build second)

Active when `hymnFollowMode === "karaoke"`.

- **Payload:** extend the broadcast `verse-update` payload with an optional `karaoke` block
  (full ordered lyric lines + `currentLineIndex`), kept backward-compatible so verse/slide
  rendering is unchanged when the block is absent. Carried via the existing
  `liveOverride` → `syncBroadcastOutput` path.
- **Matching:** reuse the overlap matcher at **line granularity** to choose
  `currentLineIndex` from the live transcript.
- **Renderer:** a new draw path (extend `verse-renderer` or a sibling `karaoke-renderer`)
  that lays out N lines, highlights the active line (bright/larger), dims past/upcoming
  lines, and vertically offsets so the active line is centered.
- **Animation pump:** in `BroadcastCanvas`, when a karaoke payload is active, run a
  `requestAnimationFrame` loop that eases the scroll offset toward its target and pushes
  NDI frames at the configured FPS; otherwise keep the current event-driven push.

**Tests:** unit-test the line matcher and the layout/offset math. Manually verify
scroll + highlight on the live output (and NDI if available).

## Risks / mitigations

- **Jitter from noisy ASR** → overlap floor + "only switch on a clearly better match";
  hymn-level `STABLE_POLLS` already debounces song identity.
- **Karaoke scroll perf / NDI throughput** → ease toward target, cap redraw at configured
  FPS, only run the rAF loop while a karaoke payload is live.
- **Latency expectations** → documented as a non-goal; responsiveness setting lets the
  operator trade lag for CPU.

## Verification

- `bun x vitest run` (new + existing hymn tests green), `bun run typecheck`.
- Manual: `bun run tauri dev`, sing/feed a transcript for Hymn 728, confirm slide mode
  advances through verse 1 → refrain → verse 2 → verse 3; switch to karaoke mode and
  confirm the active line highlights and scrolls.
