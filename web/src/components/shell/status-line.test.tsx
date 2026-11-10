import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  clearStatus,
  resetStatusLine,
  showStatus,
  StatusLine,
  StatusLineCorner,
} from "./status-line"

describe("the status line", () => {
  afterEach(() => {
    resetStatusLine()
    vi.useRealTimers()
  })

  it("says one thing at a time, politely, with its action and key", async () => {
    const user = userEvent.setup()
    const undo = vi.fn()
    render(<StatusLineCorner />)
    act(() => {
      showStatus("Rejected ‘An invented paper’")
      showStatus("Rejected ‘Another invented paper’", {
        action: { label: "Undo", key: "u", onAction: undo },
      })
    })
    const region = screen.getByRole("status")
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region).toHaveTextContent("Rejected ‘Another invented paper’")
    expect(region).not.toHaveTextContent("Rejected ‘An invented paper’")
    const button = screen.getByRole("button", { name: /Undo/ })
    expect(button).toHaveAttribute("aria-keyshortcuts", "u")
    await user.click(button)
    expect(undo).toHaveBeenCalledOnce()
  })

  it("goes after its time, but a failure stays until replaced", () => {
    vi.useFakeTimers()
    render(<StatusLineCorner />)
    act(() => void showStatus("Copied", { ttl: 1000 }))
    act(() => void vi.advanceTimersByTime(1200))
    expect(screen.getByRole("status")).toHaveTextContent("")
    act(() => void showStatus("Not saved", { tone: "danger" }))
    act(() => void vi.advanceTimersByTime(60_000))
    expect(screen.getByRole("status")).toHaveTextContent("Not saved")
    act(() => clearStatus())
    act(() => void vi.advanceTimersByTime(100))
    expect(screen.getByRole("status")).toHaveTextContent("")
  })

  it("shows in the page's own place when the page has one, else in the corner", () => {
    const { rerender } = render(
      <>
        <StatusLineCorner />
        <div data-testid="list">
          <StatusLine />
        </div>
      </>
    )
    act(() => void showStatus("Accepted ‘An invented paper’"))
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByTestId("list")).toHaveTextContent("Accepted ‘An invented paper’")
    rerender(<StatusLineCorner />)
    expect(screen.getByRole("status")).toHaveTextContent("Accepted ‘An invented paper’")
  })
})
