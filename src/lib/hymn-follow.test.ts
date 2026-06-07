import { describe, expect, it } from "vitest"
import {
  bestIndex,
  nextIndex,
  flattenLines,
  recentLyricWindow,
  hymnKeyterms,
  pollIntervalFor,
  MIN_OVERLAP,
} from "./hymn-follow"
import type { HymnStanza } from "@/types"

const stanza = (over: Partial<HymnStanza>): HymnStanza => ({
  id: 1, position: 1, kind: "verse", label: "1", text: "", ...over,
})

describe("pollIntervalFor", () => {
  it("maps responsiveness to ms", () => {
    expect(pollIntervalFor("relaxed")).toBe(1200)
    expect(pollIntervalFor("balanced")).toBe(700)
    expect(pollIntervalFor("snappy")).toBe(350)
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
    "Great is Thy faithfulness O God my Father",
    "Great is Thy faithfulness morning by morning",
    "Pardon for sin and a peace that endureth",
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

describe("hymnKeyterms", () => {
  const detail = {
    title: "Great Is Thy Faithfulness",
    stanzas: [
      { text: "Great is Thy faithfulness, O God my Father\nThere is no shadow of turning" },
      { text: "Morning by morning new mercies I see" },
    ],
  }

  it("extracts distinctive content words, lowercased and de-duplicated", () => {
    const terms = hymnKeyterms(detail)
    expect(terms).toContain("faithfulness")
    expect(terms).toContain("father")
    expect(terms).toContain("mercies")
    // de-duplicated: "great" appears in title and verse 1 but only once
    expect(terms.filter((t) => t === "great")).toHaveLength(1)
  })

  it("skips short words and stop words", () => {
    const terms = hymnKeyterms(detail)
    expect(terms).not.toContain("is") // short
    expect(terms).not.toContain("thy") // short
    expect(terms).not.toContain("the") // stop word
    expect(terms).not.toContain("there") // stop word
    expect(terms.every((t) => t.length >= 4)).toBe(true)
  })

  it("caps the number of terms", () => {
    const big = { title: "x", stanzas: [{ text: "alpha bravo charlie delta echo foxtrot golf" }] }
    expect(hymnKeyterms(big, 3)).toEqual(["alpha", "bravo", "charlie"])
  })
})

describe("recentLyricWindow", () => {
  const now = 100_000

  it("drops segments older than maxAgeMs (stale speech ages out)", () => {
    const segments = [
      { text: "old garbage words", timestamp: 0 }, // 100s old -> dropped
      { text: "great is thy", timestamp: now - 1000 }, // fresh
    ]
    expect(recentLyricWindow(segments, "faithfulness", now, 20_000)).toBe(
      "great is thy faithfulness",
    )
  })

  it("includes the live partial after the fresh segments", () => {
    const segments = [{ text: "morning by morning", timestamp: now - 500 }]
    expect(recentLyricWindow(segments, "new mercies I see", now)).toBe(
      "morning by morning new mercies I see",
    )
  })

  it("caps the window to the last windowWords words", () => {
    const segments = [{ text: "a b c d e", timestamp: now }]
    expect(recentLyricWindow(segments, "f g", now, 20_000, 4)).toBe("d e f g")
  })

  it("returns empty string when nothing is fresh", () => {
    const segments = [{ text: "ancient", timestamp: 0 }]
    expect(recentLyricWindow(segments, "", now, 20_000)).toBe("")
  })
})
