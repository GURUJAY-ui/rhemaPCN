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
