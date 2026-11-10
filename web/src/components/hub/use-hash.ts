"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useSyncExternalStore } from "react"

// history.replaceState fires no event: the setter announces the change itself.
const HASH_SET = "hub:hashset"

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  window.addEventListener(HASH_SET, onChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
    window.removeEventListener(HASH_SET, onChange)
  }
}

function read(): string {
  const raw = window.location.hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * The URL's hash (without "#"), and a setter that replaces it without scrolling or a history entry:
 * the hub's tabs live there, as `routes.bib(name, table)` links them.
 */
export function useHash(): [string, (hash: string) => void] {
  const hash = useSyncExternalStore(subscribe, read, () => "")
  // A navigation of the app (a kind's link to this hub's Articles, filtered) changes the
  // URL without a hash event, after the render that shows its params: read the hash again then.
  const params = useSearchParams()
  useEffect(() => {
    window.dispatchEvent(new Event(HASH_SET))
  }, [params])
  const setHash = (next: string) => {
    const url = new URL(window.location.href)
    url.hash = next ? encodeURIComponent(next) : ""
    window.history.replaceState(window.history.state, "", url.href.replace(/#$/, ""))
    window.dispatchEvent(new Event(HASH_SET))
  }
  return [hash, setHash]
}
