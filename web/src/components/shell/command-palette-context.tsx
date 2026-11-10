"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { currentEntry } from "@/hooks/page-entry"

export interface CommandPaletteControl {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /**
   * Where the focus was when the palette opened (once: it is forgotten as it is read). The palette
   * has no Radix trigger to give the focus back to.
   */
  takeReturnFocus: () => HTMLElement | null
}

const CommandPaletteContext = createContext<CommandPaletteControl | null>(null)

/**
 * Whether the ⌘K palette is open. The shell owns the state and the shortcut (⌘K / Ctrl+K); the
 * palette itself is the search feature's (components/search/command-palette.tsx), mounted by the
 * shell's <CommandPaletteSlot>.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  // Where the palette opened (the page entry and its URL): after a jump (another page, or another
  // paper of the same inbox) the focus is the page's, never the former element's.
  const openedOn = useRef<{ entry: number | null; href: string } | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        setOpenState((o) => {
          if (!o) remember(returnFocus, openedOn)
          return !o
        })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const value = useMemo<CommandPaletteControl>(() => {
    const setOpen = (next: boolean) => {
      if (next && !open) remember(returnFocus, openedOn)
      setOpenState(next)
    }
    return {
      open,
      setOpen,
      toggle: () => setOpen(!open),
      takeReturnFocus: () => {
        const el = returnFocus.current
        returnFocus.current = null
        const opened = openedOn.current
        openedOn.current = null
        if (opened && (opened.entry !== (currentEntry()?.seq ?? null) || opened.href !== here())) {
          // The palette led elsewhere: the page's entry focus (as after any route change), or the
          // paper the inbox focused, holds the focus, or will: give it back to what has it now.
          const now = document.activeElement
          return now instanceof HTMLElement &&
            now !== document.body &&
            !now.closest("[role=dialog]")
            ? now
            : null
        }
        return el
      },
    }
  }, [open])
  return <CommandPaletteContext value={value}>{children}</CommandPaletteContext>
}

function remember(
  ref: { current: HTMLElement | null },
  opened: { current: { entry: number | null; href: string } | null }
) {
  const el = document.activeElement
  ref.current = el instanceof HTMLElement && el !== document.body ? el : null
  opened.current = { entry: currentEntry()?.seq ?? null, href: here() }
}

/** The page's URL, path and query (the hash is a section, not another place). */
function here(): string {
  return window.location.pathname + window.location.search
}

export function useCommandPalette(): CommandPaletteControl {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx)
    throw new Error("useCommandPalette() needs <CommandPaletteProvider> (the app's providers).")
  return ctx
}
