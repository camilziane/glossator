"use client"

import { ChevronLeftIcon } from "lucide-react"
import { createSerializer, throttle, useQueryStates } from "nuqs"
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { CliCommand } from "@/components/content/cli-command"
import { DataProblems } from "@/components/shell/data-problems"
import { Page, PAGE_GUTTERS } from "@/components/shell/page"
import { usePageShortcuts } from "@/components/shell/shortcuts"
import { showStatus, StatusLine } from "@/components/shell/status-line"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Kbd } from "@/components/ui/kbd"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useEntryFocus } from "@/hooks/use-entry-focus"
import { useListMemory } from "@/hooks/use-list-memory"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useIsMobile } from "@/hooks/use-mobile"
import { copyText } from "@/lib/clipboard"
import { useLibrary, type Inbox, type LibraryIndex } from "@/lib/data"
import { formatCount, formatNumber } from "@/lib/format"
import {
  DECIDED_STATUS,
  lastQueuedDecision,
  reprobeApi,
  statusOf,
  undoDecision,
  useApiState,
  useOverrides,
  type Decision,
} from "@/lib/inbox-decisions"
import {
  defaultInboxView,
  INBOX_VIEW_LABELS,
  latestRunDay,
  useInboxViewCounts,
  type InboxView,
} from "@/lib/inbox-views"
import { isTypingTarget, overlayOpen } from "@/lib/keyboard"
import { commands } from "@/lib/site"
import { cn } from "@/lib/utils"

import { ConfirmDecisionDialog, type DecisionRequest } from "./confirm-dialog"
import { decideWithUndo, useFailedDecisions } from "./decide"
import {
  FacetMenu,
  FilterField,
  SortMenu,
  ViewsAndFilters,
  ViewTabs,
  type FacetSpec,
} from "./inbox-filters"
import {
  buildList,
  facetCounts,
  facetOptions,
  hasActiveFilters,
  inboxParams,
  inboxRows,
  kindLabel,
  linkedLabel,
  NO_FIT,
  nextView,
  ranWords,
  shortTitle,
  sourceLabel,
  UNTRIAGED,
  viewOf,
  type Facet,
  type InboxFilters,
  type InboxList,
  type InboxRow,
} from "./inbox-model"
import { INBOX_SHORTCUTS } from "./inbox-shortcuts"
import { paperLinks } from "./paper-parts"
import { DecidedGroup, DECIDED_ID, LIST_ID, PaperList, type PaperListHandle } from "./paper-list"
import type { PaperHandlers } from "./paper-row"
import { PrintList } from "./print-list"
import { PANE_ID, ReadingPane } from "./reading-pane"

const RESULTS_ID = "inbox-results"
const READER_ID = "inbox-reader"

/** A list and a reading pane side by side from 1024 px; narrower, a paper opens on the screen. */
const SPLIT_QUERY = "(min-width: 64rem)"

const serialize = createSerializer(inboxParams)

/**
 * Where the inbox's single-key shortcuts work (WCAG 2.1.4: a letter typed elsewhere, on the top bar,
 * a menu or the status line, must not decide a paper): a paper of the list, the reading pane (or the
 * paper on the whole screen), or nowhere in particular (the page itself, the main region).
 */
function keyZone(target: Element | null): "list" | "pane" | "page" | null {
  if (target === null || target === document.body) return "page"
  if (target.id === "main" || target.id === RESULTS_ID) return "page"
  if (target.closest(`#${LIST_ID}, #${DECIDED_ID}`)) return "list"
  if (target.closest(`#${PANE_ID}, #${READER_ID}`)) return "pane"
  return null
}

function withoutIds(set: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(set)
  for (const id of ids) next.delete(id)
  return next
}

export function InboxView() {
  const lib = useLibrary()
  useDocumentTitle(lib.inbox ? null : "Inbox")
  if (!lib.inbox) return <NoInbox />
  return <Triage inbox={lib.inbox} />
}

/** The library has no inbox: what it is, and how to set it up. */
function NoInbox() {
  return (
    <Page width="full">
      <h1 className="title">Inbox</h1>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No inbox on this computer</EmptyTitle>
          <EmptyDescription>
            The inbox searches the literature every day and files the new papers close to your
            bibliographies, for you to accept or reject. Set it up, then schedule its daily run:
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="items-start">
          <CliCommand command={commands.inboxInit} />
          <CliCommand command={commands.inboxStart} />
        </EmptyContent>
      </Empty>
    </Page>
  )
}

function Triage({ inbox }: { inbox: Inbox }) {
  const lib = useLibrary()
  const overrides = useOverrides()
  const failures = useFailedDecisions()
  const api = useApiState()
  const counts = useInboxViewCounts(inbox)
  const split = useMediaQuery(SPLIT_QUERY)
  const phone = useIsMobile()
  const memory = useListMemory()
  usePageShortcuts(INBOX_SHORTCUTS)
  const [params, setParams] = useQueryStates(inboxParams, { history: "replace" })
  // The list follows the URL a beat later while typing; the current paper and the reader at once.
  const deferred = useDeferredValue(params)
  const day = latestRunDay(inbox)

  // A link to one paper (?p=<id>) opens on it: in its view when the URL names none.
  const [linked, setLinked] = useState(() => params.p || null)
  const [arrivalView, setArrivalView] = useState<InboxView>(() => {
    if (params.view) return params.view
    const paper = params.p ? lib.inboxPaper(params.p) : undefined
    return (
      (paper ? viewOf(paper, statusOf(paper, overrides), day) : null) ?? defaultInboxView(counts)
    )
  })
  const view = params.view ?? arrivalView
  const listView = deferred.view ?? arrivalView

  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [showDecided, setShowDecided] = useState(false)
  const [confirm, setConfirm] = useState<DecisionRequest | null>(null)
  const [menu, setMenu] = useState<Facet | "sort" | null>(null)
  const [sheet, setSheet] = useState(false)

  const cards = useRef(new Map<string, HTMLElement>())
  /** A paper to focus once its row mounts (a virtual list draws it after scrolling). */
  const pendingFocus = useRef<{ id: string; block: ScrollLogicalPosition } | null>(null)
  const listHandle = useRef<PaperListHandle>(null)
  const paneScroll = useRef<HTMLDivElement>(null)
  const listScroll = useRef<HTMLDivElement>(null)
  const readerHeading = useRef<HTMLHeadingElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  /** Whether this page pushed the reader's history entry (Back then closes it). */
  const pushedReader = useRef(false)
  /** A decision's answer may come after the page is gone. */
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // ------------------------------------------------------------------ derived

  // Memoized by hand: a key press re-renders the view, and these walk every paper.
  const rows = useMemo(() => inboxRows(inbox.papers, overrides), [inbox, overrides])
  const { q, bib, kind, source, sort } = deferred
  const list: InboxList = useMemo(
    () =>
      buildList(rows, {
        view: listView,
        day,
        filters: { q, bib, kind, source },
        sort,
        linked,
      }),
    [rows, listView, day, q, bib, kind, source, sort, linked]
  )
  const chosen: InboxFilters = {
    q: params.q,
    bib: params.bib,
    kind: params.kind,
    source: params.source,
  }
  const filtered = hasActiveFilters(chosen)
  const facets = useMemo(
    () => facetSpecs(list.inView, { q, bib, kind, source }, lib),
    [list.inView, q, bib, kind, source, lib]
  )

  const navRows = useMemo(
    () => [
      ...(list.linked ? [list.linked] : []),
      ...list.shown,
      ...(showDecided ? list.decided : []),
    ],
    [list, showDecided]
  )
  const ids = useMemo(() => navRows.map((r) => r.paper.id), [navRows])

  // The URL names a paper the list does not show (the palette opened one while the inbox was on
  // screen): its view when the URL names none, else it shows above the list, as a link's paper.
  const [seenP, setSeenP] = useState(params.p)
  const [jumps, setJumps] = useState(0)
  if (params.p !== seenP) {
    setSeenP(params.p)
    const paper = params.p && !ids.includes(params.p) ? lib.inboxPaper(params.p) : undefined
    if (paper) {
      const own = viewOf(paper, statusOf(paper, overrides), day)
      if (own && !params.view) setArrivalView(own)
      else setLinked(paper.id)
      setJumps((n) => n + 1)
    }
  }

  const wanted = params.p || memory.restored?.row || null
  const active = wanted !== null && ids.includes(wanted) ? wanted : (ids[0] ?? null)
  const activeRow = navRows.find((r) => r.paper.id === active)
  const selectedRows = navRows.filter((r) => selected.has(r.paper.id))
  const reading = !split && params.read && activeRow !== undefined
  const shownIndex = active === null ? -1 : list.shown.findIndex((r) => r.paper.id === active)
  const position = shownIndex >= 0 ? { n: shownIndex + 1, of: list.shown.length } : null
  const maxCount = inbox.papers.length

  useDocumentTitle(counts.new ? `Inbox (${formatNumber(counts.new)} new)` : "Inbox")

  // ------------------------------------------------------------------ focus

  function focusCard(id: string | null, block: ScrollLogicalPosition = "nearest") {
    if (id === null) {
      document.getElementById(RESULTS_ID)?.focus()
      return
    }
    const el = cards.current.get(id)
    if (el) {
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block })
      return
    }
    pendingFocus.current = { id, block }
    listHandle.current?.scrollToPaper(id, block === "center" ? "center" : "auto")
  }

  function register(id: string, el: HTMLElement | null) {
    if (!el) {
      cards.current.delete(id)
      return
    }
    cards.current.set(id, el)
    const want = pendingFocus.current
    if (want?.id === id) {
      pendingFocus.current = null
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: want.block })
    }
  }

  // The first paper (or the one a link names) takes the focus on arrival: its keys work at once.
  // Narrower, a tap opens a paper: the page's heading takes it (no outline on a phone's first row).
  useEntryFocus(() =>
    reading
      ? readerHeading.current
      : !split || active === null
        ? null
        : (cards.current.get(active) ?? null)
  )
  const openLinked = useEffectEvent(() => {
    if (linked && active === linked && !reading)
      cards.current.get(linked)?.scrollIntoView({ block: "center" })
  })
  useEffect(() => openLinked(), [])

  // A new order, view or filter: the current paper stays in sight (the focus stays where it is).
  const reveal = useEffectEvent(() => {
    if (active === null || reading) return
    const el = cards.current.get(active)
    if (el) el.scrollIntoView({ block: "nearest" })
    else listHandle.current?.scrollToPaper(active, "center")
  })
  useEffect(() => reveal(), [listView, sort, q, bib, kind, source])

  const rememberRow = useEffectEvent((row: string | null) => memory.remember(row))
  useEffect(() => rememberRow(active), [active])

  // The printed page's running head names the view.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--print-head", JSON.stringify(`Inbox · ${INBOX_VIEW_LABELS[view]}`))
    return () => {
      root.style.removeProperty("--print-head")
    }
  }, [view])

  // The paper on the whole screen: it starts at its top; closed (Back too), its row has the focus.
  const wasReading = useRef(reading)
  const readerPaper = useRef<string | null>(null)
  const onReading = useEffectEvent((now: boolean) => {
    if (now) {
      readerPaper.current = active
      window.scrollTo({ top: 0, behavior: "instant" })
      readerHeading.current?.focus({ preventScroll: true })
      return
    }
    pushedReader.current = false
    // Back restored the URL of the paper the reader opened on: the current one is the last read.
    const last = readerPaper.current
    readerPaper.current = null
    const to = last !== null && ids.includes(last) ? last : active
    // Once the router has applied the Back (the URL state lags behind it until then).
    if (to !== null) window.setTimeout(() => void setParams({ p: to }), 0)
    focusCard(to, "center")
  })
  useLayoutEffect(() => {
    if (wasReading.current === reading) return
    wasReading.current = reading
    onReading(reading)
  }, [reading])
  useEffect(() => {
    if (reading) readerPaper.current = active
  }, [reading, active])

  // After a view, an order or a filter is chosen (a key, a tab, a menu): the focus goes to the
  // current paper (the first, if it left the list) once the list shows the choice, never to a
  // menu's trigger.
  const [refocus, setRefocus] = useState(0)
  const refocusPending = useRef(false)
  function refocusCurrent() {
    refocusPending.current = true
    setRefocus((n) => n + 1)
  }
  // A jump to a paper (the palette, while the inbox is on screen) takes the focus the same way.
  const handledJumps = useRef(0)
  const settleFocus = useEffectEvent(() => {
    const jumped = jumps !== handledJumps.current
    if ((!refocusPending.current && !jumped) || deferred !== params) return
    refocusPending.current = false
    handledJumps.current = jumps
    if (!reading) focusCard(active)
  })
  useEffect(() => settleFocus(), [refocus, list, deferred, jumps])
  const menuClosed = (e: Event) => {
    e.preventDefault()
    refocusCurrent()
  }

  // Where the focus goes back when a dialog closes: where it was, else the current paper.
  const returnFocus = useRef<Element | null>(null)
  function rememberFocus() {
    returnFocus.current = document.activeElement
  }
  function restoreFocus(e: Event) {
    e.preventDefault()
    const el = returnFocus.current
    returnFocus.current = null
    if (el instanceof HTMLElement && el.isConnected && el !== document.body) el.focus()
    else focusCard(active)
  }

  // ------------------------------------------------------------------ moving

  function setCurrent(id: string | null) {
    if (id !== null && id !== params.p) void setParams({ p: id })
  }

  function activate(id: string, focus = false) {
    setCurrent(id)
    if (focus && !reading) focusCard(id)
  }

  function openReader(id: string) {
    pushedReader.current = true
    void setParams({ p: id, read: true }, { history: "push" })
  }

  function closeReader() {
    if (pushedReader.current) {
      pushedReader.current = false
      window.history.back()
    } else void setParams({ read: null })
  }

  function move(delta: number, fromPage = false) {
    if (!ids.length) return
    // From outside the list, the first move lands on the current paper rather than past it.
    if (
      !reading &&
      fromPage &&
      active !== null &&
      document.activeElement !== cards.current.get(active)
    ) {
      focusCard(active)
      return
    }
    const i = active === null ? -1 : ids.indexOf(active)
    const next = ids[Math.min(ids.length - 1, Math.max(0, i + delta))]!
    activate(next, true)
  }

  function chooseView(next: InboxView) {
    void setParams({ view: next })
    refocusCurrent()
  }

  // ------------------------------------------------------------------ decisions

  const title = (id: string) => lib.inboxPaper(id)?.title ?? id
  const naming = (list: readonly string[], max?: number) =>
    list.length === 1 ? `‘${shortTitle(title(list[0]!), max)}’` : formatCount(list.length, "paper")

  function decide(targets: readonly InboxRow[], decision: Decision) {
    const status = DECIDED_STATUS[decision]
    const todo = targets.filter((r) => !r.pending && r.status !== status)
    if (!todo.length) {
      showStatus(
        targets.some((r) => r.pending)
          ? "A decision on it is being saved."
          : `${naming(targets.map((r) => r.paper.id))} ${targets.length === 1 ? "is" : "are"} already ${status}.`
      )
      return
    }
    const todoIds = todo.map((r) => r.paper.id)

    // The focus moves on to the next paper this decision leaves alone (never lost with its row).
    if (active !== null && todoIds.includes(active)) {
      const i = ids.indexOf(active)
      const next =
        ids.slice(i + 1).find((id) => !todoIds.includes(id)) ??
        ids
          .slice(0, i)
          .reverse()
          .find((id) => !todoIds.includes(id)) ??
        null
      // The reading pane shows the next paper too: a focus there would go with the old one.
      const focused = document.activeElement
      const focusHere =
        !reading &&
        (focused === null ||
          focused === document.body ||
          !!cards.current.get(active)?.contains(focused) ||
          !!document.getElementById(PANE_ID)?.contains(focused))
      if (next !== null) setCurrent(next)
      if (focusHere) focusCard(next)
      if (reading && next === null) closeReader()
    }
    setSelected((s) => withoutIds(s, todoIds))
    decideWithUndo(
      todoIds,
      decision,
      { name: naming, title },
      {
        onUndone: (back) => {
          // The papers are back: the first one becomes the current paper again.
          if (!mounted.current || !back.length) return
          void setParams({ p: back[0]! })
          const focused = document.activeElement
          if (
            focused === null ||
            focused === document.body ||
            keyZone(focused) !== null ||
            focused.closest("[data-slot=status-line]")
          )
            focusCard(back[0]!)
        },
      }
    )
  }

  /** The latest decision still waiting goes back (the key u; the status line has its own Undo). */
  function undo() {
    const last = lastQueuedDecision()
    if (!last) {
      showStatus("Nothing to undo: the last decision was already saved.")
      return
    }
    undoDecision(last.id)
  }

  /** Accept or reject: the selection when there is one (after a confirmation), else this paper. */
  function request(decision: Decision, only?: InboxRow) {
    const targets = only
      ? [only]
      : selectedRows.length
        ? selectedRows
        : activeRow
          ? [activeRow]
          : []
    if (!targets.length) return
    if (api === "unavailable") {
      const list = targets.map((r) => r.paper.id)
      const command =
        decision === "accept" ? commands.inboxAccept(list) : commands.inboxReject(list)
      void copyText(command).then((ok) => {
        showStatus(
          ok ? `Copied “${command}”: paste it in a terminal.` : `Run “${command}” in a terminal.`
        )
      })
      return
    }
    if (targets.length > 1) {
      rememberFocus()
      setConfirm({ decision, rows: [...targets] })
    } else decide(targets, decision)
  }

  function decideOne(id: string, decision: Decision) {
    const row = rows.find((r) => r.paper.id === id)
    if (row) request(decision, row)
  }

  // ------------------------------------------------------------------ selection and details

  function toggleSelected(id: string, on?: boolean) {
    setSelecting(true)
    setSelected((s) => {
      const next = new Set(s)
      if (on ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /** Select every paper a group shows (its heading's "Select n", Shift+X on one of them). */
  function selectGroup(key: string | undefined) {
    const group = list.groups.find((g) => g.key === key)
    if (!group) return
    const ids = group.rows.filter((r) => !r.collapsed).map((r) => r.row.paper.id)
    setSelecting(true)
    setSelected((s) => new Set([...s, ...ids]))
    showStatus(
      `${formatCount(ids.length, "paper")} of “${group.label}” selected: a or r decides them.`
    )
  }

  function endSelection() {
    setSelecting(false)
    setSelected(new Set())
  }

  function toggleExpanded(id: string) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function open(kind: "article" | "pdf") {
    if (!activeRow) return
    const links = paperLinks(activeRow.paper)
    const href = kind === "article" ? (links.article ?? links.pdf?.href) : links.pdf?.href
    if (!href) {
      showStatus(kind === "pdf" ? "No PDF for this paper." : "No link for this paper.")
      return
    }
    window.open(href, "_blank", "noopener,noreferrer")
  }

  function scrollPane(direction: 1 | -1) {
    const box = paneScroll.current
    if (!box) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    box.scrollBy({
      top: direction * box.clientHeight * 0.85,
      behavior: reduce ? "instant" : "smooth",
    })
  }

  // ------------------------------------------------------------------ keys

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target instanceof Element ? e.target : null
    if (isTypingTarget(target) || overlayOpen()) return
    if (e.key === "Escape") {
      if (selecting) {
        endSelection()
        showStatus("Selection cleared.")
      } else if (reading) closeReader()
      else return
      e.preventDefault()
      return
    }
    const zone = keyZone(target)
    if (zone === null) return
    // A key held down repeats: a decision moves on to the next paper, so it would decide many.
    if (e.repeat && (e.key === "a" || e.key === "r" || e.key === "u" || e.key === "v")) {
      e.preventDefault()
      return
    }
    const onRow = target?.tagName === "ARTICLE" && zone === "list"
    const onPage = zone === "page"
    let handled = true
    switch (e.key) {
      case "j":
        move(1, onPage)
        break
      case "k":
        move(-1, onPage)
        break
      case "ArrowDown":
      case "ArrowUp":
        if (!onRow) return
        move(e.key === "ArrowDown" ? 1 : -1)
        break
      case "Home":
      case "End":
        if (!onRow || !ids.length) return
        activate(e.key === "Home" ? ids[0]! : ids[ids.length - 1]!, true)
        break
      case " ":
        // Narrow screens scroll the page itself; a button, a link or a box keeps its own Space.
        if (!split || !activeRow) return
        if (target?.closest("button, a, summary, input, [role=checkbox], [role=button]")) return
        scrollPane(e.shiftKey ? -1 : 1)
        break
      case "x":
        if (!active || reading) return
        toggleSelected(active)
        break
      case "X":
        // Shift+X: the current paper's whole group (a sweep: "Loosely related · 117", then r).
        if (!active || reading) return
        selectGroup(list.groups.find((g) => g.rows.some((r) => r.row.paper.id === active))?.key)
        break
      case "a":
        request("accept")
        break
      case "r":
        request("reject")
        break
      case "u":
        undo()
        break
      case "o":
        open("article")
        break
      case "p":
        open("pdf")
        break
      case "Enter":
        if (!active || !(onRow || onPage || zone === "pane")) return
        if (zone === "pane" && target !== null && target.closest("a, button, summary")) return
        if (!split && !reading) openReader(active)
        else toggleExpanded(active)
        break
      case "v":
        chooseView(nextView(view))
        break
      case "b":
        if (phone) setSheet(true)
        else setMenu("bib")
        break
      case "s":
        if (phone) setSheet(true)
        else setMenu("sort")
        break
      case "/":
        if (phone) setSheet(true)
        else {
          searchRef.current?.focus()
          searchRef.current?.select()
        }
        break
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  })

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  // The rows' handlers: one stable object for the whole list (so a row re-renders only when its own
  // props change), calling this render's functions.
  const latest = useRef({ activate, openReader, toggleSelected, register, selectGroup })
  useLayoutEffect(() => {
    latest.current = { activate, openReader, toggleSelected, register, selectGroup }
  })
  const [onSelectGroup] = useState(() => (key: string) => latest.current.selectGroup(key))
  const [handlers] = useState<PaperHandlers>(() => ({
    onActivate: (id) => latest.current.activate(id),
    onOpen: (id) => latest.current.openReader(id),
    onSelect: (id, on) => latest.current.toggleSelected(id, on),
    register: (id, el) => latest.current.register(id, el),
  }))

  // ------------------------------------------------------------------ render

  const setFilter = (facet: Facet, values: string[]) =>
    void setParams({ [facet]: values.length ? values : null })
  const clearFilters = () => {
    void setParams({ q: null, bib: null, kind: null, source: null })
    refocusCurrent()
  }
  const hrefOf = (v: InboxView) => serialize("/inbox/", { ...params, view: v, read: null })
  const onQuery = (value: string) =>
    void setParams({ q: value || null }, { limitUrlUpdates: throttle(300) })
  const ran = ranWords(inbox.last_run)

  const rowContext = {
    active,
    selected,
    selecting,
    compact: phone,
    opens: !split,
    showFound: view !== "new" && deferred.sort !== "found",
    handlers,
    failures,
    onSelectGroup,
  }

  const pane = activeRow ? (
    <ReadingPane
      row={activeRow}
      position={position}
      expanded={expanded.has(activeRow.paper.id)}
      api={api}
      onDecide={decideOne}
      onUndo={undo}
      onToggleExpand={() => toggleExpanded(activeRow.paper.id)}
      layout={split ? "pane" : "page"}
      keysDecide={selectedRows.length === 0}
      failure={failures.get(activeRow.paper.id) ?? null}
      scrollRef={paneScroll}
      headingRef={readerHeading}
      status={reading ? <StatusLine className="min-h-0 pt-2 text-sm [&:empty]:pt-0" /> : undefined}
    />
  ) : null

  if (reading && pane) {
    // The paper on the whole screen (under the top bar, above a phone's tab bar): the decision bar
    // at the bottom of the screen, whatever the paper's length.
    return (
      <div
        id={READER_ID}
        className="flex min-h-[calc(100svh-var(--header-height)-3.5rem-env(safe-area-inset-bottom))] w-full flex-col px-4 md:min-h-[calc(100svh-var(--header-height))] md:px-8 print:hidden"
      >
        <h1 className="sr-only">Inbox</h1>
        <div className="sticky top-(--header-height) z-10 -mx-4 mb-4 flex h-11 shrink-0 items-center gap-3 border-b border-border bg-background px-2">
          <Button variant="ghost" size="sm" className="gap-1 px-2 text-sm" onClick={closeReader}>
            <ChevronLeftIcon aria-hidden className="size-4" />
            {INBOX_VIEW_LABELS[view]}
          </Button>
          {position ? (
            <span className="ml-auto pr-2 text-small text-muted-foreground num">
              {position.n} of {position.of}
            </span>
          ) : null}
        </div>
        {pane}
        <KeysHint />
      </div>
    )
  }

  const empty = list.shown.length === 0 && !list.linked
  const toolbar = phone ? (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
      <p className="font-sans text-sm font-semibold">
        {INBOX_VIEW_LABELS[view]}{" "}
        <span
          className={cn(
            "font-normal num",
            view === "new" && counts.new ? "text-rubric" : "text-muted-foreground"
          )}
        >
          {formatNumber(counts[view])}
        </span>
      </p>
      <Button variant="outline" onClick={() => setSheet(true)}>
        Views &amp; filters
        {filtered ? (
          <span className="text-muted-foreground num">
            · {formatNumber(activeFilterCount(chosen))}
          </span>
        ) : null}
      </Button>
      <ViewsAndFilters
        open={sheet}
        onOpenChange={setSheet}
        view={view}
        counts={counts}
        onView={chooseView}
        sort={params.sort}
        onSort={(s) => void setParams({ sort: s })}
        facets={facets.map((f) => ({ ...f, chosen: chosen[f.facet] }))}
        onFacet={setFilter}
        query={params.q}
        onQuery={onQuery}
        filtered={filtered}
        onClear={clearFilters}
        onCloseFocus={menuClosed}
      />
    </div>
  ) : (
    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between xl:gap-x-8 xl:border-b xl:border-border">
      <div className="border-b border-border xl:border-b-0">
        <ViewTabs
          view={view}
          counts={counts}
          maxCount={maxCount}
          hrefOf={hrefOf}
          onView={chooseView}
        />
      </div>
      <search
        aria-label="Filter the inbox"
        className="-ml-2 flex flex-wrap items-center gap-x-0.5 border-b border-border py-1 xl:ml-0 xl:border-b-0 xl:pt-0 xl:pb-1.5"
      >
        {facets.map((spec) => (
          <FacetMenu
            key={spec.facet}
            spec={{ ...spec, chosen: chosen[spec.facet] }}
            open={menu === spec.facet}
            onOpenChange={(o) => setMenu(o ? spec.facet : null)}
            onChange={(values) => setFilter(spec.facet, values)}
            onClear={() => setFilter(spec.facet, [])}
            onCloseFocus={menuClosed}
          />
        ))}
        <SortMenu
          value={params.sort}
          onChange={(s) => void setParams({ sort: s })}
          open={menu === "sort"}
          onOpenChange={(o) => setMenu(o ? "sort" : null)}
          onCloseFocus={menuClosed}
        />
        <FilterField
          value={params.q}
          onChange={onQuery}
          inputRef={searchRef}
          className="ml-1 w-36"
        />
        {selecting ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
            aria-keyshortcuts="x"
            onClick={() => setSelecting(true)}
          >
            Select
            <Kbd hint aria-hidden>
              x
            </Kbd>
          </Button>
        )}
      </search>
    </div>
  )

  const colophon = ran ? `The daily search last ran ${ran}.` : "The daily search has not run yet."
  const listColumn = (
    <>
      {selecting ? (
        <SelectionBar
          count={selectedRows.length}
          total={list.shown.length}
          api={api}
          onAll={(on) => setSelected(on ? new Set(list.shown.map((r) => r.paper.id)) : new Set())}
          onDecide={(d) => request(d)}
          onDone={endSelection}
        />
      ) : null}
      {filtered && !empty ? (
        <p className="pt-3 pb-1 pl-2 font-sans text-small text-muted-foreground sm:pl-2.5">
          <span className="num">{formatNumber(list.shown.length)}</span> of{" "}
          <span className="num">{formatNumber(counts[listView])}</span> match the filters ·{" "}
          <button type="button" className="rounded-[2px] link" onClick={clearFilters}>
            Clear filters
          </button>
        </p>
      ) : null}
      {empty ? (
        <EmptyView
          view={view}
          counts={counts}
          filtered={filtered}
          decided={list.decided.length}
          ran={ran}
          hrefOf={hrefOf}
          onView={chooseView}
          onClear={clearFilters}
        />
      ) : (
        <PaperList
          {...rowContext}
          groups={list.groups}
          linked={list.linked}
          linkedLabel={list.linked ? linkedLabel(list.linked.status) : ""}
          maxCount={maxCount}
          handle={listHandle}
          scroller={split ? listScroll : null}
        />
      )}
      <DecidedGroup
        {...rowContext}
        rows={list.decided}
        open={showDecided}
        onOpenChange={setShowDecided}
        maxCount={maxCount}
      />
    </>
  )

  const notices = (
    <>
      <DataProblems only={(p) => p.kind === "inbox paper"} className="mb-4" />
      {api === "unavailable" ? (
        <Alert role="status" className="mb-4 max-w-[48rem]">
          <AlertTitle>Decisions need {commands.serve}</AlertTitle>
          <AlertDescription>
            This page cannot reach the inbox&apos;s API: each paper shows the commands to type in a
            terminal instead, and <Kbd>a</Kbd> and <Kbd>r</Kbd> copy them.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void reprobeApi()}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
    </>
  )

  const dialogs = (
    <>
      <PrintList view={view} list={list} />
      <KeysHint />
      <ConfirmDecisionDialog
        request={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(req) => {
          // After a decision the focus goes to the current paper, whatever held it before.
          returnFocus.current = null
          setConfirm(null)
          decide(req.rows, req.decision)
        }}
        onCloseAutoFocus={restoreFocus}
      />
    </>
  )

  if (split) {
    // A frame as tall as the window: the list and the paper scroll each in their own column, the
    // decision bar and the status line stay in sight.
    return (
      <>
        <div
          className={cn(
            "flex h-[calc(100dvh-var(--header-height))] w-full flex-col pt-5 print:hidden",
            PAGE_GUTTERS
          )}
        >
          <h1 className="sr-only">Inbox</h1>
          {notices}
          {toolbar}
          <div
            className={cn(
              "grid min-h-0 flex-1",
              pane && "grid-cols-[clamp(20rem,34%,30rem)_minmax(0,1fr)]"
            )}
          >
            <div className="flex min-h-0 min-w-0 flex-col">
              <div
                ref={listScroll}
                id={RESULTS_ID}
                tabIndex={-1}
                className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain pr-4 pb-6 outline-none"
              >
                {listColumn}
              </div>
              <div className="relative mr-4 flex min-h-11 max-w-[30rem] shrink-0 items-center border-t border-border pl-2 font-sans text-small text-muted-foreground sm:pl-2.5">
                <span aria-hidden={undefined}>{colophon}</span>
                <StatusLine className="absolute inset-0 min-h-0 bg-background py-3 pl-2 sm:pl-2.5 [&:empty]:hidden" />
              </div>
            </div>
            {pane ? (
              <div className="flex min-h-0 min-w-0 flex-col border-l border-border pt-5 pl-8">
                {pane}
              </div>
            ) : null}
          </div>
        </div>
        {dialogs}
      </>
    )
  }

  return (
    <Page width="full">
      <h1 className="sr-only">Inbox</h1>
      <div className="print:hidden">
        {notices}
        {toolbar}
        <div id={RESULTS_ID} tabIndex={-1} className="outline-none">
          {listColumn}
          <p className="mt-6 pl-2 font-sans text-small text-muted-foreground sm:pl-2.5">
            {colophon}
          </p>
        </div>
        <StatusLine className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 min-h-0 bg-background px-4 py-3 md:bottom-0 md:-mx-8 md:px-8 [&:empty]:p-0 [&:has(p)]:border-t [&:has(p)]:border-border" />
      </div>
      {dialogs}
    </Page>
  )
}

function KeysHint() {
  return (
    <p id="inbox-keys-hint" className="sr-only">
      Keys, on a paper or in the reading pane: j and k move between papers, a accepts, r rejects, u
      undoes the last decision for a few seconds, Space scrolls the paper, Enter shows the whole
      abstract, o opens the article, p the PDF, x selects, v changes the view, question mark lists
      every shortcut.
    </p>
  )
}

function activeFilterCount(f: InboxFilters): number {
  return f.bib.length + f.kind.length + f.source.length + (f.q.trim() ? 1 : 0)
}

/** The filter menus: each facet's values in the view, with what each would show. */
function facetSpecs(
  inView: readonly InboxRow[],
  filters: InboxFilters,
  lib: LibraryIndex
): FacetSpec[] {
  const bibName = (v: string) => {
    if (v === UNTRIAGED) return "Not triaged"
    if (v === NO_FIT) return "No bibliography fits"
    const b = lib.bib(v)
    return b ? b.short || b.title : v
  }
  const spec = (facet: Facet, label: string, name: (v: string) => string, keyHint?: string) => {
    const counts = facetCounts(inView, filters, facet)
    return {
      facet,
      label,
      keyHint,
      chosen: filters[facet],
      options: facetOptions(inView, facet, filters[facet]).map((value) => ({
        value,
        label: name(value),
        count: counts.get(value) ?? 0,
      })),
    }
  }
  return [
    spec("bib", "Bibliography", bibName, "b"),
    spec("kind", "Kind", kindLabel),
    spec("source", "Source", sourceLabel),
  ]
}

/** Selection mode (`x`): how many, and the decisions on them. */
function SelectionBar({
  count,
  total,
  api,
  onAll,
  onDecide,
  onDone,
}: {
  count: number
  total: number
  api: ReturnType<typeof useApiState>
  onAll: (on: boolean) => void
  onDecide: (decision: Decision) => void
  onDone: () => void
}) {
  return (
    <div
      role="group"
      aria-label="Selection"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-2 pl-2 font-sans text-sm sm:pl-2.5"
    >
      <Checkbox
        checked={count > 0 && count === total ? true : count > 0 ? "indeterminate" : false}
        onCheckedChange={(on) => onAll(on === true)}
        aria-label={count === total ? "Deselect every paper shown" : "Select every paper shown"}
      />
      <span className="min-w-[6.5rem] num">
        {count ? `${formatNumber(count)} selected` : "Select with x"}
      </span>
      {count && api !== "unavailable" ? (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecide("reject")}
            aria-keyshortcuts="r"
          >
            Reject {formatNumber(count)}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecide("accept")}
            aria-keyshortcuts="a"
          >
            Accept {formatNumber(count)}
          </Button>
        </>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto text-muted-foreground"
        onClick={onDone}
        aria-keyshortcuts="Escape"
      >
        Done
        <Kbd hint aria-hidden>
          Esc
        </Kbd>
      </Button>
    </div>
  )
}

/** A view with nothing to show: why, and where to go. */
function EmptyView({
  view,
  counts,
  filtered,
  decided,
  ran,
  hrefOf,
  onView,
  onClear,
}: {
  view: InboxView
  counts: ReturnType<typeof useInboxViewCounts>
  filtered: boolean
  decided: number
  ran: string | null
  hrefOf: (view: InboxView) => string
  onView: (view: InboxView) => void
  onClear: () => void
}) {
  const go = (v: InboxView) => (
    <a
      href={hrefOf(v)}
      className="link text-foreground"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        onView(v)
      }}
    >
      {INBOX_VIEW_LABELS[v]} · <span className="num">{formatNumber(counts[v])}</span>
    </a>
  )
  let title: ReactNode
  let text: ReactNode = null
  if (filtered) {
    title = "No paper of this view matches the filters"
    text = (
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    )
  } else if (view === "new") {
    title = decided ? "Every new paper is decided" : "Nothing new since the last run"
    text = (
      <>
        {ran ? `The daily search last ran ${ran}. ` : null}
        {counts.worth ? (
          <>
            Still waiting: {go("worth")}, {go("waiting")}.
          </>
        ) : counts.waiting ? (
          <>Still waiting: {go("waiting")}.</>
        ) : null}
      </>
    )
  } else if (view === "worth") {
    title = decided ? "Every paper worth a look is decided" : "Nothing worth a look waits"
    text = counts.waiting ? <>The loosely related and unrated ones: {go("waiting")}.</> : null
  } else if (view === "waiting") {
    title = "Nothing waits for a decision"
    text = "New papers appear here after the next run of the daily search."
  } else {
    title = "No accepted paper waits to be added"
    text = (
      <>
        Accepted papers wait here until{" "}
        <code className="font-mono text-[0.875em]">{commands.addAccepted}</code> adds them to their
        bibliographies.
      </>
    )
  }
  return (
    <Empty className="py-8 pl-2 sm:pl-2.5">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {text && !filtered ? <EmptyDescription>{text}</EmptyDescription> : null}
      </EmptyHeader>
      {filtered ? <EmptyContent>{text}</EmptyContent> : null}
    </Empty>
  )
}
