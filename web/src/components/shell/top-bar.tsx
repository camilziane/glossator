"use client"

import { ChevronDownIcon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useLayoutEffect, useRef, useState, type ReactNode } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useModKey } from "@/hooks/use-mod-key"
import { useLibrary, type Bibliography } from "@/lib/data"
import { formatCount, formatNumber } from "@/lib/format"
import { useInboxViewCounts } from "@/lib/inbox-views"
import { routes } from "@/lib/routes"
import { APP_NAME } from "@/lib/site"
import { cn } from "@/lib/utils"

import { ClientOnly } from "./client-only"
import { useCommandPalette } from "./command-palette-context"
import { preloadCommandPalette } from "./command-palette-slot"
import { LibraryBoundary } from "./library-boundary"
import { bibLabel, bibsFitInline, navPlace, type NavPlace } from "./nav-model"
import { useShortcuts } from "./shortcuts"
import { barIconButton, ThemeMenu } from "./theme-toggle"

/** The app's name as a wordmark: serif small caps, the first letter in rubric. */
export function Wordmark({ className }: { className?: string }) {
  const first = APP_NAME.slice(0, 1).toUpperCase()
  return (
    <Link
      href={routes.overview()}
      className={cn(
        "shrink-0 rounded-[2px] font-serif text-lede leading-none font-semibold tracking-[0.02em] text-foreground [font-variant-caps:small-caps]",
        className
      )}
    >
      <span className="text-rubric">{first}</span>
      {APP_NAME.slice(1)}
    </Link>
  )
}

/** Where the reader is, read from the URL (browser only: the export has no search params). */
function usePlace(): NavPlace {
  return navPlace(usePathname(), useSearchParams())
}

/** The current page's link: ink 600, a 2 px ink rule under its words (count included). */
const currentLink =
  "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-2.5 after:h-0.5 after:bg-foreground"

const linkBase =
  "relative inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap text-sm transition-colors duration-150"

/** A text link of the bar: muted ink; the current page ink 600 with a 2 px ink underline. */
function BarLink({
  href,
  current,
  pageCurrent = current,
  children,
  title,
}: {
  href: string
  /** Shown as where the reader is (a hub, or one of its articles). */
  current: boolean
  /** It is the page itself (aria-current="page"). */
  pageCurrent?: boolean
  children: ReactNode
  title?: string
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={pageCurrent ? "page" : current ? "true" : undefined}
      className={cn(
        linkBase,
        current ? currentLink : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  )
}

/** A count beside a link: tabular, muted (the inbox's new papers in rubric). */
function Count({ n, tone = "muted" }: { n: number; tone?: "muted" | "rubric" }) {
  return (
    <span
      className={cn(
        "font-normal tabular-nums num",
        tone === "rubric" ? "text-rubric" : "text-muted-foreground"
      )}
    >
      {formatNumber(n)}
    </span>
  )
}

/**
 * The inbox: the papers the latest run found in rubric (none new: the waiting ones, muted); the
 * link's title says both. This session's decisions count at once.
 */
function InboxLinkWithCounts({ place }: { place: NavPlace }) {
  const lib = useLibrary()
  const counts = useInboxViewCounts(lib.inbox)
  const title = `${formatCount(counts.new, "new paper")} · ${formatNumber(counts.waiting)} waiting for a decision`
  return (
    <BarLink href={routes.inbox()} current={place.kind === "inbox"} title={title}>
      Inbox{" "}
      {counts.new > 0 ? (
        <>
          <Count n={counts.new} tone="rubric" />{" "}
          <span className="sr-only">new, {formatNumber(counts.waiting)} waiting</span>
        </>
      ) : counts.waiting > 0 ? (
        <>
          <Count n={counts.waiting} /> <span className="sr-only">waiting</span>
        </>
      ) : null}
    </BarLink>
  )
}

function InboxLink({ place }: { place: NavPlace }) {
  const plain = (
    <BarLink href={routes.inbox()} current={place.kind === "inbox"}>
      Inbox
    </BarLink>
  )
  return (
    <LibraryBoundary fallback={plain} errorFallback={plain}>
      <InboxLinkWithCounts place={place} />
    </LibraryBoundary>
  )
}

/** Where the bibliographies' width is remembered (this browser), to hold their room as they load. */
const BIBS_WIDTH = "top-bar:bibs-width"

function storedWidth(): number {
  try {
    return Number(window.localStorage.getItem(BIBS_WIDTH)) || 0
  } catch {
    return 0
  }
}

/** The bibliographies' room while the library loads: their width at the last visit (nothing pops in). */
function BibliographiesRoom() {
  const [width] = useState(storedWidth)
  return width ? <span aria-hidden className="shrink-0" style={{ width }} /> : null
}

/** The bibliographies as links with their counts (wide enough), else folded into "Library ▾". */
function Bibliographies({ place }: { place: NavPlace }) {
  const lib = useLibrary()
  const bibs = lib.bibliographies
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const width = box.current?.offsetWidth
    if (!width) return
    try {
      window.localStorage.setItem(BIBS_WIDTH, String(width))
    } catch {
      // Storage off: the room is simply not held next time.
    }
  })
  if (bibs.length === 0) return null
  const inline = bibsFitInline(bibs.map(bibLabel))
  return (
    <div ref={box} className="flex shrink-0 items-center gap-x-5">
      {/* The pages, then the bibliographies. */}
      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
      {inline ? (
        <ul className="hidden items-center gap-x-5 min-[1180px]:flex">
          {bibs.map((bib) => (
            <li key={bib.name}>
              <BibLink bib={bib} place={place} />
            </li>
          ))}
        </ul>
      ) : null}
      <LibraryMenu bibs={bibs} place={place} className={inline ? "min-[1180px]:hidden" : ""} />
    </div>
  )
}

function BibLink({ bib, place }: { bib: Bibliography; place: NavPlace }) {
  const here = place.kind === "bib" && place.bib === bib.name
  return (
    <BarLink
      href={routes.bib(bib.name)}
      current={here}
      pageCurrent={here && place.page}
      title={bib.title}
    >
      {bibLabel(bib)} <Count n={bib.articles.length} /> <span className="sr-only">articles</span>
    </BarLink>
  )
}

function LibraryMenu({
  bibs,
  place,
  className,
}: {
  bibs: readonly Bibliography[]
  place: NavPlace
  className?: string
}) {
  const current = place.kind === "bib" ? bibs.find((b) => b.name === place.bib) : undefined
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          linkBase,
          "rounded-[2px] outline-offset-[-2px]",
          current
            ? currentLink
            : "text-muted-foreground hover:text-foreground aria-expanded:text-foreground",
          className
        )}
      >
        {current ? (
          <>
            <span className="sr-only">Library: </span>
            {bibLabel(current)}
          </>
        ) : (
          "Library"
        )}
        <ChevronDownIcon aria-hidden className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        {bibs.map((bib, i) => {
          const here = current?.name === bib.name
          return (
            <DropdownMenuItem key={bib.name} asChild>
              <Link
                href={routes.bib(bib.name)}
                aria-current={here && place.kind === "bib" && place.page ? "page" : undefined}
                className={cn("flex items-baseline gap-3", here && "font-semibold")}
              >
                <span className="min-w-0 flex-1 truncate">{bibLabel(bib)}</span>{" "}
                <Count n={bib.articles.length} /> <span className="sr-only">articles</span>
                {i < 9 ? (
                  <span
                    aria-hidden
                    data-kbd-hint
                    className="w-7 text-right font-sans text-kbd font-normal text-muted-foreground"
                  >
                    g {i + 1}
                  </span>
                ) : (
                  <span aria-hidden className="w-7" />
                )}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** No search params: the search page is known by its path alone. */
const NO_PARAMS = { get: () => null }

/**
 * The search: the word "Search" and a muted ⌘K (Ctrl K elsewhere), no box, opening the ⌘K palette;
 * on the search page itself there is none (its field is the page). On a phone, its icon and word.
 */
function SearchButton({ compact = false }: { compact?: boolean }) {
  const { setOpen } = useCommandPalette()
  const mod = useModKey()
  const pathname = usePathname()
  if (navPlace(pathname, NO_PARAMS).kind === "search") return null
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      onPointerEnter={() => void preloadCommandPalette()}
      onFocus={() => void preloadCommandPalette()}
      aria-label="Search the library"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "group inline-flex shrink-0 items-center gap-2 rounded-[2px] text-ui text-muted-foreground transition-colors duration-150 hover:text-foreground",
        compact ? "relative h-11 px-2 [&_svg]:size-4" : "h-12 px-1"
      )}
    >
      {compact ? <SearchIcon aria-hidden className="shrink-0" /> : null}
      <span>Search</span>
      {compact ? null : (
        <span aria-hidden className="text-small text-muted-foreground num">
          {mod === "⌘" ? "⌘K" : "Ctrl K"}
        </span>
      )}
    </button>
  )
}

function ShortcutsButton({ className }: { className?: string }) {
  const { show } = useShortcuts()
  return (
    <button
      type="button"
      onClick={show}
      aria-label="Keyboard shortcuts"
      aria-keyshortcuts="?"
      className={cn(barIconButton, "font-sans text-note font-medium", className)}
    >
      <span aria-hidden>?</span>
    </button>
  )
}

function Navigation() {
  const place = usePlace()
  return (
    <nav aria-label="Main" className="hidden min-w-0 items-center gap-x-5 md:flex">
      <BarLink href={routes.overview()} current={place.kind === "today"}>
        Today
      </BarLink>
      <InboxLink place={place} />
      <LibraryBoundary fallback={<BibliographiesRoom />} errorDisplay="silent">
        <Bibliographies place={place} />
      </LibraryBoundary>
    </nav>
  )
}

/** The navigation before the URL can be read (the static export): the same links, none current. */
function StaticNavigation() {
  return (
    <nav aria-label="Main" className="hidden min-w-0 items-center gap-x-5 md:flex">
      <BarLink href={routes.overview()} current={false}>
        Today
      </BarLink>
      <BarLink href={routes.inbox()} current={false}>
        Inbox
      </BarLink>
    </nav>
  )
}

/**
 * The top bar (48 px, sticky, opaque paper; its hairline appears once the page has scrolled): the
 * wordmark, Today · Inbox · the bibliographies, then the search, the shortcuts and the theme. On a
 * phone: the wordmark and the search (the tab bar at the bottom has the rest).
 */
export function TopBar() {
  return (
    <header
      data-shell-bar
      data-print="hide"
      className="sticky top-0 z-30 sticky-edge bg-background pt-[env(safe-area-inset-top)]"
    >
      <div className="flex h-12 items-center gap-x-6 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:px-8">
        <Wordmark />
        <Suspense fallback={<StaticNavigation />}>
          <ClientOnly fallback={<StaticNavigation />}>
            <Navigation />
          </ClientOnly>
        </Suspense>
        <div className="ml-auto flex items-center gap-1">
          <span className="md:hidden">
            <SearchButton compact />
          </span>
          <span className="hidden md:inline-flex">
            <SearchButton />
          </span>
          <ShortcutsButton className="ml-2 hidden md:inline-flex" />
          <ThemeMenu className="hidden md:inline-flex" />
        </div>
      </div>
    </header>
  )
}
