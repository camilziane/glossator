"use client"

import { useEffect, type RefObject } from "react"

/** The attribute a lit page mark or note carries while its partner is pointed at or focused. */
export const LIT = "data-lit"

/**
 * Signes de renvoi: pointing at (or focusing) a page mark lights the marks and notes of the same page
 * in its section ("p. 5" in the text and the margin's quote from p. 5), and the other way round.
 * One listener on the article: nothing is bound per mark.
 */
export function usePageMarks(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current
    if (!el) return
    let lit: Element[] = []
    const clear = () => {
      for (const node of lit) node.removeAttribute(LIT)
      lit = []
    }
    const light = (mark: HTMLElement) => {
      clear()
      const page = mark.dataset.page
      if (!page) return
      const scope = mark.closest("[data-section]") ?? el
      const note = mark.closest("[data-gloss-note]")
      for (const other of scope.querySelectorAll<HTMLElement>(
        `[data-page="${CSS.escape(page)}"]`
      )) {
        const holder = other.closest("[data-gloss-note]")
        // Its own note is not its partner; another note, or a mark in the text, is.
        if (other === mark || (holder !== null && holder === note)) continue
        const target = holder ?? other
        if (!lit.includes(target)) {
          target.setAttribute(LIT, "")
          lit.push(target)
        }
      }
    }
    // A mark itself, or anywhere in a note: its first mark (the note's page).
    const markOf = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null
      return (
        target.closest<HTMLElement>("[data-page]") ??
        target.closest("[data-gloss-note]")?.querySelector<HTMLElement>("[data-page]") ??
        null
      )
    }
    const onOver = (e: Event) => {
      const mark = markOf(e.target)
      if (mark) light(mark)
    }
    const onOut = (e: Event) => {
      const from = e.target instanceof Element ? e.target : null
      const holder = from?.closest("[data-gloss-note]") ?? from?.closest("[data-page]")
      const to = (e as FocusEvent | PointerEvent).relatedTarget
      if (holder && !(to instanceof Node && holder.contains(to))) clear()
    }
    el.addEventListener("pointerover", onOver)
    el.addEventListener("pointerout", onOut)
    el.addEventListener("focusin", onOver)
    el.addEventListener("focusout", onOut)
    return () => {
      clear()
      el.removeEventListener("pointerover", onOver)
      el.removeEventListener("pointerout", onOut)
      el.removeEventListener("focusin", onOver)
      el.removeEventListener("focusout", onOut)
    }
  }, [root])
}
