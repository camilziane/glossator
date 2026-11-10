"use client"

import { useEffect, useMemo, type SyntheticEvent } from "react"

import { DataProblems } from "@/components/shell/data-problems"
import { Page } from "@/components/shell/page"
import { focusEntryTarget, pageHeading } from "@/hooks/page-entry"
import { useEntryFocus } from "@/hooks/use-entry-focus"
import { rememberListOrder, useFromHere, useListMemory } from "@/hooks/use-list-memory"
import { useLibrary, type InboxPaper } from "@/lib/data"
import { formatDateTime } from "@/lib/format"
import { statusOf, useOverrides } from "@/lib/inbox-decisions"
import { countInboxViews } from "@/lib/inbox-views"
import { createChordReader, isTypingTarget, overlayOpen } from "@/lib/keyboard"
import { cn } from "@/lib/utils"

import { inboxDigest, libraryDigest, todaySentence } from "./today-data"
import { TODAY_GRID, TODAY_PAGE_WIDTH, TODAY_TEXT } from "./today-grid"
import { TodayContents } from "./today-contents"
import { TodayInbox } from "./today-inbox"
import { TodayRecent } from "./today-recent"
import { TodaySentence } from "./today-sentence"

const ROW = "data-today-row"

/** The link a row of Today is (its `data-today-row`), in the main content. */
function rowLink(row: string | null | undefined): HTMLElement | null {
  if (!row) return null
  const main = document.getElementById("main")
  return main?.querySelector<HTMLElement>(`[${ROW}="${CSS.escape(row)}"]`) ?? null
}

/**
 * Today (`/`), for someone who opens it every morning: one sentence says what changed, then the
 * inbox's best new papers and the way into triage, the bibliographies as a contents page, the
 * articles published last, and when the data was built.
 *
 * On arrival the focus is on Start triage (Enter starts the morning's triage; without papers to
 * decide, or on a touch screen, on the sentence), or back on the link the reader left by when they
 * return.
 */
export function TodayView() {
  const lib = useLibrary()
  const overrides = useOverrides()
  const library = libraryDigest(lib)
  // The inbox as this session's decisions left it: the same counts as the top bar and the inbox.
  const { counts, inbox } = useMemo(() => {
    const status = (p: InboxPaper) => statusOf(p, overrides)
    const counts = countInboxViews(lib.inbox, status)
    return { counts, inbox: inboxDigest(lib.inbox, counts, status) }
  }, [lib.inbox, overrides])
  const sentence = todaySentence({
    bibliographies: library.contents.length,
    articles: library.articles,
    inbox: lib.inbox,
    counts,
    now: new Date(),
  })

  const memory = useListMemory()
  const from = useFromHere()
  // On a touch screen (no keyboard to press Enter) the sentence takes it: a control would show a ring.
  useEntryFocus(
    () =>
      rowLink(memory.restored?.row) ??
      (window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches
        ? null
        : rowLink("triage"))
  )
  const remember = (e: SyntheticEvent) => {
    const row = (e.target as HTMLElement).closest(`[${ROW}]`)?.getAttribute(ROW)
    if (row) memory.remember(row)
  }

  // `g t` on Today itself: the shell's chord goes nowhere new (same page, no entry), so the page
  // does what an arrival does: back to the top, the focus on Start triage (else the sentence).
  useEffect(() => {
    const reader = createChordReader()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTypingTarget(e.target) || overlayOpen()) return reader.cancel()
      const step = reader.read(e.key, performance.now())
      if (step.kind !== "go" || step.target !== "today") return
      window.scrollTo({ top: 0, behavior: "instant" })
      const to = rowLink("triage") ?? pageHeading()
      if (to) focusEntryTarget(to)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // An article opened from Recently published pages within it ([ and ]).
  const order = library.recent.flatMap((g) => g.entries.map((e) => e.ref))
  const orderKey = order.join(" ")
  useEffect(() => {
    if (from) rememberListOrder(from, orderKey ? orderKey.split(" ") : [])
  }, [from, orderKey])

  const built = lib.data.built
  return (
    <Page width={TODAY_PAGE_WIDTH}>
      <div className={TODAY_GRID} onFocusCapture={remember} onClickCapture={remember}>
        <TodaySentence id="today-title" parts={sentence} className={TODAY_TEXT} />
        <DataProblems className={cn(TODAY_TEXT, "mt-6")} />
        <TodayInbox lib={lib} digest={inbox} className="mt-12" />
        <TodayContents entries={library.contents} className="mt-12" />
        <TodayRecent groups={library.recent} from={from} className="mt-12" />
        {built ? (
          <footer
            className={cn(
              TODAY_TEXT,
              "mt-16 border-t border-border pt-3 text-small text-muted-foreground"
            )}
          >
            Data built <time dateTime={built}>{formatDateTime(built)}</time>
            {lib.inbox?.last_run ? (
              <>
                {" · "}inbox run{" "}
                <time dateTime={lib.inbox.last_run}>{formatDateTime(lib.inbox.last_run)}</time>
              </>
            ) : null}
          </footer>
        ) : null}
      </div>
    </Page>
  )
}
