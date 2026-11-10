"use client"

import { useEffect } from "react"

/** The clamped boxes: `clamp-fade-N` (lines) and `truncate-fade` (one line). */
const CLAMPED = '[class*="clamp-fade-"], .truncate-fade'

/** Whether a clamped box cuts its text (more lines, or a longer line, than it shows). */
export function cutsText(el: Element): boolean {
  return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
}

/**
 * Marks every clamped box of the page that cuts its text (`data-clamped`), so only those fade (a
 * static mask, globals.css). Measured once per layout, never a running animation per box: one
 * ResizeObserver for all of them (a box's size changes: a resize, the fonts, its text growing or
 * shrinking), one MutationObserver for the boxes drawn later and the text that changes in place.
 * Reads all, then writes, in one frame.
 */
export function ClampObserver() {
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const pending = new Set<Element>()
    let frame = 0
    const flush = () => {
      frame = 0
      const boxes = [...pending].filter((el) => el.isConnected)
      pending.clear()
      const cut = boxes.map(cutsText)
      boxes.forEach((el, i) => el.toggleAttribute("data-clamped", cut[i]))
    }
    const measure = (el: Element) => {
      pending.add(el)
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const resized = new ResizeObserver((entries) => {
      for (const e of entries) measure(e.target)
    })
    const watched = new WeakSet<Element>()
    const watch = (root: ParentNode) => {
      const found = root instanceof Element && root.matches(CLAMPED) ? [root] : []
      for (const el of [...found, ...root.querySelectorAll(CLAMPED)]) {
        if (watched.has(el)) {
          measure(el)
          continue
        }
        watched.add(el)
        resized.observe(el)
      }
    }
    watch(document.body)
    const changed = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList") {
          for (const node of r.addedNodes) if (node instanceof Element) watch(node)
        }
        // Text changed in place: the box holding it may now cut it, or no longer.
        const host = r.target instanceof Element ? r.target : r.target.parentElement
        const box = host?.closest(CLAMPED)
        if (box) measure(box)
        else if (r.type === "attributes" && host?.matches(CLAMPED)) watch(host)
      }
    })
    changed.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    })
    void document.fonts?.ready.then(() => {
      for (const el of document.querySelectorAll(CLAMPED)) measure(el)
    })
    return () => {
      resized.disconnect()
      changed.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
