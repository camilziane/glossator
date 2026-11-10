/**
 * Render a component the way the app does: with the library loaded (the synthetic fixture unless
 * another is given), URL state (nuqs), tooltips, the palette's context, the shortcuts dialog and
 * the toasts.
 *
 *   setNavigation({ pathname: "/article/", search: "b=ml&k=novak2024" })
 *   await renderWithApp(<ArticleView />, { search: "?b=ml&k=novak2024" })
 *   expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(…)
 *
 * It is async: the render happens inside act() and waits until the library has loaded or failed, so
 * the first assertion sees the content (or the error notice), not the loading fallback.
 */
import { act, render, type RenderResult } from "@testing-library/react"
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing"
import type { ReactElement } from "react"

import { CommandPaletteProvider } from "@/components/shell/command-palette-context"
import { LibraryBoundary } from "@/components/shell/library-boundary"
import { ShortcutsProvider } from "@/components/shell/shortcuts"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadLibrary, primeLibrary, type Library } from "@/lib/data"

import { fixtureLibrary } from "./fixture"

export interface RenderWithAppOptions {
  /** The library to read; the fixture by default; null leaves the loader alone (mock fetch then). */
  library?: Library | null
  /** The URL's search params, for nuqs ("?b=ml&k=x"). */
  search?: string
  /** Called on every nuqs URL update. */
  onUrlUpdate?: OnUrlUpdateFunction
}

export async function renderWithApp(
  ui: ReactElement,
  opts: RenderWithAppOptions = {}
): Promise<RenderResult> {
  if (opts.library !== null) primeLibrary(opts.library ?? fixtureLibrary())
  let result: RenderResult | undefined
  await act(async () => {
    result = render(app(ui, opts))
    await loadLibrary().catch(() => {})
  })
  return result!
}

function app(ui: ReactElement, opts: RenderWithAppOptions): ReactElement {
  return (
    <NuqsTestingAdapter searchParams={opts.search ?? ""} onUrlUpdate={opts.onUrlUpdate} hasMemory>
      <TooltipProvider>
        <CommandPaletteProvider>
          <ShortcutsProvider>
            <LibraryBoundary fallback={<p>Loading…</p>}>{ui}</LibraryBoundary>
          </ShortcutsProvider>
        </CommandPaletteProvider>
        <Toaster />
      </TooltipProvider>
    </NuqsTestingAdapter>
  )
}
