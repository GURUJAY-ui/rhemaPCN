import { describe, expect, it, vi } from "vitest"

// use-hymns imports Tauri + stores at module load; stub the Tauri surface so the
// pure helpers (buildSlides / hymnReference) can be imported in a node env.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn(), listen: vi.fn() }))
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }))

import { buildSlides, hymnReference } from "./use-hymns"
import type { Hymn, HymnStanza } from "@/types"

const hymn = (over: Partial<Hymn> = {}): Hymn => ({
  id: 1,
  hymnal_id: 1,
  hymnal_slug: "pcn",
  hymnal_title: "PCN",
  number: 316,
  title: "I Am Not Worthy",
  author: null,
  category: null,
  themes: null,
  scriptures: null,
  source: null,
  ...over,
})

const stanza = (over: Partial<HymnStanza> = {}): HymnStanza => ({
  id: 1,
  position: 1,
  kind: "verse",
  label: "1",
  text: "line one\nline two\nline three\nline four",
  ...over,
})

describe("hymnReference", () => {
  it("uses 'Hymn <number>' for a numbered hymn", () => {
    expect(hymnReference(hymn(), stanza())).toBe("Hymn 316 · Verse 1")
  })

  it("falls back to the title when there is no number", () => {
    expect(hymnReference(hymn({ number: null }))).toBe("I Am Not Worthy")
  })

  it("labels a chorus stanza by its kind/label", () => {
    expect(hymnReference(hymn(), stanza({ kind: "chorus", label: "Chorus" }))).toBe(
      "Hymn 316 · Chorus"
    )
  })

  it("returns just the base when no stanza is given", () => {
    expect(hymnReference(hymn())).toBe("Hymn 316")
  })
})

describe("buildSlides", () => {
  it("stanza mode: one slide per stanza, whole text", () => {
    const s = [stanza(), stanza({ position: 2, label: "2", text: "a\nb" })]
    const slides = buildSlides(hymn(), s, "stanza")
    expect(slides).toHaveLength(2)
    expect(slides[0]).toEqual({ reference: "Hymn 316 · Verse 1", text: s[0].text })
    expect(slides[1].reference).toBe("Hymn 316 · Verse 2")
  })

  it("N-line mode: splits a stanza into pages and marks them", () => {
    const slides = buildSlides(hymn(), [stanza()], 2) // 4 lines -> 2 pages of 2
    expect(slides).toHaveLength(2)
    expect(slides[0]).toEqual({ reference: "Hymn 316 · Verse 1 (1/2)", text: "line one\nline two" })
    expect(slides[1]).toEqual({ reference: "Hymn 316 · Verse 1 (2/2)", text: "line three\nline four" })
  })

  it("N-line mode: no page marker when the stanza fits in one page", () => {
    const slides = buildSlides(hymn(), [stanza({ text: "only one line" })], 4)
    expect(slides).toHaveLength(1)
    expect(slides[0].reference).toBe("Hymn 316 · Verse 1")
  })

  it("does not split lines across stanzas", () => {
    const s = [
      stanza({ text: "a\nb\nc" }),
      stanza({ position: 2, label: "2", text: "d\ne" }),
    ]
    const slides = buildSlides(hymn(), s, 2)
    // stanza1 -> [a,b],[c]  stanza2 -> [d,e]   => 3 slides, none mixing stanzas
    expect(slides.map((x) => x.text)).toEqual(["a\nb", "c", "d\ne"])
  })

  it("returns no slides for a hymn with no stanzas", () => {
    expect(buildSlides(hymn(), [], "stanza")).toEqual([])
  })
})
