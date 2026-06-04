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
