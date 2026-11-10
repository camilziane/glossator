"use client"

import { useEffect } from "react"

import { decodeHash, holdInPlace, landingTop } from "./use-scroll-spy"

/** The heading of the section the URL's hash names, or null. */
export function hashHeading(): HTMLElement | null {
  if (typeof window === "undefined") return null
  const id = decodeHash(window.location.hash)
  const section = id ? document.getElementById(id) : null
  return section?.querySelector<HTMLElement>("[data-section-heading]") ?? null
}

/** Scroll to the section the URL's hash names and hold it there; the hold's stop, or null. */
function landOnHash(focus: boolean): (() => void) | null {
  const id = decodeHash(window.location.hash)
  const target = id ? document.getElementById(id) : null
  if (!target) return null
  window.scrollTo({ top: landingTop(target), behavior: "instant" })
  if (focus)
    target.querySelector<HTMLElement>("[data-section-heading]")?.focus({ preventScroll: true })
  return holdInPlace(target)
}

/**
 * Where the reader lands on an article: the section the URL's hash names (deep links work on load
 * and on reload, though the content only exists once the data has loaded), else the top. The focus
 * on arrival is the page's entry focus (`useEntryFocus`: that section's heading, else the title). A
 * hash changed in the same page (the address bar, a plain `#section` link) lands the same way and
 * takes the focus: the browser's own jump would miss, as the sections it passes are drawn only near
 * the viewport.
 */
export function useArticleLanding(articleRef: string): void {
  useEffect(() => {
    let stop = landOnHash(false)
    const onHashChange = () => {
      stop?.()
      stop = landOnHash(true)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => {
      window.removeEventListener("hashchange", onHashChange)
      stop?.()
    }
  }, [articleRef])
}
