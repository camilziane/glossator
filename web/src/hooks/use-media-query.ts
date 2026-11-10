import { useSyncExternalStore } from "react"

/**
 * Whether a media query matches, as an external store (no effect, no extra render). False on the
 * server and during hydration: lay out for phones first, widen in the browser.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Wide enough for a list and a reading pane side by side (xl, 1280 px): the inbox, the search. */
export const WIDE_QUERY = "(min-width: 80rem)"

export function useWideLayout(): boolean {
  return useMediaQuery(WIDE_QUERY)
}
