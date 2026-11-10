"use client"

import { useEffect, useState, type ComponentType } from "react"

import { useIsClient } from "./client-only"
import { useCommandPalette } from "./command-palette-context"

/** The palette's code (cmdk, MiniSearch): loaded once, when idle or when it is about to be used. */
let loading: Promise<ComponentType> | null = null
let loaded: ComponentType | null = null
export function preloadCommandPalette(): Promise<ComponentType> {
  loading ??= import("@/components/search/command-palette").then((m) => {
    loaded = m.CommandPalette
    return m.CommandPalette
  })
  return loading
}

/**
 * Where the shell mounts the search feature's ⌘K palette (browser only: it reads the library). Its
 * code is not in the pages' bundles: it loads when the browser is idle (or when the pointer nears
 * the search button), and the palette mounts the first time it opens. Once the code is here the
 * palette renders at once: no `lazy` and Suspense, whose reveal React holds back ~300 ms.
 */
export function CommandPaletteSlot() {
  const isClient = useIsClient()
  const { open } = useCommandPalette()
  const [wanted, setWanted] = useState(false)
  const [Palette, setPalette] = useState<ComponentType | null>(() => loaded)
  if (open && !wanted) setWanted(true)

  useEffect(() => {
    let live = true
    const take = () =>
      void preloadCommandPalette().then((component) => {
        if (live) setPalette(() => component)
      })
    if (wanted) {
      take()
      return () => {
        live = false
      }
    }
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = idle(take)
    return () => {
      live = false
      cancel(id)
    }
  }, [wanted])

  return isClient && wanted && Palette ? <Palette /> : null
}
