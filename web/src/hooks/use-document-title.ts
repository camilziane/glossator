"use client"

import { useEffect } from "react"

import { APP_NAME } from "@/lib/site"

/**
 * The tab's title for data-driven pages: "<title> — <APP_NAME>" (the static metadata names the route).
 *
 * Next owns <title> (the route's metadata) and may write it again after this hook did: on a
 * navigation, or when React re-inserts the hoisted element (StrictMode in development). One observer
 * of <head> puts the wanted title back whenever someone else changes it, and the title someone else
 * set comes back when the last component wanting one goes. Several components may want a title at
 * once: the most recent wins, and they never fight.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return
    return claimTitle(`${title} — ${APP_NAME}`)
  }, [title])
}

interface Claim {
  title: string
}

const claims: Claim[] = []
let observer: MutationObserver | null = null
/** The last title this module wrote: any other one was written by someone else. */
let applied: string | null = null
/** The title set by someone else (the route's metadata), restored when no claim is left. */
let foreign: string | null = null

function sync(): void {
  const title = claims.at(-1)?.title
  if (title === undefined || document.title === title) return
  if (document.title !== applied) foreign = document.title
  document.title = title
  applied = title
}

function claimTitle(title: string): () => void {
  const claim: Claim = { title }
  claims.push(claim)
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(sync)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
  }
  sync()
  return () => {
    const i = claims.indexOf(claim)
    if (i >= 0) claims.splice(i, 1)
    if (claims.length > 0) {
      sync()
      return
    }
    observer?.disconnect()
    observer = null
    if (document.title === applied && foreign !== null) document.title = foreign
    applied = null
    foreign = null
  }
}
