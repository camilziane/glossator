"use client"

import { useLayoutEffect, type RefObject } from "react"

/** Whether a clamped block cuts its text (more lines, or a longer line, than it shows). */
export function isCut(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
}

/**
 * Marks the clamped blocks under `root` that cut their text (`data-cut`), so only they fade
 * (a static mask) and offer their whole text. Measured once per layout: on mount, when `deps`
 * change (rows, lines), when the root's width changes and when the fonts arrive; never a running
 * animation per cell (hundreds of scroll-driven ones made scrolling stutter). Reads all, then writes.
 */
export function useClampMeasure(
  root: RefObject<HTMLElement | null>,
  deps: readonly unknown[]
): void {
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    let frame = 0
    const measure = () => {
      frame = 0
      const blocks = [...el.querySelectorAll<HTMLElement>("[data-clamp]")]
      const cut = blocks.map(isCut)
      blocks.forEach((b, i) => b.toggleAttribute("data-cut", cut[i]))
    }
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      later()
    })
    observer.observe(el)
    // Rows drawn later (a long table draws the rows near the viewport as it scrolls).
    const added = new MutationObserver(later)
    added.observe(el, { childList: true, subtree: true })
    void document.fonts?.ready.then(later)
    return () => {
      observer.disconnect()
      added.disconnect()
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller says what changes the layout
  }, deps)
}
