"use client"

import { useState, type ReactNode } from "react"

import { resolveHref, type FigureBlock } from "@/lib/data"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { useArticleContext } from "./article-context"
import { InlineWithPages } from "./inline-pages"

export interface Size {
  w: number
  h: number
}

const STORAGE_KEY = "glossator:figure-sizes"
const sizes = new Map<string, Size>()
let restored = false

/**
 * A figure's natural size once seen, remembered across visits: its image then has its final shape
 * (its width and height attributes) before it loads, so nothing below it moves.
 */
export function knownSize(src: string): Size | null {
  if (!restored && typeof window !== "undefined") {
    restored = true
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")
      if (saved && typeof saved === "object") {
        for (const [k, v] of Object.entries(saved)) {
          const s = v as Partial<Size> | null
          if (s && typeof s.w === "number" && typeof s.h === "number" && s.w > 0 && s.h > 0) {
            sizes.set(k, { w: s.w, h: s.h })
          }
        }
      }
    } catch {
      // storage unavailable (private mode, blocked): the images find their size as they load
    }
  }
  return sizes.get(src) ?? null
}

export function rememberSize(src: string, img: HTMLImageElement): Size | null {
  const size = { w: img.naturalWidth, h: img.naturalHeight }
  if (size.w <= 0 || size.h <= 0) return null
  const was = sizes.get(src)
  if (was?.w === size.w && was.h === size.h) return size
  sizes.set(src, size)
  try {
    const entries = [...sizes.entries()].slice(-400)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // not remembered: the next visit finds the size again
  }
  return size
}

/**
 * A figure's image as a served URL: only this library's own files load by themselves (an image on
 * another site would tell it that this page was opened); `external` is a web address to follow.
 */
export function figureSource(block: Pick<FigureBlock, "src">): {
  src: string | null
  external: string | null
} {
  const link = resolveHref(block.src)
  return {
    src: link?.kind === "file" ? link.href : null,
    external: link?.kind === "external" ? link.href : null,
  }
}

/**
 * A figure of a section: the image at its own size, never enlarged beyond it (white, as papers print
 * them, in both themes), its caption under it; a click shows it in the lightbox.
 */
export function FigureBlockView({ block, pdf }: { block: FigureBlock; pdf: string | null }) {
  const { openFigure } = useArticleContext()
  const { src, external } = figureSource(block)
  const [size, setSize] = useState<Size | null>(() => (src ? knownSize(src) : null))
  const [failed, setFailed] = useState(false)
  const alt = typeset(block.alt || "Figure")
  const caption =
    block.caption.length > 0 ? <InlineWithPages parts={block.caption} pdf={pdf} /> : null

  if (external) {
    return (
      <figure className="my-6 first:mt-0 last:mb-0">
        <p className="font-sans text-small text-muted-foreground">
          {alt}: the image is on another site.{" "}
          <a href={external} target="_blank" rel="noopener noreferrer" className="link">
            Open the image
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
        {caption ? <Caption>{caption}</Caption> : null}
      </figure>
    )
  }

  if (!src || failed) {
    return (
      <figure className="my-6 first:mt-0 last:mb-0">
        <p
          role="img"
          aria-label={`${alt} (image not available)`}
          className="border-y border-border py-6 text-center font-serif text-note text-muted-foreground"
        >
          The image of this figure is not on this computer.
        </p>
        {caption ? <Caption>{caption}</Caption> : null}
      </figure>
    )
  }

  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- a static export: images are served as they are
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={size?.w}
      height={size?.h}
      className="block h-auto max-w-full bg-white"
      onLoad={(e) => {
        const seen = rememberSize(src, e.currentTarget)
        if (seen && (seen.w !== size?.w || seen.h !== size?.h)) setSize(seen)
      }}
      onError={() => setFailed(true)}
    />
  )
  return (
    <figure className="my-6 first:mt-0 last:mb-0">
      {openFigure ? (
        <button
          type="button"
          onClick={() => openFigure(src)}
          aria-label={`${alt}: enlarge`}
          aria-haspopup="dialog"
          className="block max-w-full cursor-zoom-in"
        >
          {image}
        </button>
      ) : (
        image
      )}
      {caption ? <Caption>{caption}</Caption> : null}
    </figure>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return <figcaption className={cn("mt-2.5 max-w-measure gloss")}>{children}</figcaption>
}
