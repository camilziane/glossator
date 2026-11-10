"use client"

import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import type { ReactNode } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import { CommandPaletteProvider } from "./command-palette-context"
import { ShortcutsProvider } from "./shortcuts"

/**
 * Every app-wide context: theme (class strategy, no flash), URL state, tooltips, the palette, the
 * keyboard shortcuts dialog, and sonner for the rare app-wide message (bottom left, above the
 * phone's tab bar, never over a reading pane; decisions use the status line).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NuqsAdapter>
        <TooltipProvider delayDuration={400}>
          <CommandPaletteProvider>
            <ShortcutsProvider>{children}</ShortcutsProvider>
          </CommandPaletteProvider>
          <Toaster
            position="bottom-left"
            offset={{ bottom: 16, left: 16 }}
            mobileOffset={{
              bottom: "calc(4.5rem + env(safe-area-inset-bottom))",
              left: 16,
              right: 16,
            }}
          />
        </TooltipProvider>
      </NuqsAdapter>
    </ThemeProvider>
  )
}
