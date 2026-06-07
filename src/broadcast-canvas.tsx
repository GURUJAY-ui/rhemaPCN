import { useRef, useEffect, useCallback } from "react"
import { createRoot } from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { renderVerse } from "@/lib/verse-renderer"
import { renderKaraoke, karaokeTargetScrollY } from "@/lib/karaoke-renderer"
import { OUTPUT_ID, uint8ToBase64 } from "@/lib/broadcast-utils"
import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"
import type { NdiConfigEventPayload, NdiFrameRequest } from "@/types"

interface BroadcastPayload {
  theme: BroadcastTheme
  verse: VerseRenderData | null
}

export function BroadcastCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestData = useRef<BroadcastPayload | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const ndiConfigRef = useRef<NdiConfigEventPayload>({
    active: false,
    fps: 24,
    width: 1920,
    height: 1080,
  })
  const ndiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastPushRef = useRef(0)
  const pushingRef = useRef(false)
  const scrollYRef = useRef(0) // eased karaoke scroll offset
  const rafRef = useRef<number | null>(null) // active animation-frame id

  const logDebug = useCallback((message: string, meta?: unknown) => {
    if (!import.meta.env.DEV) return
    if (meta === undefined) {
      console.debug(`[broadcast-output] ${message}`)
      return
    }
    console.debug(`[broadcast-output] ${message}`, meta)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const data = latestData.current
    if (!data) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }

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
  }, [logDebug])

  const preloadBackgroundImage = useCallback(
    (theme: BroadcastTheme) => {
      const bg = theme.background
      if (bg.type !== "image" || !bg.image?.url) return

      const url = bg.image.url
      const cache = imageCacheRef.current
      if (cache.has(url)) return

      const img = new Image()
      img.onload = () => {
        cache.set(url, img)
        logDebug("Background image loaded", { url })
        draw()
      }
      img.onerror = () => {
        console.warn("[broadcast-output] failed to load background image", { url })
      }
      img.src = url
    },
    [draw, logDebug],
  )

  const pushNdiFrame = useCallback(async () => {
    if (!ndiConfigRef.current.active) return
    if (pushingRef.current) return
    pushingRef.current = true

    try {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const targetWidth = ndiConfigRef.current.width
      const targetHeight = ndiConfigRef.current.height

      let sourceCtx = ctx
      let sourceWidth = canvas.width
      let sourceHeight = canvas.height

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        const ndiCanvas = ndiCanvasRef.current ?? document.createElement("canvas")
        ndiCanvas.width = targetWidth
        ndiCanvas.height = targetHeight
        const ndiCtx = ndiCanvas.getContext("2d")
        if (!ndiCtx) return
        ndiCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
        ndiCanvasRef.current = ndiCanvas
        sourceCtx = ndiCtx
        sourceWidth = targetWidth
        sourceHeight = targetHeight
      }

      const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight)
      const rgbaBase64 = uint8ToBase64(imageData.data)

      const request: NdiFrameRequest = {
        outputId: OUTPUT_ID,
        width: sourceWidth,
        height: sourceHeight,
        rgbaBase64,
      }

      await invoke("push_ndi_frame", { request })
      lastPushRef.current = Date.now()
    } catch (error) {
      console.warn("[broadcast-output] push_ndi_frame failed", error)
    } finally {
      pushingRef.current = false
    }
  }, [])

  const pushNdiBurst = useCallback(() => {
    void pushNdiFrame()
    setTimeout(() => void pushNdiFrame(), 150)
    setTimeout(() => void pushNdiFrame(), 300)
  }, [pushNdiFrame])

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 1920
      canvas.height = 1080
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, 1920, 1080)
      }
    }

    const currentWindow = getCurrentWebviewWindow()
    logDebug("Listener registration started", { label: currentWindow.label })
    const unlisten = currentWindow.listen<BroadcastPayload>("broadcast:verse-update", (event) => {
      latestData.current = event.payload
      preloadBackgroundImage(event.payload.theme)
      logDebug("Received broadcast:verse-update", {
        hasVerse: Boolean(event.payload.verse),
        themeId: event.payload.theme.id,
      })
      draw()
      pushNdiBurst()
    })

    const unlistenNdiConfig = currentWindow.listen<NdiConfigEventPayload>("broadcast:ndi-config", (event) => {
      ndiConfigRef.current = event.payload
      logDebug("Received broadcast:ndi-config", event.payload)
      if (event.payload.active) pushNdiBurst()
    })

    void invoke<{ active: boolean; width: number; height: number; fps: number } | null>("get_ndi_status", { outputId: OUTPUT_ID })
      .then((status) => {
        if (status && status.active) {
          ndiConfigRef.current = {
            active: true,
            fps: status.fps,
            width: status.width,
            height: status.height,
          }
          logDebug("Fetched NDI status on mount", status)
        }
      })
      .catch(() => {
        // Command may not exist yet
      })

    void currentWindow.emitTo("main", "broadcast:output-ready").then(() => {
      logDebug("Sent broadcast:output-ready")
    }).catch(() => {
      console.warn("[broadcast-output] failed to send output-ready event")
    })

    return () => {
      unlisten.then((fn) => fn())
      unlistenNdiConfig.then((fn) => fn())
    }
  }, [draw, logDebug, preloadBackgroundImage, pushNdiFrame, pushNdiBurst])

  useEffect(() => {
    const timer = setInterval(() => {
      if (!ndiConfigRef.current.active) return
      const elapsed = Date.now() - lastPushRef.current
      if (elapsed > 2000) void pushNdiFrame()
    }, 2000)
    return () => clearInterval(timer)
  }, [pushNdiFrame])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100vw",
        height: "100vh",
        display: "block",
        objectFit: "contain",
      }}
    />
  )
}

const root = document.getElementById("broadcast-root")!
createRoot(root).render(<BroadcastCanvas />)
