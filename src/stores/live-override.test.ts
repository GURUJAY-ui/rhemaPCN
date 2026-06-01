import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Verse, VerseRenderData } from "@/types"

// broadcast-store pulls in Tauri event + plugin-store at import; stub them.
vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn(), listen: vi.fn() }))
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const overlay: VerseRenderData = { reference: "Hymn 1 · Verse 1", segments: [{ text: "x" }] }
const verse: Verse = {
  id: 7,
  translation_id: 1,
  book_number: 1,
  book_name: "Genesis",
  book_abbreviation: "Gen",
  chapter: 1,
  verse: 1,
  text: "In the beginning",
}

describe("hymn live-override vs bible verse selection", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("selecting a Bible verse clears the hymn live-override", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const { useBibleStore } = await import("./bible-store")

    useBroadcastStore.getState().setLiveOverride(overlay)
    expect(useBroadcastStore.getState().liveOverride).toEqual(overlay)

    useBibleStore.getState().selectVerse(verse)

    expect(useBroadcastStore.getState().liveOverride).toBeNull()
    expect(useBibleStore.getState().selectedVerse?.id).toBe(7)
  })

  it("clearing the selected verse (null) does NOT clear the override", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const { useBibleStore } = await import("./bible-store")

    useBroadcastStore.getState().setLiveOverride(overlay)
    useBibleStore.getState().selectVerse(null)

    // Only a real verse selection should take the output back from a hymn.
    expect(useBroadcastStore.getState().liveOverride).toEqual(overlay)
  })
})
