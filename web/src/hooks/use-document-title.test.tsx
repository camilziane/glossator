import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useDocumentTitle } from "./use-document-title"

function Titled({ title }: { title: string | null }) {
  useDocumentTitle(title)
  return null
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  document.title = ""
})

describe("useDocumentTitle", () => {
  it("names the tab, and gives the route's title back when it goes", () => {
    document.title = "Article — glossator"
    const { rerender, unmount } = render(<Titled title="Novak & Ito 2024" />)
    expect(document.title).toBe("Novak & Ito 2024 — glossator")
    rerender(<Titled title="Okafor et al. 2025" />)
    expect(document.title).toBe("Okafor et al. 2025 — glossator")
    unmount()
    expect(document.title).toBe("Article — glossator")
  })

  it("puts its title back when someone else rewrites <title>", async () => {
    document.title = "Inbox — glossator"
    const { unmount } = render(<Titled title="Inbox (3)" />)
    // What React does when it re-inserts the route's hoisted <title> (StrictMode, development).
    document.head.querySelector("title")?.remove()
    const again = document.createElement("title")
    again.textContent = "Inbox — glossator"
    document.head.append(again)
    await flush()
    expect(document.title).toBe("Inbox (3) — glossator")
    unmount()
    expect(document.title).toBe("Inbox — glossator")
  })

  it("lets the most recent of several titles win, without a fight", async () => {
    document.title = "Search — glossator"
    const first = render(<Titled title="One" />)
    const second = render(<Titled title="Two" />)
    await flush()
    expect(document.title).toBe("Two — glossator")
    second.unmount()
    expect(document.title).toBe("One — glossator")
    first.unmount()
    expect(document.title).toBe("Search — glossator")
  })

  it("leaves the title alone without one", () => {
    document.title = "Overview — glossator"
    render(<Titled title={null} />)
    expect(document.title).toBe("Overview — glossator")
  })
})
