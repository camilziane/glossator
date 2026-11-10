"use client"

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useState, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { useRestoreFocus } from "@/hooks/use-restore-focus"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import type { FigureRef } from "./article-model"
import { figureSource, knownSize, rememberSize, type Size } from "./figure-block"
import { InlineWithPages } from "./inline-pages"

/** A control on the dark scrim: paper-coloured, its focus outline too. */
const ON_SCRIM =
  "text-inherit hover:bg-white/10 focus-visible:outline-[oklch(0.95_0.01_85)] active:bg-white/15"

/** A figure zooms (a click, at the pointer) only when it is this much larger than shown. */
const ZOOM_FROM = 1.5
/** The largest zoom (never past the image's own size). */
const MAX_ZOOM = 3

/**
 * The size the figure is shown at: its own size, made smaller to fit the window (room left for the
 * controls above and the caption below), never larger. Null before its size is known.
 */
function useFit(size: Size | null): { w: number; h: number } | null {
  const [win, setWin] = useState(() =>
    typeof window === "undefined" ? null : { w: window.innerWidth, h: window.innerHeight }
  )
  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  if (!size || !win) return null
  const pad = win.w >= 640 ? 64 : 24
  const room = { w: win.w - pad, h: win.h - pad - 56 - 112 }
  const scale = Math.min(1, room.w / size.w, Math.max(160, room.h) / size.h)
  return { w: Math.round(size.w * scale), h: Math.round(size.h * scale) }
}

/**
 * The lightbox of an article's figures: a dark scrim, the figure on paper at its natural size (never
 * enlarged to fill the window; smaller when the window is), the panel as wide as the figure, its
 * caption and page under it. When the figure is shown at two thirds of its size or less, a click
 * zooms it to its own size at the pointer (the pointer then moves over it); ← → go through the
 * article's figures.
 */
export function FigureLightbox({
  figures,
  index,
  onIndexChange,
  pdf,
}: {
  figures: readonly FigureRef[]
  /** The figure shown, or null when the lightbox is closed. */
  index: number | null
  onIndexChange: (index: number | null) => void
  pdf: string | null
}) {
  const restore = useRestoreFocus()
  const figure = index === null ? undefined : figures[index]
  const count = figures.length
  const go = (step: number) => {
    if (index === null || count < 2) return
    onIndexChange((index + step + count) % count)
  }
  return (
    <Dialog open={figure !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogPortal>
        <DialogOverlay className="bg-[oklch(0.15_0.01_60/0.85)] dark:bg-[oklch(0.15_0.01_60/0.85)]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={restore.onOpenAutoFocus}
          onCloseAutoFocus={restore.onCloseAutoFocus}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault()
              go(e.key === "ArrowLeft" ? -1 : 1)
            }
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-3 outline-none data-[state=closed]:animate-[fade-out_120ms_var(--ease-in)_both] data-[state=open]:animate-[fade-in_200ms_var(--ease-out)_both] sm:p-8"
        >
          {figure ? (
            <Shown
              key={index}
              figure={figure}
              pdf={pdf}
              position={index === null ? 0 : index + 1}
              count={count}
              onStep={go}
            />
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

function Shown({
  figure,
  pdf,
  position,
  count,
  onStep,
}: {
  figure: FigureRef
  pdf: string | null
  position: number
  count: number
  onStep: (step: number) => void
}) {
  const { src } = figureSource(figure.block)
  const [size, setSize] = useState<Size | null>(() => (src ? knownSize(src) : null))
  const [zoomed, setZoomed] = useState(false)
  const [origin, setOrigin] = useState("50% 50%")
  const fit = useFit(size)
  // Zoom only where there is more to see: the image at least half as large again as shown.
  const zoom =
    size && fit && size.w >= ZOOM_FROM * fit.w ? Math.min(MAX_ZOOM, size.w / fit.w) : null
  const alt = typeset(figure.block.alt || "Figure")
  const at = (e: MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * 100
    const y = ((e.clientY - box.top) / box.height) * 100
    setOrigin(
      `${Math.min(100, Math.max(0, x)).toFixed(1)}% ${Math.min(100, Math.max(0, y)).toFixed(1)}%`
    )
  }
  return (
    <>
      <div className="flex w-full max-w-[min(100%,84rem)] items-center justify-end gap-1 text-[oklch(0.95_0.01_85)]">
        {count > 1 ? (
          <>
            <span className="mr-2 font-sans text-ui num" aria-live="polite">
              {position} of {count}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onStep(-1)}
              aria-label="Previous figure"
              aria-keyshortcuts="ArrowLeft"
              className={ON_SCRIM}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onStep(1)}
              aria-label="Next figure"
              aria-keyshortcuts="ArrowRight"
              className={ON_SCRIM}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </>
        ) : null}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close" className={ON_SCRIM}>
            <XIcon aria-hidden="true" />
          </Button>
        </DialogPrimitive.Close>
      </div>
      {/* The panel takes the image's width (at least 20 rem, for the caption). */}
      <div
        className="flex min-h-0 max-w-full flex-col bg-background shadow-popover"
        style={fit ? { width: `max(${fit.w}px, min(20rem, 100%))` } : undefined}
      >
        <div
          className={cn(
            "flex min-h-0 justify-center overflow-hidden bg-white",
            zoom && (zoomed ? "cursor-zoom-out" : "cursor-zoom-in")
          )}
          onPointerMove={zoomed ? at : undefined}
          onClick={(e) => {
            if (!zoom) return
            at(e)
            setZoomed((z) => !z)
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- the Zoom button does the same as a click, from the keyboard
            <img
              src={src}
              alt={alt}
              width={size?.w}
              height={size?.h}
              onLoad={(e) => {
                const seen = rememberSize(src, e.currentTarget)
                if (seen) setSize(seen)
              }}
              style={{
                width: fit ? `${fit.w}px` : undefined,
                height: fit ? `${fit.h}px` : undefined,
                maxWidth: "100%",
                maxHeight: "calc(100svh - 11rem)",
                transform: zoomed && zoom ? `scale(${zoom})` : undefined,
                transformOrigin: origin,
              }}
              className="block object-contain transition-transform duration-200 ease-out motion-reduce:transition-none"
            />
          ) : (
            <p className="p-8 font-serif text-muted-foreground">
              The image of this figure is not on this computer.
            </p>
          )}
        </div>
        <div className="flex max-w-full items-start gap-4 border-t border-border px-4 py-3">
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="min-w-0 flex-1 gloss text-foreground">
              {figure.block.caption.length > 0 ? (
                <InlineWithPages parts={figure.block.caption} pdf={pdf} />
              ) : (
                alt
              )}
              <span className="mt-1 block font-sans text-small text-muted-foreground">
                {figure.section.title}
              </span>
            </div>
          </DialogPrimitive.Description>
          <div className="flex shrink-0 items-center gap-3 pt-0.5 font-sans text-ui">
            {zoom ? (
              <Button
                variant="link"
                size="sm"
                aria-pressed={zoomed}
                onClick={() => {
                  setOrigin("50% 50%")
                  setZoomed((z) => !z)
                }}
              >
                {zoomed ? "Fit" : "Zoom"}
              </Button>
            ) : null}
            {src ? (
              <a href={src} target="_blank" rel="noopener noreferrer" className="link">
                Open image
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
