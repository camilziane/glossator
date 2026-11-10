/**
 * Page entries: each time the reader arrives on a page (`entryKey` changes: a link, Back, a chord),
 * the shell starts an entry here. Entry focus and list memory read it: whether a page claimed the
 * focus for this entry, and whether the reader came back (Back, Forward, a reload, Esc from an
 * article) or arrived afresh.
 *
 * Module state, browser only: one app per document.
 */

export type ArrivalKind =
  /** A link, a chord, the palette: start at the top. */
  | "push"
  /** Back, Forward, a reload, or a return asked for (`requestReturn`): restore what was there. */
  | "return"

export interface PageEntry {
  /** `entryKey` of the page. */
  key: string
  /** Increases with each entry. */
  seq: number
  arrival: ArrivalKind
  /** The page's URL (path and query) when the entry started. */
  href: string
}

/** A Back or Forward this recent (ms) is what brought the next entry. */
const POP_WINDOW_MS = 1500

let current: PageEntry | null = null
let previousHref: string | null = null
let seq = 0
let poppedAt = Number.NEGATIVE_INFINITY
let poppedFrom: string | null = null
let returnTo: string | null = null
let installed = false

function locationHref(): string {
  return window.location.pathname + window.location.search
}

/** Listens for Back and Forward (once). */
function install(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  window.addEventListener("popstate", () => {
    // A change of the hash alone (an article's sections) is no arrival.
    if (locationHref() === poppedFrom) return
    poppedAt = performance.now()
  })
}
// At load, before Next's router listens: it renders the page inside its own popstate listener.
install()

function firstArrival(): ArrivalKind {
  const nav = performance.getEntriesByType?.("navigation")[0] as
    PerformanceNavigationTiming | undefined
  return nav?.type === "reload" || nav?.type === "back_forward" ? "return" : "push"
}

/** Whether a Back or Forward is on its way to becoming an entry (read during the page's render). */
function popPending(): boolean {
  return performance.now() - poppedAt <= POP_WINDOW_MS
}

/** The shell: a new page is on screen. */
export function startEntry(key: string): PageEntry {
  install()
  // The same page again: the shell's effect run twice (StrictMode), not a new arrival.
  if (current?.key === key) return current
  const href = locationHref()
  let arrival: ArrivalKind
  if (current === null) arrival = firstArrival()
  else if (popPending() || (returnTo !== null && sameHref(returnTo, href))) arrival = "return"
  else arrival = "push"
  poppedAt = Number.NEGATIVE_INFINITY
  returnTo = null
  previousHref = current?.href ?? null
  poppedFrom = href
  current = { key, seq: ++seq, arrival, href }
  return current
}

/**
 * The shell: the page's URL changed without a new entry (a filter, a query typed, the current row
 * in the URL). The entry keeps its latest URL: Back from the next page leads there, and
 * `previousEntryHref` must say so.
 */
export function noteEntryHref(): void {
  if (current) current = { ...current, href: locationHref() }
}

/** The page on screen (null before the shell started one). */
export function currentEntry(): PageEntry | null {
  return current
}

/** Where the reader was before this page (path and query), for "Esc returns to the list". */
export function previousEntryHref(): string | null {
  return previousHref
}

/**
 * How the reader is arriving on `href`, during the page's render (the shell's entry for it may not
 * have started yet).
 */
export function arrivalFor(href: string): ArrivalKind {
  install()
  if (current && sameHref(current.href, href)) return current.arrival
  return popPending() || (returnTo !== null && sameHref(returnTo, href)) ? "return" : "push"
}

/** "/search/?q=x" and "/search?q=x" alike (the router's path has no trailing slash). */
function sameHref(a: string, b: string): boolean {
  const norm = (h: string) => h.replace(/\/+(?=\?|$)/u, "") || "/"
  return norm(a) === norm(b)
}

/** The next push to `href` is a return (Esc from an article to its list): restore its row. */
export function requestReturn(href: string): void {
  returnTo = href
}

// ---------------------------------------------------------------------------- focus claims

let claim: { key: string; seq: number } | null = null

/** A page takes charge of its entry focus (useEntryFocus): the shell's default stays out. */
export function claimEntryFocus(key: string): void {
  claim = { key, seq }
}

/** Whether a page claimed the focus of this entry (a claim of an earlier visit does not count). */
export function entryFocusClaimed(entry: PageEntry): boolean {
  return claim !== null && claim.key === entry.key && claim.seq >= entry.seq - 1
}

/**
 * Whether the focus may move to the page's main object: the reader has not put it anywhere since
 * arriving (it is on nothing, on the page's frame, in the shell's bars, or on what went away).
 */
export function mayTakeFocus(): boolean {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement) return true
  if (!el.isConnected || el.id === "main") return true
  // The shell's bars, a skeleton, or a dialog on its way out (the palette that led here).
  return (
    el.closest("[data-shell-bar], [aria-busy='true'], [role=dialog][data-state=closed]") !== null
  )
}

/**
 * Focus without scrolling and without a ring: the reader did not ask for this focus, the page's own
 * cue (the current row's wash) says where it is; the first key the reader presses moves on with the
 * ring. A heading becomes focusable for it. `data-entry-focus` marks the element until then (a
 * browser that ignores `focusVisible: false` hides the ring by it, globals.css).
 */
export function focusEntryTarget(el: HTMLElement): void {
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1")
    el.setAttribute("data-entry-target", "")
  }
  el.setAttribute("data-entry-focus", "")
  const clear = () => {
    el.removeAttribute("data-entry-focus")
    el.removeEventListener("blur", clear)
    window.removeEventListener("keydown", clear, true)
  }
  el.addEventListener("blur", clear)
  window.addEventListener("keydown", clear, true)
  el.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
}

/** The page's h1 in the main region (not a loading skeleton's). */
export function pageHeading(): HTMLElement | null {
  const main = document.getElementById("main")
  const h1 = main?.querySelector<HTMLElement>("h1")
  return h1 && !h1.closest("[aria-busy='true']") ? h1 : null
}

/** Tests: forget every entry. */
export function resetPageEntries(): void {
  current = null
  previousHref = null
  seq = 0
  poppedAt = Number.NEGATIVE_INFINITY
  poppedFrom = null
  returnTo = null
  claim = null
}
