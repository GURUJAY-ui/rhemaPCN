import { useEffect, useRef, useState } from "react"
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
import type { Hymn } from "@/types"

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
    stanzaIndex,
    detections,
    autoDisplay,
    setQuery,
    setStanzaIndex,
    nextStanza,
    prevStanza,
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
  const stanza = selected?.stanzas[stanzaIndex]

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
        <div className="flex w-1/2 min-w-0 flex-col border-r border-border">
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
        <div className="flex w-1/2 min-w-0 flex-col">
          {!selected ? (
            <p className="m-auto p-4 text-center text-xs text-muted-foreground">
              Select a hymn to view its stanzas.
            </p>
          ) : (
            <>
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-semibold text-foreground">
                  {selected.number != null && (
                    <span className="text-muted-foreground">{selected.number}. </span>
                  )}
                  {selected.title}
                </p>
                {selected.author && (
                  <p className="text-[0.625rem] text-muted-foreground">{selected.author}</p>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {stanza ? (
                  <>
                    <p className="mb-1 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                      {stanza.kind === "verse"
                        ? `Verse ${stanza.label ?? stanza.position}`
                        : stanza.label ?? stanza.kind}{" "}
                      · {stanzaIndex + 1}/{selected.stanzas.length}
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                      {stanza.text}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">This hymn has no stanzas.</p>
                )}
              </div>

              {stanza && (
                <div className="flex items-center gap-1 border-t border-border p-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    disabled={stanzaIndex === 0}
                    onClick={prevStanza}
                  >
                    <ChevronUpIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    disabled={stanzaIndex >= selected.stanzas.length - 1}
                    onClick={nextStanza}
                  >
                    <ChevronDownIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="ml-auto gap-1.5"
                    onClick={() => {
                      hymnActions.goLiveWithStanza(selected, stanza)
                      setStanzaIndex(stanzaIndex)
                    }}
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
