"use client"

import { plainText } from "@/lib/data"
import { typeset } from "@/lib/typeset"

import type { FigureRef } from "./article-model"
import { figureSource, knownSize } from "./figure-block"
import { firstPageRef } from "./page-refs"

/**
 * Every figure of the article as a thumbnail, in a row that scrolls sideways on narrow screens:
 * its name ("Fig. 2") and page, the section it is in. A click opens the lightbox there.
 */
export function FiguresStrip({
  figures,
  onOpen,
}: {
  figures: readonly FigureRef[]
  onOpen: (index: number) => void
}) {
  return (
    <ul className="-mx-1 flex snap-x [scrollbar-width:thin] gap-5 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-3">
      {figures.map((figure, i) => {
        const { src } = figureSource(figure.block)
        const size = src ? knownSize(src) : null
        const page = firstPageRef(plainText(figure.block.caption))
        const name = figure.name ?? `Figure ${i + 1}`
        const alt = typeset(figure.block.alt || name)
        return (
          <li key={i} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-haspopup="dialog"
              aria-label={`${name}${page ? `, ${page.doc ? "SI " : ""}${page.text}` : ""}: ${alt}. Enlarge`}
              className="group/thumb block text-left"
            >
              <span className="flex h-28 items-center justify-center overflow-hidden bg-white outline outline-1 -outline-offset-1 outline-border transition-[outline-color] duration-150 group-hover/thumb:outline-input">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a static export: images are served as they are
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={size?.w}
                    height={size?.h}
                    className="block h-full w-auto max-w-[15rem] object-contain"
                  />
                ) : (
                  <span className="px-6 font-serif text-ui text-muted-foreground">No image</span>
                )}
              </span>
              <span className="mt-1.5 flex max-w-[15rem] items-baseline gap-1.5 font-sans text-small">
                <span className="font-medium text-foreground">{name}</span>
                {page ? (
                  <span className="text-rubric [font-variant-numeric:oldstyle-nums]">
                    {page.doc ? "SI " : ""}
                    {typeset(page.text)}
                  </span>
                ) : null}
                <span className="truncate-fade min-w-0 text-muted-foreground">
                  {typeset(figure.section.title)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
