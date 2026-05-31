import { useEffect, useMemo, useRef, useState } from "react"
import {
  MusicIcon,
  SearchIcon,
  RadioIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "lucide-react"

import { PanelHeader } from "@/components/ui/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useHymns, hymnActions, hymnReference } from "@/hooks/use-hymns"
import type { LinesPerSlide } from "@/stores/hymn-store"
import type { Hymn } from "@/types"

const SLIDE_OPTIONS: { value: LinesPerSlide; label: string }[] = [
  { value: "stanza", label: "Stanza" },
  { value: 2, label: "2" },
  { value: 4, label: "4" },
  { value: 6, label: "6" },
]

function HymnRow({
  hymn,
  active,
  onClick,
}: {
  hymn: Hymn
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-baseline gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-accent/50",
        active && "bg-accent"
      )}
    >
      <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
        {hymn.number ?? "—"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{hymn.title}</span>
        {hymn.category && (
          <span className="block truncate text-[0.625rem] uppercase tracking-wide text-muted-foreground">
            {hymn.category}
          </span>
        )}
      </span>
    </button>
  )
}

export function HymnsPanel() {
  const {
    hymns,
    searchResults,
    query,
    selected,
    slideIndex,
    linesPerSlide,
    detections,
    autoDisplay,
    setQuery,
    setSlideIndex,
    setLinesPerSlide,
    setAutoDisplay,
  } = useHymns()

  const [loaded, setLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void hymnActions.loadHymnals()
    void hymnActions.loadHymns().then(() => setLoaded(true))
  }, [])

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) return
    debounceRef.current = setTimeout(() => {
      void hymnActions.searchHymns(query.trim())
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const list = query.trim() ? searchResults : hymns

  const slides = useMemo(
    () => (selected ? hymnActions.buildSlides(selected, selected.stanzas, linesPerSlide) : []),
    [selected, linesPerSlide]
  )
  const clampedIndex = Math.min(slideIndex, Math.max(0, slides.length - 1))
  const slide = slides[clampedIndex]

  return (
    <div
      data-slot="hymns-panel"
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader title="Hymns" icon={<MusicIcon className="size-3.5" />}>
        <label className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
          Auto-display
          <Switch checked={autoDisplay} onCheckedChange={setAutoDisplay} />
        </label>
      </PanelHeader>

      {/* Live detection banner */}
      {detections.length > 0 && (
        <div className="border-b border-border bg-accent/40 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
            <RadioIcon className="size-3 animate-pulse text-red-500" />
            Detected from singing
          </p>
          <div className="flex flex-col gap-1">
            {detections.slice(0, 3).map((m) => (
              <button
                key={m.id}
                onClick={() => void hymnActions.getHymn(m.id)}
                className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted-foreground">{hymnReference(m)} · </span>
                  {m.title}
                </span>
                <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
                  {Math.round(m.confidence * 100)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left: search + list */}
        <div className="flex w-1/2 min-h-0 min-w-0 flex-col border-r border-border">
          <div className="relative border-b border-border p-2">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or lyrics…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!loaded && (
              <p className="p-4 text-center text-xs text-muted-foreground">Loading hymns…</p>
            )}
            {loaded && list.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {query.trim() ? "No hymns match your search." : "No hymns imported yet."}
              </p>
            )}
            {list.map((h) => (
              <HymnRow
                key={h.id}
                hymn={h}
                active={selected?.id === h.id}
                onClick={() => void hymnActions.getHymn(h.id)}
              />
            ))}
          </div>
        </div>

        {/* Right: selected hymn */}
        <div className="flex w-1/2 min-h-0 min-w-0 flex-col">
          {!selected ? (
            <p className="m-auto p-4 text-center text-xs text-muted-foreground">
              Select a hymn to view its stanzas.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selected.number != null && (
                      <span className="text-muted-foreground">{selected.number}. </span>
                    )}
                    {selected.title}
                  </p>
                  {selected.author && (
                    <p className="truncate text-[0.625rem] text-muted-foreground">{selected.author}</p>
                  )}
                </div>
                {/* Lines-per-slide control */}
                <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
                  {SLIDE_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setLinesPerSlide(opt.value)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors",
                        linesPerSlide === opt.value
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title={opt.value === "stanza" ? "Whole stanza per slide" : `${opt.value} lines per slide`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {slide ? (
                  <>
                    <p className="mb-1 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                      {slide.reference} · slide {clampedIndex + 1}/{slides.length}
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                      {slide.text}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">This hymn has no stanzas.</p>
                )}
              </div>

              {slide && (
                <div className="flex items-center gap-1 border-t border-border p-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    disabled={clampedIndex === 0}
                    onClick={() => setSlideIndex(clampedIndex - 1)}
                  >
                    <ChevronUpIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    disabled={clampedIndex >= slides.length - 1}
                    onClick={() => setSlideIndex(clampedIndex + 1)}
                  >
                    <ChevronDownIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="ml-auto gap-1.5"
                    onClick={() => hymnActions.goLiveSlide(slide)}
                  >
                    <RadioIcon className="size-3.5" />
                    Go Live
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
