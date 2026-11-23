"use client"

import { ChevronDownIcon } from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"

import { CiteLine } from "@/components/content/cite"
import { CiteMenu } from "@/components/content/cite-menu"
import { IdentityIcon } from "@/components/content/identity"
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
import type { Identity } from "@/lib/identity"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { Pager } from "./article-header"
import type { ListPosition } from "./list-position"
import { goToSection, TOC_BAR_ID, TOC_BAR_VAR } from "./use-scroll-spy"

/** The bar's height: 40 px under the top bar. */
const BAR_HEIGHT = "2.5rem"

export interface SectionEntry {
  id: string
  title: string
  /** Its identity (its icon in its family's ink), when its profile marks it. */
  identity?: Identity | null
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
 * The article's slim bar, once its title has scrolled away: 40 px under the top bar, over the
 * article's column: the cite and the section being read (its icon, its name), then the Cite and
 * Sections menus and the folio (‹ 8 of 49 ›). A 1 px ink line under it grows with the reading.
 * Out of sight (and out of the keyboard's way) while the title shows.
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
        <div className="mx-auto flex h-full max-w-[44rem] items-center gap-3">
          <p className="flex min-w-0 flex-1 items-baseline gap-2 font-sans text-ui">
            <span className="truncate-fade min-w-0 shrink-[2]">
              <CiteLine card={article} venue={false} className="font-serif text-note" />
            </span>
            {current ? (
              <span className="hidden min-w-0 items-center gap-1.5 self-center sm:flex">
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <IdentityIcon identity={current.identity ?? null} className="size-3.5" />
                <span className="truncate-fade min-w-0 text-foreground">
                  {typeset(current.title)}
                </span>
              </span>
            ) : null}
          </p>
          <div className="flex shrink-0 items-center justify-end gap-1">
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
            className={cn("items-center gap-2.5", s.id === active && "font-medium")}
          >
            <span className="flex w-4 shrink-0 justify-center">
              <IdentityIcon identity={s.identity ?? null} />
            </span>
            <span className="min-w-0 flex-1 font-serif text-note">{typeset(s.title)}</span>
            {s.key ? <DropdownMenuShortcut>{s.key}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
