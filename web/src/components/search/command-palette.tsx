"use client"

import { Command as CommandPrimitive } from "cmdk"
import { CornerDownLeftIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Fragment,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { SeriousNoticeBadge } from "@/components/content/notice-badge"
import { useCommandPalette } from "@/components/shell/command-palette-context"
import { LibraryBoundary } from "@/components/shell/library-boundary"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { useModKey } from "@/hooks/use-mod-key"
import { referenceParts } from "@/lib/cite"
import {
  foldText,
  useLibrary,
  type ArticleMatch,
  type Bibliography,
  type InboxStatus,
  type LibraryIndex,
} from "@/lib/data"
import { formatCount, shortVenue } from "@/lib/format"
import { statusOf, useOverrides } from "@/lib/inbox-decisions"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { MarkedText, matchRanges } from "./highlight"
import { Cut } from "./passage-text"
import {
  matchesWords,
  paletteResults,
  shortAuthors,
  warmPaletteIndexes,
  type InboxMatch,
  type PaletteResults,
} from "./palette-search"
import { fragmentAround } from "./snippet"

/**
 * The ⌘K / Ctrl+K palette: instant search over every article and inbox paper (MiniSearch, in the
 * browser), the pages, the bibliographies, the theme, and a way into the full-text search. Pages and
 * bibliographies whose name starts with what is typed come first; the row "Search the full text
 * for …" is always the last, held at the foot of the list, so Enter does what the highlighted row
 * says (⌘↵ / Ctrl+↵ searches the full text from any row). The shell owns the open state and the
 * shortcut; the query lives in the dialog's content, so each opening starts empty.
 */
export function CommandPalette() {
  const { open, setOpen, takeReturnFocus } = useCommandPalette()
  const router = useRouter()
  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        motion="instant"
        showCloseButton={false}
        // Opened by a shortcut or a button that is no Radix trigger: the focus goes back to it; after
        // a jump, to what the page focused (`takeReturnFocus`), never to the former element.
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          const el = takeReturnFocus()
          if (el?.isConnected) el.focus()
        }}
        className="top-[8vh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12vh] sm:max-w-[38rem]"
      >
        <DialogTitle className="sr-only">Search the library</DialogTitle>
        <DialogDescription className="sr-only">
          Go to an article, an inbox paper, a bibliography or a page, or search the full text of the
          papers.
        </DialogDescription>
        <PaletteBody onNavigate={go} />
      </DialogContent>
    </Dialog>
  )
}

interface PalettePage {
  id: string
  label: string
  keywords: string
  /** The second key of its `g` chord. */
  chord: string
  href: (query: string) => string
}

const PAGES: readonly PalettePage[] = [
  {
    id: "today",
    label: "Today",
    keywords: "overview home start new",
    chord: "t",
    href: () => routes.overview(),
  },
  {
    id: "inbox",
    label: "Inbox",
    keywords: "triage new papers accept reject decide",
    chord: "i",
    href: () => routes.inbox(),
  },
  {
    id: "search",
    label: "Search",
    keywords: "full text passages pdf papers pages",
    chord: "s",
    href: (q) => routes.search(q ? { q } : {}),
  },
]

interface ThemeCommand {
  id: string
  label: string
  keywords: string
  run: () => void
}

interface PaletteState {
  query: string
  onQuery: (query: string) => void
  /** The option the reader moved to; null: the first one (each new query starts there). */
  chosen: string | null
  onChoose: (value: string) => void
  onNavigate: (href: string) => void
}

/** The query and the chosen option survive the library arriving (fallback → loaded). */
function PaletteBody({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState<string | null>(null)
  const state: PaletteState = {
    query,
    onQuery: (q) => {
      setQuery(q)
      setChosen(null)
    },
    chosen,
    onChoose: setChosen,
    onNavigate,
  }
  return (
    <LibraryBoundary
      fallback={<PaletteCommand {...state} lib={null} />}
      errorFallback={<PaletteCommand {...state} lib={null} failed />}
    >
      <LibraryPalette {...state} />
    </LibraryBoundary>
  )
}

function LibraryPalette(state: PaletteState) {
  const lib = useLibrary()
  // The indexes are built once the palette has painted, not inside the first key press.
  useEffect(() => {
    const id = window.setTimeout(() => warmPaletteIndexes(lib), 0)
    return () => window.clearTimeout(id)
  }, [lib])
  return <PaletteCommand {...state} lib={lib} />
}

/** The value of each kind of option (cmdk's option values). */
const valueOf = {
  article: (ref: string) => `article:${ref}`,
  inbox: (id: string) => `inbox:${id}`,
  bib: (name: string) => `bib:${name}`,
  page: (id: string) => `page:${id}`,
  command: (id: string) => `command:${id}`,
  fullText: "full-text",
}

function PaletteCommand({
  query,
  onQuery,
  chosen,
  onChoose,
  onNavigate,
  lib,
  failed = false,
}: PaletteState & { lib: LibraryIndex | null; failed?: boolean }) {
  const { setOpen } = useCommandPalette()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const mod = useModKey()
  const typed = query.trim()
  // The input follows every key at once; the results follow the query when there is time.
  const q = useDeferredValue(typed)
  const results: PaletteResults | null = lib ? paletteResults(lib, q) : null

  const searchFullText = () => onNavigate(routes.search({ q: typed }))

  // Pages and bibliographies whose name has a word starting with the query come first; a page
  // found by its keywords only comes after the articles.
  const pagesFirst = q ? PAGES.filter((p) => matchesWords(q, p.label)) : [...PAGES]
  const pagesLater = q
    ? PAGES.filter((p) => !matchesWords(q, p.label) && matchesWords(q, `${p.label} ${p.keywords}`))
    : []
  const bibliographies = results?.bibliographies ?? []

  const setThemeAndClose = (value: string) => {
    setTheme(value)
    setOpen(false)
  }
  const dark = resolvedTheme === "dark"
  const themeCommands: ThemeCommand[] = [
    {
      id: "theme-toggle",
      label: dark ? "Switch to the light theme" : "Switch to the dark theme",
      keywords: "theme appearance mode colour color dark light toggle",
      run: () => setThemeAndClose(dark ? "light" : "dark"),
    },
    ...(theme && theme !== "system"
      ? [
          {
            id: "theme-system",
            label: "Use the system theme",
            keywords: "theme appearance mode auto system dark light",
            run: () => setThemeAndClose("system"),
          },
        ]
      : []),
  ]
  const themeItems = q
    ? themeCommands.filter((c) => matchesWords(q, `${c.label} ${c.keywords}`))
    : themeCommands

  // Three words or more that start no title, page or bibliography: a phrase or a claim, not a
  // name. The full-text search comes first then, and Enter does it.
  const fullTextFirst =
    !!results && wantsFullText(q, pagesFirst.length + bibliographies.length > 0, results)

  // Every option in the order drawn: the highlighted one (and aria-activedescendant) is the one
  // chosen while it is still there, else the first, so Enter opens what a screen reader just read.
  const values = [
    ...(typed && fullTextFirst ? [valueOf.fullText] : []),
    ...pagesFirst.map((p) => valueOf.page(p.id)),
    ...bibliographies.map((b) => valueOf.bib(b.name)),
    ...(results?.articles.map((m) => valueOf.article(m.entry.ref)) ?? []),
    ...(results?.inbox.map((m) => valueOf.inbox(m.paper.id)) ?? []),
    ...pagesLater.map((p) => valueOf.page(p.id)),
    ...themeItems.map((c) => valueOf.command(c.id)),
    ...(typed && !fullTextFirst ? [valueOf.fullText] : []),
  ]
  const value = chosen !== null && values.includes(chosen) ? chosen : (values[0] ?? "")

  // cmdk names the active option (aria-activedescendant) only when it moves the highlight itself,
  // not when the value is set from outside (a new query): follow the highlighted option instead.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const sync = () => {
      const id = root.querySelector('[cmdk-item][aria-selected="true"]')?.id
      for (const el of root.querySelectorAll("[cmdk-input], [cmdk-list]")) {
        if (el.getAttribute("aria-activedescendant") === (id ?? null)) continue
        if (id) el.setAttribute("aria-activedescendant", id)
        else el.removeAttribute("aria-activedescendant")
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected"],
    })
    return () => observer.disconnect()
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && typed) {
      e.preventDefault()
      searchFullText()
    }
  }

  const bibIndex = new Map(lib?.bibliographies.map((b, i) => [b.name, i + 1]) ?? [])

  return (
    <Command
      ref={rootRef}
      shouldFilter={false}
      loop
      value={value}
      onValueChange={onChoose}
      onKeyDown={onKeyDown}
      className="rounded-none"
    >
      <CommandInput
        value={query}
        onValueChange={onQuery}
        placeholder="Articles, authors, tags, pages…"
        aria-label="Search the library"
        autoFocus
      />
      <CommandList className="max-h-[min(64vh,30rem)] py-0">
        {typed && fullTextFirst ? (
          <FullTextItem
            query={typed}
            onSelect={searchFullText}
            keys={["enter"]}
            selected={value === valueOf.fullText}
            className="mb-1 border-b border-border"
          />
        ) : null}
        {pagesFirst.length > 0 ? (
          <CommandGroup heading="Go to">
            {pagesFirst.map((p) => (
              <PageItem
                key={p.id}
                page={p}
                selected={value === valueOf.page(p.id)}
                onSelect={() => onNavigate(p.href(typed))}
              />
            ))}
          </CommandGroup>
        ) : null}
        {bibliographies.length > 0 ? (
          <CommandGroup heading="Bibliographies">
            {bibliographies.map((b) => (
              <BibItem
                key={b.name}
                bib={b}
                index={bibIndex.get(b.name) ?? 0}
                query={q}
                selected={value === valueOf.bib(b.name)}
                onSelect={() => onNavigate(routes.bib(b.name))}
              />
            ))}
          </CommandGroup>
        ) : null}
        {results ? (
          <>
            {results.articles.length > 0 ? (
              <CommandGroup heading="Articles">
                {results.articles.map((m) => (
                  <ArticleItem
                    key={m.entry.ref}
                    match={m}
                    onSelect={() =>
                      onNavigate(routes.article(m.entry.bib.name, m.entry.article.key))
                    }
                  />
                ))}
              </CommandGroup>
            ) : null}
            {results.inbox.length > 0 ? (
              <CommandGroup heading="Inbox">
                {results.inbox.map((m) => (
                  <InboxItem key={m.paper.id} match={m} onNavigate={onNavigate} />
                ))}
              </CommandGroup>
            ) : null}
          </>
        ) : failed ? (
          <p className="px-4 py-2.5 font-serif text-note text-muted-foreground">
            The library could not be loaded: only the pages and the full-text search are here.
          </p>
        ) : (
          <CommandPrimitive.Loading label="Loading the library">
            <p className="px-4 py-2.5 font-serif text-note text-muted-foreground">
              Loading the library…
            </p>
          </CommandPrimitive.Loading>
        )}
        {pagesLater.length > 0 ? (
          <CommandGroup heading="Go to">
            {pagesLater.map((p) => (
              <PageItem
                key={p.id}
                page={p}
                selected={value === valueOf.page(p.id)}
                onSelect={() => onNavigate(p.href(typed))}
              />
            ))}
          </CommandGroup>
        ) : null}
        {themeItems.length > 0 ? (
          <CommandGroup heading="Theme">
            {themeItems.map((c) => (
              <CommandItem key={c.id} value={valueOf.command(c.id)} onSelect={c.run}>
                {c.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {typed && !fullTextFirst ? (
          // Outside any group, so that it can stay at the foot of the list while it scrolls.
          <FullTextItem
            query={typed}
            onSelect={searchFullText}
            keys={[mod, "enter"]}
            selected={value === valueOf.fullText}
            className="sticky bottom-0 z-10 mt-1 border-t border-border bg-popover"
          />
        ) : null}
      </CommandList>
      <footer className="flex items-center gap-3 border-t border-border px-4 pt-2 pb-2 text-kbd text-muted-foreground">
        {/* The number of matches, said to screen readers as it changes. */}
        <p role="status" aria-live="polite" className="min-w-0 truncate num">
          {results ? countLine(results, q) : null}
        </p>
        <span
          className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap"
          aria-hidden
          data-kbd-hint=""
          data-kbd-always=""
        >
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="inline-flex items-center gap-1">
            <EnterKey /> open
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>{mod}</Kbd>
            <EnterKey /> full text
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </span>
      </footer>
    </Command>
  )
}

/** The Enter key as a key cap: an arrow drawn (no font has ↵). */
function EnterKey() {
  return (
    <Kbd aria-label="Enter">
      <CornerDownLeftIcon aria-hidden />
    </Kbd>
  )
}

/** The row that searches the full text for what is typed; `keys` it answers to ("enter" or ⌘↵). */
function FullTextItem({
  query,
  onSelect,
  keys,
  selected,
  className,
}: {
  query: string
  onSelect: () => void
  keys: readonly string[]
  /** The highlighted row: its key shows. */
  selected: boolean
  className?: string
}) {
  return (
    <CommandItem value={valueOf.fullText} onSelect={onSelect} className={cn("py-2.5", className)}>
      <span className="min-w-0 truncate">
        Search the full text for{" "}
        <span className="font-serif text-item font-semibold">“{query}”</span>
      </span>
      <CommandShortcut
        className="flex items-center gap-1 font-sans"
        data-kbd-hint=""
        data-kbd-always={selected ? "" : undefined}
      >
        {keys.map((k) => (k === "enter" ? <EnterKey key={k} /> : <Kbd key={k}>{k}</Kbd>))}
      </CommandShortcut>
    </CommandItem>
  )
}

/**
 * Whether what is typed reads as words to look for in the papers rather than a name: three words
 * or more, starting no page, bibliography, article or inbox paper's title.
 */
export function wantsFullText(
  query: string,
  namePrefix: boolean,
  results: PaletteResults
): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length < 3 || namePrefix) return false
  const typed = foldText(query.trim())
  const starts = (title: string) => foldText(title).startsWith(typed)
  return (
    !results.articles.some((m) => starts(m.entry.article.title)) &&
    !results.inbox.some((m) => starts(m.paper.title)) &&
    !results.bibliographies.some((b) => starts(b.title) || starts(b.short))
  )
}

function countLine(r: PaletteResults, query: string): string {
  if (!query) return formatCount(r.bibliographies.length, "bibliography", "bibliographies")
  const parts = [
    r.articles.length ? formatCount(r.articles.length, "article") : "",
    r.inbox.length ? formatCount(r.inbox.length, "inbox paper") : "",
    r.bibliographies.length
      ? formatCount(r.bibliographies.length, "bibliography", "bibliographies")
      : "",
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : "No article or inbox paper by that name"
}

/** A `g` chord as a quiet hint at the end of a row (hidden on touch screens). */
function Chord({
  second,
  selected,
  children,
}: {
  second: string
  /** The highlighted row: its chord shows. */
  selected: boolean
  children?: ReactNode
}) {
  return (
    <CommandShortcut className="flex items-center gap-2 font-sans text-kbd">
      {children}
      {second ? (
        <span
          className="inline-flex items-center gap-1"
          data-kbd-hint=""
          data-kbd-always={selected ? "" : undefined}
          aria-hidden
        >
          <Kbd>g</Kbd>
          <Kbd>{second}</Kbd>
        </span>
      ) : null}
    </CommandShortcut>
  )
}

function PageItem({
  page,
  selected,
  onSelect,
}: {
  page: PalettePage
  selected: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem value={valueOf.page(page.id)} onSelect={onSelect}>
      <span className="font-serif text-item font-semibold">{page.label}</span>
      <Chord second={page.chord} selected={selected} />
    </CommandItem>
  )
}

function BibItem({
  bib,
  index,
  query,
  selected,
  onSelect,
}: {
  bib: Bibliography
  index: number
  query: string
  selected: boolean
  onSelect: () => void
}) {
  const terms = query ? query.split(/\s+/).filter(Boolean) : []
  const name = bib.short || bib.name
  return (
    <CommandItem value={valueOf.bib(bib.name)} onSelect={onSelect} className="items-baseline">
      <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <span className="shrink-0 font-serif text-item font-semibold">
          <MarkedText text={name} terms={terms} />
        </span>
        {bib.title && bib.title !== name ? (
          <span className="min-w-0 truncate font-serif text-ui text-muted-foreground">
            <MarkedText text={bib.title} terms={terms} />
          </span>
        ) : null}
      </span>
      <Chord second={index > 0 && index <= 9 ? String(index) : ""} selected={selected}>
        <span className="num">{formatCount(bib.articles.length, "article")}</span>
      </Chord>
    </CommandItem>
  )
}

/**
 * The citation in the serif at 13.5, the surnames in small caps, its match marked: "NOVAK & ITO
 * 2024 · *Trans. Synth. Signals*".
 */
function CiteText({ match }: { match: ArticleMatch }) {
  const { names, etAl, year, venue, lead } = referenceParts(match.entry.article)
  if (names.length === 0) return <MarkedText text={lead} terms={match.terms} />
  return (
    <span className="cite">
      {names.map((name, i) => (
        <Fragment key={i}>
          {i > 0 ? " & " : null}
          <span className="au">
            <MarkedText text={name} terms={match.terms} />
          </span>
        </Fragment>
      ))}
      {etAl ? " et al." : null}
      {year ? ` ${year}` : null}
      {venue ? (
        <>
          {" · "}
          <i>
            <MarkedText text={venue} terms={match.terms} />
          </i>
        </>
      ) : null}
    </span>
  )
}

/** A fragment of the one-liner, when a word matched there and not in the title or citation. */
function OneLineFragment({ match }: { match: ArticleMatch }) {
  const { article } = match.entry
  if (!article.one_line) return null
  const shown = `${article.title} ${article.cite}`
  const onlyThere = match.terms.filter(
    (t) => matchRanges(article.one_line, [t]).length > 0 && matchRanges(shown, [t]).length === 0
  )
  if (onlyThere.length === 0) return null
  const fragment = fragmentAround(article.one_line, onlyThere, 70)
  if (!fragment) return null
  return (
    <span className="mt-0.5 block truncate font-serif text-gloss text-muted-foreground [font-variant-numeric:oldstyle-nums_proportional-nums]">
      {fragment.cutStart ? <Cut /> : null}
      <MarkedText text={fragment.text} terms={match.terms} acronyms />
      {fragment.cutEnd ? <Cut /> : null}
    </span>
  )
}

function ArticleItem({ match, onSelect }: { match: ArticleMatch; onSelect: () => void }) {
  const { article, bib } = match.entry
  return (
    <CommandItem
      value={valueOf.article(match.entry.ref)}
      onSelect={onSelect}
      className="items-start py-2"
    >
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-serif text-item font-semibold [font-variant-numeric:lining-nums_proportional-nums]">
          <MarkedText text={article.title || article.cite} terms={match.terms} />
        </span>
        <span className="mt-0.5 flex min-w-0 items-baseline gap-2 font-serif text-gloss text-muted-foreground">
          <span className="min-w-0 truncate">
            <CiteText match={match} />
          </span>
          <SeriousNoticeBadge notices={article.notices} />
        </span>
        <OneLineFragment match={match} />
      </span>
      <CommandShortcut className="pt-0.5 font-sans text-kbd whitespace-nowrap">
        {bib.short || bib.name}
      </CommandShortcut>
    </CommandItem>
  )
}

const STATUS_WORD: Record<InboxStatus, string | null> = {
  new: null,
  accepted: "accepted",
  rejected: "rejected",
  added: "added",
}

function InboxItem({
  match: { paper, terms },
  onNavigate,
}: {
  match: InboxMatch
  onNavigate: (href: string) => void
}) {
  const status = statusOf(paper, useOverrides())
  const meta = [
    [shortAuthors(paper.authors), paper.date.slice(0, 4)].filter(Boolean).join(" "),
    shortVenue(paper.venue),
  ]
    .filter(Boolean)
    .join(" · ")
  const lang = guessLang(paper.title)
  const word = STATUS_WORD[status]
  return (
    <CommandItem
      value={valueOf.inbox(paper.id)}
      onSelect={() => onNavigate(routes.inbox(paper.id, status))}
      className="items-start py-2"
    >
      <span className="min-w-0 flex-1">
        <span lang={lang} className="line-clamp-2 font-serif text-item font-semibold italic">
          <MarkedText text={paper.title} terms={terms} lang={lang} />
        </span>
        <span className="mt-0.5 block truncate text-small text-muted-foreground">
          <MarkedText text={meta} terms={terms} />
        </span>
      </span>
      <CommandShortcut className="pt-0.5 font-sans whitespace-nowrap">
        <span className={cn("label", status === "accepted" && "text-success")}>
          inbox{word ? ` · ${word}` : ""}
        </span>
      </CommandShortcut>
    </CommandItem>
  )
}
