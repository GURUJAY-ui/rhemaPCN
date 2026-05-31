import { TransportBar } from "@/components/controls/transport-bar"
import { TranscriptPanel } from "@/components/panels/transcript-panel"
import { PreviewPanel } from "@/components/panels/preview-panel"
import { LiveOutputPanel } from "@/components/panels/live-output-panel"
import { QueuePanel } from "@/components/panels/queue-panel"
import { SearchPanel } from "@/components/panels/search-panel"
import { DetectionsPanel } from "@/components/panels/detections-panel"
import { HymnsPanel } from "@/components/panels/hymns-panel"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export function Dashboard() {
  return (
    <div
      style={{
        position: "fixed",
        inset: "0px",
        display: "grid",
        gridTemplateRows: "56px minmax(0, 2fr) minmax(0, 3fr)",
        overflow: "hidden",
      }}
      className="bg-background"
    >
      {/* Row 1: Transport Bar */}
      <div className="col-span-4">
        <TransportBar />
      </div>

      {/* Row 2: 4 panels */}
      <div
        className="col-span-4 min-h-0 *:min-h-0"
        style={{
          padding: "12px",
          display: "grid",
          gap: "12px",
          minHeight: 0,
          overflow: "hidden",
          gridTemplateColumns: "320px minmax(0, 1fr) minmax(0, 1fr) 320px",
          gridTemplateRows: "minmax(0, 1fr)",
        }}
      >
        <TranscriptPanel />
        <PreviewPanel />
        <LiveOutputPanel />
        <QueuePanel />
      </div>
      {/* Row 3: Search + Detections (own grid, independent of top row columns) */}
      <div className="col-span-4 grid min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3 px-3 pb-3">
        <Tabs defaultValue="bible" className="flex h-full min-h-0 min-w-0 flex-col gap-2">
          <TabsList variant="line" className="h-8 shrink-0 self-start">
            <TabsTrigger value="bible">Bible</TabsTrigger>
            <TabsTrigger value="hymns">Hymns</TabsTrigger>
          </TabsList>
          <TabsContent value="bible" className="min-h-0 min-w-0">
            <SearchPanel />
          </TabsContent>
          <TabsContent value="hymns" className="min-h-0 min-w-0">
            <HymnsPanel />
          </TabsContent>
        </Tabs>
        <DetectionsPanel />
      </div>
    </div>
    // <div
    //   style={{
    //     position: "fixed",
    //     inset: "6px",
    //     display: "grid",
    //     gridTemplateColumns: "320px 1fr 1fr 340px",
    //     gridTemplateRows: "64px 2fr 3fr",
    //     gap: "6px",
    //     overflow: "hidden",
    //   }}
    //   className="bg-background"
    // >
    //   {/* Row 1: Transport Bar */}
    //   <div className="col-span-4">
    //     <TransportBar />
    //   </div>

    //   {/* Row 2: 4 panels */}
    //   <TranscriptPanel />
    //   <PreviewPanel />
    //   <LiveOutputPanel />
    //   <QueuePanel />

    //   {/* Row 3: Search + Detections (own grid, independent of top row columns) */}
    //   <div className="col-span-4 grid min-h-0 grid-cols-[2fr_1fr] gap-[6px]">
    //     <SearchPanel />
    //     <DetectionsPanel />
    //   </div>
    // </div>
  )
}
