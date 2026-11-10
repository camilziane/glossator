"use client"

import { Suspense, type ReactNode } from "react"

import { BottomBar } from "./bottom-bar"
import { CommandPaletteSlot } from "./command-palette-slot"
import { ClampObserver } from "./clamp-observer"
import { EntryFocus } from "./entry-focus"
import { GlobalKeys } from "./global-keys"
import { LegacyHashRedirect } from "./legacy-hash-redirect"
import { StatusLineCorner } from "./status-line"
import { ThemeColor } from "./theme-toggle"
import { TopBar } from "./top-bar"

/**
 * The frame of every page: the skip link, the top bar, the main region, the phone's tab bar, and
 * what has no place of its own: the ⌘K palette, the app's keys, the focus on page entry, the status
 * line's corner, the theme colour, the former page's links.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-[4px] bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <TopBar />
      <main
        id="main"
        tabIndex={-1}
        // The page's h1 takes the focus on entry (keys work at once, Tab starts in the content): it
        // is no control, so it shows no ring (rows and fields keep theirs).
        className="flex min-h-[calc(100svh-3rem)] min-w-0 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] outline-none md:pb-0 [&_[data-entry-target]:focus-visible]:outline-none"
      >
        {children}
      </main>
      <BottomBar />
      <StatusLineCorner />
      <CommandPaletteSlot />
      <GlobalKeys />
      <Suspense fallback={null}>
        <EntryFocus />
      </Suspense>
      <ThemeColor />
      <ClampObserver />
      <LegacyHashRedirect />
    </>
  )
}
