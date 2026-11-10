"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { parseAsString, useQueryStates } from "nuqs"
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { InlineCommand } from "@/components/content/cli-command"
import { Page } from "@/components/shell/page"
import { usePageShortcuts, type ShortcutSection } from "@/components/shell/shortcuts"
import { useStatusLine } from "@/components/shell/status-line"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useEntryFocus } from "@/hooks/use-entry-focus"
import { rememberListOrder, useListMemory } from "@/hooks/use-list-memory"
import { useWideLayout } from "@/hooks/use-media-query"
import { useIsMobile } from "@/hooks/use-mobile"
import { useRestoreFocus } from "@/hooks/use-restore-focus"
import { ApiError, isApiUnavailable, type SearchHit } from "@/lib/api"
import { copyText } from "@/lib/clipboard"
import { useLibrary, type LibraryIndex } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { isPlainKey, isTypingTarget, overlayOpen } from "@/lib/keyboard"
import { listKey, routes, type SearchMode, type SearchScope } from "@/lib/routes"
import { CLI_NAME, commands } from "@/lib/site"
import { searchParams } from "@/lib/url-state"
import { cn } from "@/lib/utils"

import { AlsoByTitle, CardMatches } from "./card-matches"
import { citeForHit, passageWithCitation } from "./citing"
import { exampleQueries } from "./examples"
import { queryTerms } from "./highlight"
import { fileRef, groupHits, hitFromRef, hitPlace, orderedHits, type HitPlace } from "./hits"
import { PassageReader, readerSelection } from "./passage-reader"
import { useRecentSearches, rememberSearch, type RecentSearch } from "./recent-searches"
import { MODES, SCOPES, SearchControls } from "./search-controls"
import { passageElement, ResultsSkeleton, SearchResults, type RowHandlers } from "./search-results"
import {
  loadPassageText,
  useDebouncedValue,
  useFileKinds,
  useIndexStatus,
  usePassageSearch,
  useWhenMeaningReady,
} from "./use-passage-search"

/** The page's URL: the shared search params, and the passage open in the reader (its ref). */
const searchState = {
  ...searchParams,
  read: parseAsString.withDefault(""),
}

const READER_ID = "passage-reader"
const DEBOUNCE_MS = 250
const LIMIT = 20
const MORE_LIMIT = 50
/** A search counts as recent once its answer has been on screen this long. */
const RECENT_AFTER_MS = 1500

/** The search page's keys and signs, as the shortcuts dialog lists them. */
const SEARCH_SHORTCUTS: ShortcutSection = {
  title: "Search",
  shortcuts: [
    { keys: [["/"]], label: "Go to the search field" },
    { keys: [["↓"]], label: "From the field, go to the passages" },
    { keys: [["↑"], ["↓"]], label: "Move between the passages (wide screens: the reader follows)" },
    { keys: [["Enter"]], label: "Open the article at the passage" },
    { keys: [["Space"]], label: "Read the passage (narrow screens)" },
    { keys: [["p"]], label: "Open the PDF at the passage’s page" },
    { keys: [["c"]], label: "Copy the LaTeX citation, with the page" },
    { keys: [["y"]], label: "Copy the passage (or the words selected) with its citation" },
    { keys: [["Esc"]], label: "Back to the search field" },
  ],
  legend: [
    { sign: <mark data-match="strong">ab</mark>, meaning: "Words of the search found together" },
    {
      sign: (
        <mark className="[box-shadow:inset_0_-0.3em_0_color-mix(in_oklab,var(--highlight)_70%,transparent)]">
          ab
        </mark>
      ),
      meaning: "One word of the search, alone",
    },
    {
      sign: <span className="font-serif text-rubric">p.</span>,
      meaning: "The page in the PDF: it opens there",
    },
    {
      sign: <span className="font-serif">“ ”</span>,
      meaning: "Quotes find the words as written, together",
    },
  ],
}

function scopeWords(scope: SearchScope): string {
  return scope === "records" ? "in the summaries" : scope === "text" ? "in the papers" : ""
}

/** "words only · the summaries · ML methods": a recent search's filters, when not the defaults. */
function filterWords(s: RecentSearch, lib: LibraryIndex): string {
  const mode = s.mode !== "hybrid" ? MODES.find((m) => m.value === s.mode)?.label : null
  const scope = s.scope !== "all" ? SCOPES.find((x) => x.value === s.scope)?.label : null
  const bib = s.bib ? lib.bib(s.bib)?.short || s.bib : null
  return [mode ? `${mode.toLowerCase()} only` : null, scope, bib].filter(Boolean).join(" · ")
}

/** `<bib>/<key>` of a passage's reference (or of an article's: itself); "" for none. */
function articleOf(ref: string | null | undefined): string {
  return ref ? ref.split("/").slice(0, 2).join("/") : ""
}

const OPENED = "search:opened:"

/** The passage an article was opened at from this list (Enter), for the way back. */
function rememberOpened(from: string, passage: string): void {
  try {
    window.sessionStorage.setItem(OPENED + listKey(from), passage)
  } catch {
    // Storage off: the way back starts on the article's first passage.
  }
}

/** The passage opened in `article` from this list, when that is the article the reader comes back from. */
function openedPassage(from: string, article: string): string | null {
  try {
    const passage = window.sessionStorage.getItem(OPENED + listKey(from))
    return passage && articleOf(passage) === article ? passage : null
  } catch {
    return null
  }
}

export function SearchView() {
  const lib = useLibrary()
  const router = useRouter()
  const status = useStatusLine()
  const [params, setParams] = useQueryStates(searchState, { history: "replace" })
  const { q, scope, mode, read } = params
  const bib = params.bib && lib.bibNames.has(params.bib) ? params.bib : ""
  const typed = q.trim()
  useDocumentTitle(typed ? `“${typed}”` : "Search")
  usePageShortcuts(SEARCH_SHORTCUTS)

  const inputRef = useRef<HTMLInputElement>(null)
  const [debouncedQ, flushQ] = useDebouncedValue(typed, DEBOUNCE_MS)
  const [attempt, setAttempt] = useState(0)
  const [statusAttempt, setStatusAttempt] = useState(0)
  const base = JSON.stringify([debouncedQ, bib, scope, mode])
  const [more, setMore] = useState<string | null>(null)
  const limit = more === base ? MORE_LIMIT : LIMIT

  const search = usePassageSearch({ q: debouncedQ, bib, scope, mode, limit }, attempt)
  const indexStatus = useIndexStatus(statusAttempt)
  const response = search.response
  // The answer went by words alone although meaning was asked: the model is still loading.
  const degraded =
    search.status === "done" &&
    response !== null &&
    response.mode === "keyword" &&
    mode !== "keyword"
  useWhenMeaningReady(degraded, () => setAttempt((n) => n + 1))

  const unavailable =
    (search.status === "error" && isApiUnavailable(search.error)) ||
    (search.status === "idle" &&
      indexStatus.state === "failed" &&
      isApiUnavailable(indexStatus.error))
  const failed = search.status === "error" && !unavailable

  const groups = useMemo(() => (response ? groupHits(response.hits, lib) : []), [response, lib])
  const hits = useMemo(() => orderedHits(groups), [groups])
  // What each supplementary file is (a referee report…), read from its first page.
  const fileKinds = useFileKinds(
    hits.filter((h) => h.source.startsWith("supplementary/")).map(fileRef)
  )
  const places = useMemo(
    () =>
      new Map<string, HitPlace>(
        hits.map((h) => [h.ref, hitPlace(h, lib.article(h.bib, h.key), fileKinds.get(fileRef(h)))])
      ),
    [hits, lib, fileKinds]
  )
  const terms = useMemo(() => queryTerms(response?.query ?? debouncedQ), [response, debouncedQ])
  const inResults = useMemo(() => new Set(groups.map((g) => g.ref)), [groups])

  // The list an article is opened from (Esc comes back), its order ([ and ] page within it), its
  // current passage (given back on a return).
  const from = routes.search({ q: debouncedQ || typed, bib: bib || undefined, scope, mode })
  const memory = useListMemory(listKey(from))
  useEffect(() => {
    if (groups.length > 0) rememberListOrder(from, [...inResults])
  }, [from, groups.length, inResults])

  const wide = useWideLayout()
  const phone = useIsMobile()
  // A return from an article (Esc, Back) gives the article now shown (`<bib>/<key>`, after paging
  // with [ ]) or the passage opened: start on that article's passage, the one opened when it is.
  const restoredRow = memory.restored?.row ?? null
  const [chosen, setChosen] = useState<string | null>(() =>
    restoredRow && articleOf(restoredRow) !== articleOf(read) ? null : read || null
  )
  const find = (ref: string | null | undefined) =>
    ref ? hits.find((h) => h.ref === ref) : undefined
  const restoredHit = restoredRow
    ? (find(restoredRow) ??
      find(openedPassage(from, restoredRow)) ??
      hits.find((h) => articleOf(h.ref) === restoredRow))
    : undefined
  const current: SearchHit | null = find(chosen) ?? restoredHit ?? find(read) ?? hits[0] ?? null
  useEffect(() => {
    if (current) memory.remember(current.ref)
    // `memory` is a new object each render; its remember writes to the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.ref])

  const typing = typed !== debouncedQ
  const busy = typed !== "" && (typing || search.status === "loading")
  const noPassage = search.status === "done" && hits.length === 0
  const twoColumns = wide && !!typed && !unavailable && !failed && !noPassage
  // Wide: the reader shows the current passage (or a shared link's, not in the results). Narrow: the
  // passage opened in the sheet.
  const linked = read && !find(read) ? hitFromRef(read, lib) : null
  const readerHit = twoColumns ? (find(chosen) ?? linked ?? current) : null
  const sheetHit = !twoColumns && read ? (find(read) ?? linked) : null
  const placeOf = (hit: SearchHit) =>
    places.get(hit.ref) ?? hitPlace(hit, lib.article(hit.bib, hit.key), fileKinds.get(fileRef(hit)))
  const articleHref = (hit: SearchHit) =>
    routes.article(hit.bib, hit.key, placeOf(hit).sectionId ?? undefined, { from })

  const remember = () => {
    if (debouncedQ) rememberSearch({ q: debouncedQ, bib, scope, mode })
  }
  // A search counts as recent once its answer has been looked at a moment.
  useEffect(() => {
    if (search.status !== "done" || !debouncedQ || hits.length === 0) return
    const timer = window.setTimeout(
      () => rememberSearch({ q: debouncedQ, bib, scope, mode }),
      RECENT_AFTER_MS
    )
    return () => window.clearTimeout(timer)
  }, [search.status, debouncedQ, bib, scope, mode, hits.length])

  // Focus on entry: the current passage once the answer is drawn (its keys work at once), else the
  // field (type at once).
  const settled = !typed || unavailable || search.status === "done" || search.status === "error"
  useEntryFocus(() => (current ? passageElement(current.ref) : null) ?? inputRef.current, {
    ready: settled,
  })

  // The sheet opens from a passage (a URL param, not a Radix trigger): the focus goes back to it.
  const restoreFocus = useRestoreFocus()

  const retry = () => {
    setAttempt((n) => n + 1)
    setStatusAttempt((n) => n + 1)
  }
  const setQuery = (value: string) => {
    setChosen(null)
    void setParams({ q: value || null, read: null })
  }

  const select = (hit: SearchHit, focus = false) => {
    setChosen(hit.ref)
    if (twoColumns) void setParams({ read: hit.ref })
    if (focus) passageElement(hit.ref)?.focus()
  }
  const openSheet = (hit: SearchHit) => {
    setChosen(hit.ref)
    void setParams({ read: hit.ref })
  }
  const closeSheet = () => void setParams({ read: null })
  const openArticle = (hit: SearchHit) => {
    memory.remember(hit.ref)
    rememberOpened(from, hit.ref)
    remember()
    router.push(articleHref(hit))
  }
  const openPdf = (hit: SearchHit) => {
    const place = placeOf(hit)
    const href = place.page?.href ?? place.fileHref
    if (href) window.open(href, "_blank", "noopener,noreferrer")
  }
  const copy = async (text: string, said: ReactNode) => {
    const ok = await copyText(text)
    status.show(ok ? said : "Could not copy: select the text and copy it by hand", {
      tone: ok ? "neutral" : "danger",
      ttl: ok ? 3000 : null,
    })
  }
  const copyCite = (hit: SearchHit) => {
    const card = lib.article(hit.bib, hit.key)?.article
    if (!card) return
    const text = citeForHit(card, placeOf(hit))
    remember()
    void copy(
      text,
      <>
        Copied <code className="text-foreground">{text}</code>
      </>
    )
  }
  const copyPassage = async (hit: SearchHit) => {
    const card = lib.article(hit.bib, hit.key)?.article
    if (!card) return
    remember()
    const place = placeOf(hit)
    const selected = readerSelection()
    // Whole sentences of the passage: its text, read now if the reader has not yet.
    const passage = place.kind === "record" || selected ? null : await loadPassageText(hit.ref)
    void copy(
      passageWithCitation(hit, place, card, { selected, passage }),
      place.review
        ? "Copied the referee’s comment, said as one"
        : "Copied the passage with its citation"
    )
  }
  const focusField = () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  // Narrow screens: the current passage's text is read ahead, so `y` quotes whole sentences at once.
  useEffect(() => {
    if (current && !twoColumns && !current.source.startsWith("record:"))
      void loadPassageText(current.ref)
  }, [current, twoColumns])

  const handlers: RowHandlers = {
    onChoose: (hit) => (twoColumns ? select(hit) : openSheet(hit)),
    onOpen: openArticle,
    onKeyDown: (e, hit) => {
      if (!isPlainKey(e.nativeEvent)) return
      const at = hits.findIndex((h) => h.ref === hit.ref)
      const go = (i: number) => {
        const next = hits[Math.max(0, Math.min(hits.length - 1, i))]
        if (next) select(next, true)
      }
      switch (e.key) {
        case "ArrowDown":
          go(at + 1)
          break
        case "ArrowUp":
          if (at <= 0) focusField()
          else go(at - 1)
          break
        case "Home":
          go(0)
          break
        case "End":
          go(hits.length - 1)
          break
        case "Enter":
          openArticle(hit)
          break
        case " ":
          if (twoColumns) select(hit)
          else openSheet(hit)
          break
        case "Escape":
          focusField()
          break
        case "p":
        case "c":
        case "y":
          if (e.repeat) break
          if (e.key === "p") openPdf(hit)
          else if (e.key === "c") copyCite(hit)
          else void copyPassage(hit)
          break
        default:
          return
      }
      e.preventDefault()
    },
  }

  // The same keys with the focus in the reader (its passage) or on nothing in particular (the
  // current passage); never on another control (WCAG 2.1.4).
  const onWindowKey = useEffectEvent((e: globalThis.KeyboardEvent) => {
    if (!isPlainKey(e) || e.repeat || isTypingTarget(e.target)) return
    const target = e.target instanceof Element ? e.target : null
    const inReader = !!target?.closest(`#${READER_ID}`)
    const nowhere = !target || target === document.body || target.id === "main"
    // The reader's sheet is itself an overlay: its keys work inside it, no other overlay's do.
    if ((!inReader && !nowhere) || (!inReader && overlayOpen())) return
    const hit = inReader ? (readerHit ?? sheetHit) : current
    if (!hit) return
    switch (e.key) {
      case "p":
        openPdf(hit)
        break
      case "c":
        copyCite(hit)
        break
      case "y":
        void copyPassage(hit)
        break
      case "Escape":
        if (!inReader || !twoColumns) return
        passageElement(hit.ref)?.focus()
        break
      case "ArrowDown":
        if (inReader) return
        passageElement(hit.ref)?.focus()
        break
      default:
        return
    }
    e.preventDefault()
  })
  useEffect(() => {
    const listener = (e: globalThis.KeyboardEvent) => onWindowKey(e)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && current) {
      e.preventDefault()
      flushQ()
      remember()
      passageElement(current.ref)?.focus()
    } else if (e.key === "Enter") {
      remember()
    }
  }

  const countText =
    search.status === "done" && response && hits.length > 0
      ? `${formatCount(hits.length, "passage")} in ${formatCount(groups.length, "article")}`
      : search.status === "done" && response
        ? `No passage says “${response.query}”`
        : null
  const [lastCount, setLastCount] = useState<string | null>(null)
  if (countText !== null && countText !== lastCount) setLastCount(countText)
  const shownCount = typed ? (countText ?? lastCount) : null

  let body: ReactNode
  if (!typed) {
    body = unavailable ? <Unavailable onRetry={retry} /> : <RecentSearches lib={lib} />
  } else if (unavailable) {
    body = (
      <div className="space-y-8">
        <Unavailable onRetry={retry} />
        <TitleFallback lib={lib} query={typed} bib={bib} from={from} />
      </div>
    )
  } else if (failed) {
    body = (
      <div className="space-y-8">
        <SearchFailed error={search.error} onRetry={retry} />
        <TitleFallback lib={lib} query={debouncedQ} bib={bib} from={from} />
      </div>
    )
  } else if (response && hits.length === 0 && (noPassage || busy)) {
    // Nothing found (while the next answer comes, the sentence stays, dimmed).
    body = (
      <div className={cn("space-y-8 transition-opacity duration-150", busy && "opacity-55")}>
        <NoPassage
          query={response.query}
          mode={mode}
          scope={scope}
          bib={bib}
          bibName={bib ? (lib.bib(bib)?.short ?? bib) : ""}
          onMode={(m) => void setParams({ mode: m, read: null })}
          onScope={(s) => void setParams({ scope: s, read: null })}
          onBib={(b) => void setParams({ bib: b || null, read: null })}
        />
        <TitleFallback lib={lib} query={response.query} bib={bib} from={from} quiet />
      </div>
    )
  } else if (hits.length === 0) {
    // The first answer is on its way (or the field is still being typed in): its shape, later.
    body = search.status === "loading" ? <ResultsSkeleton /> : null
  } else {
    body = (
      <>
        <AlsoByTitle
          lib={lib}
          query={debouncedQ}
          bib={bib}
          exclude={inResults}
          from={from}
          shown={phone ? 2 : 3}
        />
        <SearchResults
          groups={groups}
          places={places}
          terms={terms}
          currentRef={current?.ref ?? null}
          readerId={twoColumns || sheetHit ? READER_ID : undefined}
          from={from}
          busy={busy}
          handlers={handlers}
        />
        {response && response.hits.length >= limit && limit < MORE_LIMIT && !busy ? (
          <div className="px-4 pt-4">
            <Button variant="link" onClick={() => setMore(base)}>
              Show more passages
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <Page width="full">
      <h1 className="sr-only">Search</h1>
      <SearchControls
        inputRef={inputRef}
        q={q}
        mode={mode}
        scope={scope}
        bib={bib}
        bibliographies={lib.bibliographies}
        busy={busy}
        status={
          <p
            id="search-status"
            role="status"
            aria-live="polite"
            className={cn(
              "text-ui leading-6 text-muted-foreground num transition-opacity duration-150 sm:ml-auto",
              busy && "opacity-55",
              (!shownCount || noPassage) && "sr-only"
            )}
          >
            {shownCount}
          </p>
        }
        onQuery={setQuery}
        onSubmit={flushQ}
        onMode={(m) => void setParams({ mode: m, read: null })}
        onScope={(s) => void setParams({ scope: s, read: null })}
        onBib={(b) => void setParams({ bib: b || null, read: null })}
        onInputKeyDown={onInputKeyDown}
      />
      {degraded ? (
        <p className="mt-2 max-w-measure text-ui text-warning">
          By words only: the meaning model is still loading. The results will follow once it is
          ready.
        </p>
      ) : null}
      <div
        className={cn(
          "mt-6",
          twoColumns && "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-10"
        )}
      >
        <div className={cn("-mx-4 min-w-0", twoColumns ? "mr-0" : "md:max-w-[46rem]")}>{body}</div>
        {twoColumns ? (
          <aside
            aria-label="Passage"
            id={READER_ID}
            className="sticky top-[calc(var(--header-height)+1.5rem)] flex max-h-[calc(100dvh-var(--header-height)-3rem)] min-w-0 flex-col"
          >
            {readerHit ? (
              <PassageReader
                key={readerHit.ref}
                hit={readerHit}
                entry={lib.article(readerHit.bib, readerHit.key)}
                place={placeOf(readerHit)}
                terms={terms}
                articleHref={articleHref(readerHit)}
                className={cn(
                  "min-h-0 flex-1 transition-opacity duration-150",
                  busy && "opacity-55"
                )}
              />
            ) : null}
          </aside>
        ) : null}
      </div>
      {!twoColumns ? (
        <Sheet open={!!sheetHit} onOpenChange={(open) => (open ? undefined : closeSheet())}>
          <SheetContent
            side={phone ? "bottom" : "right"}
            showCloseButton={false}
            onOpenAutoFocus={(e) => {
              restoreFocus.onOpenAutoFocus()
              // The sheet itself takes the focus (its keys work; no ring on its first button).
              const sheet = document.getElementById(READER_ID)
              if (sheet) {
                e.preventDefault()
                sheet.focus({ preventScroll: true })
              }
            }}
            onCloseAutoFocus={restoreFocus.onCloseAutoFocus}
            aria-describedby={undefined}
            id={READER_ID}
            className="gap-0 px-5 pt-5 data-[side=bottom]:h-[85svh] data-[side=right]:w-[min(36rem,calc(100%-2.5rem))]"
          >
            {sheetHit ? (
              <PassageReader
                key={sheetHit.ref}
                hit={sheetHit}
                entry={lib.article(sheetHit.bib, sheetHit.key)}
                place={placeOf(sheetHit)}
                terms={terms}
                articleHref={articleHref(sheetHit)}
                onClose={closeSheet}
                className="h-full"
                titleSlot={(title) => <SheetTitle asChild>{title}</SheetTitle>}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </Page>
  )
}

/** Before a search: this tab's recent searches, or nothing. */
function RecentSearches({ lib }: { lib: LibraryIndex }) {
  const recent = useRecentSearches()
  if (recent.length === 0) return <Examples lib={lib} />
  return (
    <section aria-labelledby="recent-searches" className="mx-4 max-w-measure">
      <h2 id="recent-searches" className="label">
        Recent searches
      </h2>
      <ul className="mt-1">
        {recent.map((s) => {
          const filters = filterWords(s, lib)
          return (
            <li key={`${s.q}|${s.bib}|${s.scope}|${s.mode}`}>
              <Link
                href={routes.search({
                  q: s.q,
                  bib: s.bib || undefined,
                  scope: s.scope,
                  mode: s.mode,
                })}
                className="-mx-2 flex items-baseline gap-3 rounded-[4px] px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <span className="font-serif text-note">{s.q}</span>
                {filters ? (
                  <span className="text-small text-muted-foreground">{filters}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** No recent search yet: three to try, from the words the library's titles share. */
function Examples({ lib }: { lib: LibraryIndex }) {
  const examples = useMemo(() => exampleQueries(lib), [lib])
  if (examples.length === 0) return null
  return (
    <p className="mx-4 max-w-measure font-serif text-read text-pretty text-muted-foreground">
      Try{" "}
      {examples.map((q, i) => (
        <Fragment key={q}>
          {i > 0 ? (i === examples.length - 1 ? " or " : ", ") : null}
          <Link href={routes.search({ q: `"${q}"` })} className="link text-foreground">
            “{q}”
          </Link>
        </Fragment>
      ))}
      .
    </p>
  )
}

/** No API: said once, calmly, with the command that brings it (the cards are still searched). */
function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mx-4 max-w-measure">
      <h2 className="title">No answer from {CLI_NAME} serve</h2>
      <p className="mt-2 font-serif text-read text-pretty">
        The papers’ text is searched by {CLI_NAME} serve, which is not answering here. Start it in
        the folder of your bibliographies, then try again; meanwhile titles, authors and tags are
        searched in the browser.
      </p>
      <p className="mt-3">
        <code className="text-foreground">
          <span aria-hidden className="mr-2 text-muted-foreground select-none">
            $
          </span>
          {commands.serve}
        </code>
      </p>
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/** The API answered an error: its status (see its terminal), or its own words. */
function SearchFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : String(error)
  const status = error instanceof ApiError ? error.status : null
  const needsBuild = /\bbuild\b|no index/i.test(message)
  const server = status !== null && status >= 500
  return (
    <div role="alert" className="mx-4 max-w-measure">
      <h2 className="title">
        {server
          ? `${CLI_NAME} serve answered ${status} — see its terminal`
          : "The search could not answer"}
      </h2>
      <p className="mt-2 font-serif text-read text-pretty">
        {server ? "It failed on its side and says why in its terminal. " : null}
        It said: “{message}”.
        {needsBuild ? (
          <>
            {" "}
            Build the search index with <InlineCommand>{commands.build}</InlineCommand>, then try
            again.
          </>
        ) : null}
      </p>
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/** Nothing found: a sentence that says where it looked, and how to look wider. */
function NoPassage({
  query,
  mode,
  scope,
  bib,
  bibName,
  onMode,
  onScope,
  onBib,
}: {
  query: string
  mode: SearchMode
  scope: SearchScope
  bib: string
  bibName: string
  onMode: (mode: SearchMode) => void
  onScope: (scope: SearchScope) => void
  onBib: (bib: string) => void
}) {
  const wider: ReactNode[] = []
  if (mode === "keyword")
    wider.push(
      <Button
        key="m"
        variant="link"
        className="h-auto font-serif text-[length:inherit]"
        onClick={() => onMode("hybrid")}
      >
        search by meaning too
      </Button>
    )
  if (scope !== "all")
    wider.push(
      <Button
        key="s"
        variant="link"
        className="h-auto font-serif text-[length:inherit]"
        onClick={() => onScope("all")}
      >
        search everything
      </Button>
    )
  if (bib)
    wider.push(
      <Button
        key="b"
        variant="link"
        className="h-auto font-serif text-[length:inherit]"
        onClick={() => onBib("")}
      >
        search every bibliography
      </Button>
    )
  const where = [scopeWords(scope), bibName ? `of ${bibName}` : ""].filter(Boolean).join(" ")
  return (
    <div className="mx-4 max-w-measure font-serif text-read text-pretty">
      <p>
        No passage {where ? `${where} ` : ""}says “{query}”.
      </p>
      <p className="text-muted-foreground">
        Try other words
        {wider.map((w, i) => (
          <span key={i}>
            {i === wider.length - 1 ? ", or " : ", "}
            {w}
          </span>
        ))}
        .
      </p>
    </div>
  )
}

/** With no passage, the articles and inbox papers whose card has the words, if any. */
function TitleFallback({
  lib,
  query,
  bib,
  from,
  quiet = false,
}: {
  lib: LibraryIndex
  query: string
  bib: string
  from: string
  /** Say nothing when nothing matches either (the sentence above said it). */
  quiet?: boolean
}) {
  return (
    <div className="mx-4">
      <CardMatches
        lib={lib}
        query={query}
        bib={bib}
        from={from}
        heading="By title, author or tag"
        quiet={quiet}
      />
    </div>
  )
}
