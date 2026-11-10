"use client"

import { useSyncExternalStore, type ReactNode } from "react"

const subscribe = () => () => {}

/** True once hydrated in the browser; false on the server and during hydration. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}

/**
 * Renders `fallback` on the server (the static export) and during hydration, then `children`:
 * for content that only exists in the browser, like everything read from /data/library.json.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return useIsClient() ? children : fallback
}
