"use client"

import { useEffect, useState, type Dispatch, type SetStateAction } from "react"

/** The article's slim bar, under the top bar once the title has scrolled away (its height adds to the header's). */
export const TOC_BAR_ID = "article-toc-bar"

/** The bar's height, in the page's scroll padding while it shows (SlimBar sets it). */
export const TOC_BAR_VAR = "--toc-bar-height"

/**
 * How far below the top of the window the sections being read are hidden by fixed things: the top
 * bar, then the slim bar (which shows whenever a section, not the title, is at the top).
 */
export function stickyOffset(): number {
  const style = getComputedStyle(document.documentElement)
  const padding = parseFloat(style.scrollPaddingTop)
  const bar = document.getElementById(TOC_BAR_ID)?.offsetHeight ?? 0
  // The padding counts the bar while it shows (the variable is set): count it once.
  const counted = style.getPropertyValue(TOC_BAR_VAR).trim() ? bar : 0
  return (Number.isFinite(padding) ? padding : 0) - counted + bar
}

/**
 * The section being read: the first of `ids` that crosses the top part of the window (below the
 * sticky header), the last one once `endId` (an element after the last section) shows, none above
 * the first section. IntersectionObserver, so nothing runs while the page does not scroll.
 */
export function useScrollSpy(
  ids: readonly string[],
  endId?: string
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join("\n")

  useEffect(() => {
    const list = key ? key.split("\n") : []
    const sections = list
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return
    const top = Math.round(stickyOffset() + 8)
    const crossing = new Set<string>()
    let atEnd = false

    const pick = () => {
      if (atEnd) return setActive(list[list.length - 1] ?? null)
      const first = list.find((id) => crossing.has(id))
      if (first) return setActive(first)
      // Nothing in the band: above the first section, nothing is being read yet.
      const head = sections[0]
      if (head && head.getBoundingClientRect().top > top) setActive(null)
    }

    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) crossing.add(e.target.id)
          else crossing.delete(e.target.id)
        }
        pick()
      },
      // The band read: from below the sticky header to a little under half the window.
      { rootMargin: `-${top}px 0px -55% 0px` }
    )
    for (const el of sections) spy.observe(el)

    const end = endId ? document.getElementById(endId) : null
    const bottom = end
      ? new IntersectionObserver((entries) => {
          atEnd = entries.some((e) => e.isIntersecting)
          pick()
        })
      : null
    if (end) bottom?.observe(end)

    return () => {
      spy.disconnect()
      bottom?.disconnect()
    }
  }, [key, endId])

  return [active, setActive]
}

/** A jump longer than this many window heights is instant (its heading tinted a moment). */
const FAR = 1.5
/** The longest smooth jump. */
const SMOOTH_MS = 300
/** How long the rubric tint stays on the heading an instant jump lands on, before it fades. */
const TINT_MS = 180

/** Where the window's top goes to show `el` right under what covers the page's top. */
export function landingTop(el: HTMLElement): number {
  return Math.max(0, el.getBoundingClientRect().top + window.scrollY - stickyOffset())
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

/** A moment of rubric on the heading a far jump lands on, so the eye finds it. */
function tint(heading: HTMLElement | null): void {
  if (!heading || typeof heading.animate !== "function") return
  const color = "color-mix(in oklab, var(--rubric) 18%, transparent)"
  heading.animate(
    [
      { backgroundColor: color },
      { backgroundColor: color, offset: 0.4 },
      { backgroundColor: "transparent" },
    ],
    { duration: TINT_MS / 0.4, easing: "ease-out" }
  )
}

/**
 * Scroll the window to `top` in at most 300 ms (an ease-out), then call `done`; the reader's own
 * scrolling, typing or touch stops it.
 */
function smoothTo(top: number, done: () => void): void {
  const from = window.scrollY
  const distance = top - from
  const ms = Math.min(SMOOTH_MS, 120 + (Math.abs(distance) / window.innerHeight) * 120)
  const start = performance.now()
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    for (const type of READER_MOVES) window.removeEventListener(type, stop, true)
  }
  for (const type of READER_MOVES) {
    window.addEventListener(type, stop, { capture: true, passive: true })
  }
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms)
    window.scrollTo({ top: from + distance * (1 - (1 - t) ** 3), behavior: "instant" })
    if (t < 1) frame = requestAnimationFrame(step)
    else {
      stop()
      done()
    }
  }
  frame = requestAnimationFrame(step)
}

/**
 * Go to a section: put it in the URL, move the keyboard focus to its heading, and scroll it right
 * under the bars: smoothly (at most 300 ms) when it is near, at once when it is more than one and a
 * half windows away (or the reader asked for less motion), its heading then tinted for a moment.
 * Once there, the section is held in place while what is above it settles (images loading). False
 * when there is no such section.
 */
export function goToSection(id: string): boolean {
  const section = document.getElementById(id)
  if (!section) return false
  // The URL first: the entry left keeps the scroll position it has when the next one is pushed,
  // so Back returns where the reader was, not to wherever the jump had got to.
  if (decodeHash(window.location.hash) !== id) {
    window.history.pushState(null, "", `#${encodeURIComponent(id)}`)
  }
  const heading = section.querySelector<HTMLElement>("[data-section-heading]")
  heading?.focus({ preventScroll: true })
  const top = landingTop(section)
  const far = Math.abs(top - window.scrollY) > FAR * window.innerHeight
  if (far || reducedMotion()) {
    window.scrollTo({ top, behavior: "instant" })
    if (far) tint(heading)
    holdInPlace(section, SETTLE_MS)
  } else {
    smoothTo(top, () => holdInPlace(section, SETTLE_MS))
  }
  return true
}

/** What the reader does that means they now steer the scrolling themselves. */
const READER_MOVES = ["wheel", "touchstart", "keydown", "pointerdown"] as const
/** How long a deep link holds its section in place while images above it load. */
const HOLD_MS = 4000
/** How long a jump within the page holds its section once it has landed. */
const SETTLE_MS = 1500

/**
 * Keep `target` at the top of the window while what is above it grows (figures loading, fonts),
 * until the reader scrolls, types or touches, or `ms` pass. Returns the function that stops.
 */
export function holdInPlace(target: HTMLElement, ms: number = HOLD_MS): () => void {
  let stopped = false
  let frame = 0
  const realign = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() =>
      window.scrollTo({ top: landingTop(target), behavior: "instant" })
    )
  }
  // The page's height changes whenever something above the target takes its final size.
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(realign)
  resize?.observe(document.body)
  const stop = () => {
    if (stopped) return
    stopped = true
    window.clearTimeout(timer)
    cancelAnimationFrame(frame)
    resize?.disconnect()
    for (const type of READER_MOVES) window.removeEventListener(type, stop, true)
  }
  for (const type of READER_MOVES) {
    window.addEventListener(type, stop, { capture: true, passive: true })
  }
  const timer = window.setTimeout(stop, ms)
  return stop
}

/** The id a URL's hash names ("#open-points" → "open-points"), or "" for none. */
export function decodeHash(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
