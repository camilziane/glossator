"use client"

import { ChevronDownIcon } from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"

import { CiteLine } from "@/components/content/cite"
import { CiteMenu } from "@/components/content/cite-menu"
import { PAGE_GUTTERS } from "@/components/shell/page"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Article } from "@/lib/data"
import { formatNumber } from "@/lib/format"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { Pager } from "./article-header"
import { AT, GRID } from "./grid"
import type { ListPosition } from "./list-position"
import { goToSection, TOC_BAR_ID, TOC_BAR_VAR } from "./use-scroll-spy"

/** The bar's height: 40 px under the top bar. */
const BAR_HEIGHT = "2.5rem"

export interface SectionEntry {
  id: string
  title: string
  /** The record's sections are numbered from 1; the page's own bands (Key metrics, Figures) are not. */
  number?: number
  /** The page's key for it ("m", "f"). */
  key?: string
}

/** Whether the element has scrolled up behind the top bar (it is out of sight above). */
export function useScrolledAway(target: RefObject<HTMLElement | null>): boolean {
  const [away, setAway] = useState(false)
  useEffect(() => {
    const el = target.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const header = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3
    const observer = new IntersectionObserver(
      ([e]) => {
        if (!e) return
        setAway(!e.isIntersecting && e.boundingClientRect.top < header)
      },
      { rootMargin: `-${Math.round(header)}px 0px 0px 0px` }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target])
  return away
}

/**
 * The article's slim bar, once its title has scrolled away: 40 px under the top bar, on the glossed
 * grid: the cite in the margin, the section being read over the text, the Sections menu and the
 * folio (‹ 8 of 49 ›) in the gloss. A 1 px rubric line under it grows with the reading. Out of
 * sight (and out of the keyboard's way) while the title shows.
 */
export function SlimBar({
  article,
  shown,
  sections,
  active,
  onPick,
  place,
  from,
  citeOpen,
  onCiteOpenChange,
}: {
  article: Article
  /** The title has scrolled away (`useScrolledAway`). */
  shown: boolean
  sections: readonly SectionEntry[]
  active: string | null
  onPick: (id: string) => void
  place: ListPosition
  from: string
  /** The Cite menu (`c`) opens here while the bar shows. */
  citeOpen: boolean
  onCiteOpenChange: (open: boolean) => void
}) {
  // While it shows, the bar covers the page's top like the top bar: anchors land below both.
  useEffect(() => {
    const root = document.documentElement
    if (shown) root.style.setProperty(TOC_BAR_VAR, BAR_HEIGHT)
    else root.style.removeProperty(TOC_BAR_VAR)
    return () => {
      root.style.removeProperty(TOC_BAR_VAR)
    }
  }, [shown])
  const index = sections.findIndex((s) => s.id === active)
  const current = index >= 0 ? sections[index] : undefined
  return (
    <div
      id={TOC_BAR_ID}
      data-shown={shown ? "" : undefined}
      inert={!shown}
      aria-hidden={!shown}
      className={cn(
        "fixed inset-x-0 top-[calc(var(--header-height)+env(safe-area-inset-top))] z-20 h-10 border-b border-border bg-background print:hidden",
        "transition-[translate,opacity] duration-150 ease-out",
        shown
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-2 opacity-0 duration-90"
      )}
    >
      <div className={cn("h-full", PAGE_GUTTERS)}>
        <div className={cn(GRID, "mx-auto h-full max-w-[68.25rem] items-center")}>
          {/* A long cite overflows into the page's left margin rather than being cut. */}
          <p className="hidden min-w-0 justify-end font-serif text-note whitespace-nowrap xl:col-start-1 xl:flex">
            <CiteLine card={article} venue={false} />
          </p>
          <p className={cn(AT.text, "flex min-w-0 items-baseline gap-2 font-sans text-ui")}>
            <span className="truncate-fade min-w-0 xl:hidden">
              <CiteLine card={article} venue={false} className="font-serif text-note" />
            </span>
            {current ? (
              <span className="hidden min-w-0 items-baseline gap-1.5 sm:flex xl:flex">
                <span aria-hidden="true" className="text-muted-foreground xl:hidden">
                  ·
                </span>
                {current.number !== undefined ? (
                  <span className="text-rubric num">{current.number}</span>
                ) : null}
                <span className="truncate-fade min-w-0 text-foreground">
                  {typeset(current.title)}
                </span>
              </span>
            ) : null}
          </p>
          {/* The controls: in the gloss column from 1024 px, at the bar's right end below. */}
          <div
            className={cn(
              AT.gloss,
              "absolute inset-y-0 right-0 flex items-center justify-end gap-1 bg-background pr-2 pl-2 sm:pr-4 lg:static lg:bg-transparent lg:p-0"
            )}
          >
            <CiteMenu
              card={article}
              open={shown && citeOpen}
              onOpenChange={onCiteOpenChange}
              variant="ghost"
              size="sm"
              align="end"
              aria-keyshortcuts="c"
              className="font-sans text-ui max-md:hidden"
            />
            <SectionsMenu sections={sections} active={active} onPick={onPick} />
            <Folio place={place} from={from} />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="absolute inset-x-0 -bottom-px reading-progress" />
    </div>
  )
}

function Folio({ place, from }: { place: ListPosition; from: string }) {
  if (place.count < 2 || place.position < 1) return null
  return (
    <span className="ml-2 flex items-center gap-1 font-sans text-ui text-muted-foreground">
      <span className="whitespace-nowrap num">
        <span className="sr-only">Article </span>
        {formatNumber(place.position)} of {formatNumber(place.count)}
      </span>
      <Pager place={place} from={from} />
    </span>
  )
}

/** The sections, to jump to one (the page's keys beside those that have one). */
function SectionsMenu({
  sections,
  active,
  onPick,
}: {
  sections: readonly SectionEntry[]
  active: string | null
  onPick: (id: string) => void
}) {
  // Picking a section moves the focus to its heading: the menu does not send it back to its button.
  const picked = useRef(false)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="font-sans text-ui">
          Sections
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[min(30rem,calc(100svh-8rem))] w-72"
        onCloseAutoFocus={(e) => {
          if (picked.current) e.preventDefault()
          picked.current = false
        }}
      >
        {sections.map((s) => (
          <DropdownMenuItem
            key={s.id}
            aria-current={s.id === active ? "location" : undefined}
            aria-keyshortcuts={s.key}
            onSelect={() => {
              picked.current = true
              onPick(s.id)
              // Once the menu has closed: the jump then takes the focus to the section.
              window.setTimeout(() => goToSection(s.id), 0)
            }}
            className={cn("items-baseline gap-2.5", s.id === active && "font-medium")}
          >
            <span className="w-4 shrink-0 text-right text-rubric num">{s.number ?? ""}</span>
            <span className="min-w-0 flex-1 font-serif text-note">{typeset(s.title)}</span>
            {s.key ? <DropdownMenuShortcut>{s.key}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
