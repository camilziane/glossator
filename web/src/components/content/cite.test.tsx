import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CiteCard } from "@/lib/cite"

import { CiteLine, Reference } from "./cite"
import { CiteMenu } from "./cite-menu"
import { COPIED_MS, CopyButton } from "./copy-button"

const card: CiteCard = {
  key: "novak2024",
  cite: "Novak & Ito 2024, Trans. Synth. Signals",
  title: "A toy convolutional filter for invented field signals",
  authors: "Petra Novák, Haruto Ito",
  year: 2024,
  venue: "Transactions on Synthetic Signals",
  doi: "10.5555/tss.2024.0007",
}

let writeText: ReturnType<typeof vi.fn>

/** user-event installs a clipboard of its own: put ours back after it. */
function setup(options?: Parameters<typeof userEvent.setup>[0]) {
  const user = userEvent.setup(options)
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  return user
}

beforeEach(() => {
  writeText = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  vi.useRealTimers()
})

describe("CiteLine and Reference", () => {
  it("sets the surnames in small caps and the venue in italic", () => {
    const { container } = render(<CiteLine card={card} />)
    expect(container).toHaveTextContent("Novak & Ito 2024 · Trans. Synth. Signals")
    expect([...container.querySelectorAll(".au")].map((el) => el.textContent)).toEqual([
      "Novak",
      "Ito",
    ])
    expect(container.querySelector("i")).toHaveTextContent("Trans. Synth. Signals")
  })

  it("says et al. and can leave the venue out", () => {
    const many = { ...card, cite: "Lindqvist et al. 2026, J. Imag. Ecol." }
    const { container } = render(<CiteLine card={many} venue={false} />)
    expect(container).toHaveTextContent(/^Lindqvist et al\. 2026$/)
  })

  it("formats the reference with its venue in italic", () => {
    const { container } = render(<Reference card={card} />)
    expect(container).toHaveTextContent("Novak & Ito 2024, Trans. Synth. Signals")
    expect(container.querySelector("i")).toHaveTextContent("Trans. Synth. Signals")
  })
})

describe("CopyButton", () => {
  it("copies, says Copied in place, then reads Copy again after 1.2 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CopyButton value="novak2024" label="Key" what="the citation key" />)
    const button = screen.getByRole("button", { name: "Copy the citation key" })
    await user.click(button)
    expect(writeText).toHaveBeenCalledWith("novak2024")
    expect(button).toHaveAccessibleName("Copied the citation key")
    expect(button).toHaveAttribute("data-copy-state", "copied")
    expect(screen.getByRole("status")).toHaveTextContent("Copied the citation key")
    await act(() => vi.advanceTimersByTimeAsync(COPIED_MS + 50))
    expect(button).toHaveAccessibleName("Copy the citation key")
    expect(button).toHaveAttribute("data-copy-state", "idle")
  })

  it("copies what a function gives at the moment of the click", async () => {
    const user = setup()
    let n = 0
    render(<CopyButton value={() => `text ${++n}`} iconOnly what="the text" />)
    await user.click(screen.getByRole("button", { name: "Copy the text" }))
    expect(writeText).toHaveBeenCalledWith("text 1")
  })

  it("says so when the browser refuses", async () => {
    const user = setup()
    writeText.mockImplementation(() => Promise.reject(new Error("denied")))
    document.execCommand = vi.fn(() => false)
    render(<CopyButton value="x" what="the key" />)
    await user.click(screen.getByRole("button", { name: "Copy the key" }))
    expect(screen.getByRole("button", { name: "Could not copy the key" })).toHaveAttribute(
      "data-copy-state",
      "failed"
    )
  })
})

describe("CiteMenu", () => {
  it("copies the key, the LaTeX citation with its page, the BibTeX entry and the reference", async () => {
    const user = setup()
    render(<CiteMenu card={card} place={{ page: 5 }} keyHint="c" />)
    const trigger = screen.getByRole("button", { name: /Cite/ })
    expect(trigger).toHaveAttribute("aria-keyshortcuts", "c")

    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: "Copy the LaTeX citation" }))
    // The card says nothing of its PDF's pages: the PDF's page, in a comment.
    expect(writeText).toHaveBeenLastCalledWith("\\cite{novak2024} % PDF p. 5")
    expect(screen.getByRole("status")).toHaveTextContent("Copied the LaTeX citation")
    expect(trigger).toHaveAttribute("data-copy-state", "copied")

    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: "Copy the BibTeX entry" }))
    expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^@article\{novak2024,\n/))

    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: "Copy the reference" }))
    expect(writeText).toHaveBeenLastCalledWith(
      "Novák, P. & Ito, H. A toy convolutional filter for invented field signals. Transactions on Synthetic Signals (2024)."
    )

    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: "Copy the citation key" }))
    expect(writeText).toHaveBeenLastCalledWith("novak2024")
  })

  it("cites the journal's page, or a supplementary file's", async () => {
    const user = setup()
    const { rerender } = render(
      <CiteMenu
        card={{ ...card, version: "publishedVersion", journal_offset: 40 }}
        place={{ page: 2 }}
      />
    )
    await user.click(screen.getByRole("button", { name: /Cite/ }))
    await user.click(screen.getByRole("menuitem", { name: "Copy the LaTeX citation" }))
    expect(writeText).toHaveBeenLastCalledWith("\\cite[p.~42]{novak2024}")
    rerender(<CiteMenu card={card} place={{ page: 2, file: "SI 1" }} />)
    await user.click(screen.getByRole("button", { name: /Cite/ }))
    await user.click(screen.getByRole("menuitem", { name: "Copy the LaTeX citation" }))
    expect(writeText).toHaveBeenLastCalledWith("\\cite[SI~1, p.~2]{novak2024}")
  })

  it("opens from the page's own key (controlled)", () => {
    render(<CiteMenu card={card} open onOpenChange={() => {}} />)
    expect(screen.getAllByRole("menuitem")).toHaveLength(4)
  })
})
