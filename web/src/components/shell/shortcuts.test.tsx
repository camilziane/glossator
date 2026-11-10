import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import {
  ShortcutsProvider,
  usePageShortcuts,
  useShortcuts,
  type ShortcutSection,
} from "./shortcuts"

const PAGE: ShortcutSection = {
  title: "Invented page",
  shortcuts: [{ keys: [["j"], ["↓"]], label: "Next invented thing" }],
}

function Page({ withKeys = true }: { withKeys?: boolean }) {
  return withKeys ? <WithKeys /> : <input aria-label="A field" />
}

function WithKeys() {
  usePageShortcuts(PAGE)
  const { show } = useShortcuts()
  return (
    <>
      <input aria-label="A field" />
      <button type="button" onClick={show}>
        Shortcuts
      </button>
    </>
  )
}

describe("the shortcuts dialog", () => {
  it("opens with ?, lists the page's keys then the app's", async () => {
    const user = userEvent.setup()
    render(
      <ShortcutsProvider>
        <Page />
      </ShortcutsProvider>
    )
    await user.keyboard("?")
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    const sections = within(dialog).getAllByRole("region")
    expect(sections).toHaveLength(2)
    expect(within(sections[0]!).getByText("Next invented thing")).toBeInTheDocument()
    expect(within(sections[1]!).getByText("Search the library")).toBeInTheDocument()
    expect(within(sections[0]!).getByText("or")).toBeInTheDocument()
  })

  it("ignores ? typed in a field", async () => {
    const user = userEvent.setup()
    render(
      <ShortcutsProvider>
        <Page />
      </ShortcutsProvider>
    )
    await user.type(screen.getByRole("textbox", { name: "A field" }), "?")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Shortcuts" }))
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument()
  })

  it("gives the focus back to where it was", async () => {
    const user = userEvent.setup()
    render(
      <ShortcutsProvider>
        <Page />
      </ShortcutsProvider>
    )
    const button = screen.getByRole("button", { name: "Shortcuts" })
    await user.click(button)
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it("forgets a page's keys when the page goes", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ShortcutsProvider>
        <Page />
      </ShortcutsProvider>
    )
    rerender(
      <ShortcutsProvider>
        <Page withKeys={false} />
      </ShortcutsProvider>
    )
    await user.click(document.body)
    await user.keyboard("?")
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    expect(within(dialog).queryByText("Next invented thing")).not.toBeInTheDocument()
    expect(within(dialog).getAllByRole("region")).toHaveLength(1)
  })
})
