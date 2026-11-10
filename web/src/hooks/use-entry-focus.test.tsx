import { act, fireEvent, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { EntryFocus } from "@/components/shell/entry-focus"

import { setNavigation } from "../../tests/utils/navigation"

import { resetPageEntries } from "./page-entry"
import { useEntryFocus } from "./use-entry-focus"

/** Lets the shell's deferred focus (a timeout 0) and the observers run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav data-shell-bar>
        <a href="#bar">A link in the bar</a>
      </nav>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <EntryFocus />
    </>
  )
}

function PlainPage({ title = "An invented page" }: { title?: string }) {
  return (
    <>
      <h1>{title}</h1>
      <input aria-label="A field" />
    </>
  )
}

function ListPage({ ready = true }: { ready?: boolean }) {
  const row = useRef<HTMLButtonElement>(null)
  useEntryFocus(row, { ready })
  return (
    <>
      <h1>An invented list</h1>
      {ready ? (
        <button ref={row} type="button">
          The current row
        </button>
      ) : null}
    </>
  )
}

describe("focus on page entry", () => {
  afterEach(() => resetPageEntries())

  it("gives the page's h1 the focus, without a ring, when the page names nothing", async () => {
    setNavigation({ pathname: "/search/" })
    render(
      <Frame>
        <PlainPage />
      </Frame>
    )
    await settle()
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1).toHaveFocus()
    expect(h1).toHaveAttribute("tabindex", "-1")
    expect(h1).toHaveAttribute("data-entry-target")
  })

  it("gives it to the page's main object when the page names one", async () => {
    setNavigation({ pathname: "/inbox/" })
    render(
      <Frame>
        <ListPage />
      </Frame>
    )
    await settle()
    const row = screen.getByRole("button", { name: "The current row" })
    expect(row).toHaveFocus()
    // No ring until the reader's first key: the row's own cue says where the focus is.
    expect(row).toHaveAttribute("data-entry-focus")
    fireEvent.keyDown(window, { key: "j" })
    expect(row).not.toHaveAttribute("data-entry-focus")
  })

  it("waits for the main object to be drawn", async () => {
    setNavigation({ pathname: "/inbox/" })
    const { rerender } = render(
      <Frame>
        <ListPage ready={false} />
      </Frame>
    )
    await settle()
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus()
    rerender(
      <Frame>
        <ListPage ready />
      </Frame>
    )
    await settle()
    expect(screen.getByRole("button", { name: "The current row" })).toHaveFocus()
  })

  it("moves again on the next page, but not on a change of filter", async () => {
    setNavigation({ pathname: "/bib/", search: "b=ml" })
    const { rerender } = render(
      <Frame>
        <PlainPage title="First" />
      </Frame>
    )
    await settle()
    screen.getByRole("link", { name: "A link in the bar" }).focus()

    setNavigation({ pathname: "/bib/", search: "b=ml&q=probe" })
    rerender(
      <Frame>
        <PlainPage title="First" />
      </Frame>
    )
    await settle()
    expect(screen.getByRole("link", { name: "A link in the bar" })).toHaveFocus()

    setNavigation({ pathname: "/bib/", search: "b=grassland" })
    rerender(
      <Frame>
        <PlainPage title="Second" />
      </Frame>
    )
    await settle()
    expect(screen.getByRole("heading", { level: 1, name: "Second" })).toHaveFocus()
  })

  it("never takes the focus from where the reader put it", async () => {
    setNavigation({ pathname: "/search/" })
    render(
      <Frame>
        <PlainPage />
      </Frame>
    )
    screen.getByRole("textbox", { name: "A field" }).focus()
    await settle()
    expect(screen.getByRole("textbox", { name: "A field" })).toHaveFocus()
  })
})
