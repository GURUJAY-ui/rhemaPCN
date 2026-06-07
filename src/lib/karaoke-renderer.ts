import type { BroadcastTheme } from "@/types/broadcast"

export interface KaraokeData {
  lines: string[]
  currentLine: number
}

/** Font size for karaoke lines, in px (scales with output height). */
export function karaokeFontSize(theme: BroadcastTheme): number {
  return Math.round(theme.resolution.height * 0.06)
}

/** Vertical distance between karaoke lines, in px. */
export function karaokeLineGap(theme: BroadcastTheme): number {
  return Math.round(karaokeFontSize(theme) * 1.8)
}

/** Scroll offset that places `currentLine` at the vertical center. */
export function karaokeTargetScrollY(theme: BroadcastTheme, currentLine: number): number {
  return currentLine * karaokeLineGap(theme)
}

/**
 * Draw the full lyric as a vertically-scrolling list with the current line
 * bright/large and neighbours progressively dimmed. `scrollY` is supplied by
 * the caller (eased each animation frame) so the active line eases to center.
 */
export function renderKaraoke(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  data: KaraokeData,
  scrollY: number,
): void {
  const W = theme.resolution.width
  const H = theme.resolution.height

  // Background.
  if (theme.background.type === "transparent") {
    ctx.clearRect(0, 0, W, H)
  } else {
    ctx.fillStyle = theme.background.type === "solid" ? theme.background.color : "#000000"
    ctx.fillRect(0, 0, W, H)
  }

  const fontSize = karaokeFontSize(theme)
  const lineGap = karaokeLineGap(theme)
  const centerY = H / 2
  const family = theme.verseText.fontFamily
  const color = theme.verseText.color || "#ffffff"

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  data.lines.forEach((line, i) => {
    const y = centerY + i * lineGap - scrollY
    if (y < -lineGap || y > H + lineGap) return // cull offscreen lines
    const isCurrent = i === data.currentLine
    const dist = Math.abs(i - data.currentLine)
    const size = isCurrent ? Math.round(fontSize * 1.15) : fontSize
    ctx.font = `${isCurrent ? 700 : 500} ${size}px "${family}", sans-serif`
    ctx.globalAlpha = isCurrent ? 1 : Math.max(0.25, 0.7 - dist * 0.15)
    ctx.fillStyle = color
    ctx.fillText(line, W / 2, y)
  })

  ctx.globalAlpha = 1
}
