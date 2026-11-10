import { act, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderWithApp } from "../../../tests/utils/render"

import { useCommandPalette } from "./command-palette-context"
import { CommandPaletteSlot, preloadCommandPalette } from "./command-palette-slot"

function Opener() {
  const { setOpen } = useCommandPalette()
  return (
    <button type="button" onClick={() => setOpen(true)}>
      Open
    </button>
  )
}

describe("CommandPaletteSlot", () => {
  it("opens the palette in the same render once its code is loaded", async () => {
    // The code loads while the browser is idle; the first ⌘K must not wait on a Suspense
    // boundary (React holds a revealed fallback back about 300 ms).
    await preloadCommandPalette()
    await renderWithApp(
      <>
        <Opener />
        <CommandPaletteSlot />
      </>
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => screen.getByRole("button", { name: "Open" }).click())
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Articles, authors, tags/)).toBeInTheDocument()
  })
})
