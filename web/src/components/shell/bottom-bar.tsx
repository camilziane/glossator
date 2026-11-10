"use client"

import { HouseIcon, InboxIcon, LibraryIcon, SearchIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useRef, useState, type ReactNode } from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useLibrary } from "@/lib/data"
import { formatNumber } from "@/lib/format"
import { useInboxViewCounts } from "@/lib/inbox-views"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { ClientOnly } from "./client-only"
import { LibraryBoundary } from "./library-boundary"
import { bibLabel, navPlace, type NavPlace } from "./nav-model"
import { ThemeChoice } from "./theme-toggle"

const tab =
  "relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-small leading-none transition-colors active:bg-muted [&_svg]:size-5"

function tabState(current: boolean): string {
  return current
    ? "font-semibold text-foreground before:absolute before:inset-x-[28%] before:top-0 before:h-0.5 before:bg-foreground"
    : "text-muted-foreground"
}

function TabLink({
  href,
  icon: Icon,
  label,
  current,
  count,
}: {
  href: string
  icon: LucideIcon
  label: string
  current: boolean
  /** Said after the label, in its line ("Inbox 26"): no badge on the icon. */
  count?: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(tab, tabState(current))}
    >
      <Icon aria-hidden strokeWidth={current ? 2 : 1.75} />
      <span className="whitespace-nowrap">
        {label}
        {count}
      </span>
    </Link>
  )
}

/** The new papers after the inbox's label, in rubric ("Inbox 26"); none new: nothing. */
function InboxCount() {
  const lib = useLibrary()
  const { new: fresh } = useInboxViewCounts(lib.inbox)
  if (fresh === 0) return null
  return (
    <span className="font-semibold text-rubric num">
      {" "}
      {formatNumber(fresh)} <span className="sr-only">new</span>
    </span>
  )
}

function LibraryList({ place, onNavigate }: { place: NavPlace; onNavigate: () => void }) {
  const lib = useLibrary()
  if (lib.bibliographies.length === 0) {
    return <p className="px-4 font-serif text-note text-muted-foreground">No bibliography yet.</p>
  }
  return (
    <ul className="border-t border-border">
      {lib.bibliographies.map((bib) => {
        const here = place.kind === "bib" && place.bib === bib.name
        return (
          <li key={bib.name} className="border-b border-border">
            <Link
              href={routes.bib(bib.name)}
              onClick={onNavigate}
              aria-current={here && place.kind === "bib" && place.page ? "page" : undefined}
              className="flex min-h-12 items-baseline gap-3 px-4 py-3 active:bg-muted"
            >
              <span
                className={cn(
                  "min-w-0 flex-1 font-serif text-item",
                  here ? "font-semibold" : "font-medium"
                )}
              >
                {bibLabel(bib)}
              </span>
              <span className="text-ui text-muted-foreground tabular-nums num">
                {formatNumber(bib.articles.length)} <span className="sr-only">articles</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function PlacedTabs() {
  return <Tabs place={navPlace(usePathname(), useSearchParams())} />
}

function Tabs({ place }: { place: NavPlace }) {
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Closed by following a link: the new page's entry focus wins over the return to the tab.
  const navigated = useRef(false)
  return (
    <>
      <TabLink
        href={routes.overview()}
        icon={HouseIcon}
        label="Today"
        current={place.kind === "today"}
      />
      <TabLink
        href={routes.inbox()}
        icon={InboxIcon}
        label="Inbox"
        current={place.kind === "inbox"}
        count={
          <LibraryBoundary fallback={null} errorDisplay="silent">
            <InboxCount />
          </LibraryBoundary>
        }
      />
      <button
        type="button"
        onClick={() => setLibraryOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={libraryOpen}
        className={cn(tab, tabState(place.kind === "bib"))}
      >
        <LibraryIcon aria-hidden strokeWidth={place.kind === "bib" ? 2 : 1.75} />
        Library
      </button>
      <TabLink
        href={routes.search()}
        icon={SearchIcon}
        label="Search"
        current={place.kind === "search"}
      />
      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        {/* The tab bar's own sheet: a page reached from it takes the focus (`mayTakeFocus`). */}
        <SheetContent
          side="bottom"
          data-shell-bar
          className="gap-0 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          onCloseAutoFocus={(e) => {
            if (navigated.current) e.preventDefault()
            navigated.current = false
          }}
        >
          <SheetHeader className="pb-3">
            <SheetTitle>Library</SheetTitle>
            <SheetDescription className="sr-only">
              Your bibliographies, and the theme.
            </SheetDescription>
          </SheetHeader>
          <LibraryBoundary fallback={null} errorDisplay="compact">
            <LibraryList
              place={place}
              onNavigate={() => {
                navigated.current = true
                setLibraryOpen(false)
              }}
            />
          </LibraryBoundary>
          <div className="px-4 pt-5">
            <p className="mb-1.5 label">Theme</p>
            <ThemeChoice />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * The phone's tab bar (below 768 px): Today · Inbox · Library · Search, 56 px plus the safe area,
 * each a 48 px target with its icon over its label. Library opens a sheet of the bibliographies.
 */
export function BottomBar() {
  return (
    <nav
      aria-label="Main"
      data-shell-bar
      data-print="hide"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
    >
      <Suspense fallback={<Tabs place={{ kind: "other" }} />}>
        <ClientOnly fallback={<Tabs place={{ kind: "other" }} />}>
          <PlacedTabs />
        </ClientOnly>
      </Suspense>
    </nav>
  )
}
