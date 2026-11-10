import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Notice, Prior } from "@/lib/data"

import { CliCommand } from "./cli-command"
import { DraftBadge, NoticeBadges, SeriousNoticeBadge } from "./notice-badge"
import { MeterBar, PriorMeter, PriorNote, RelevanceMark, RelevanceStars, Stars } from "./relevance"

const notice = (type: string): Notice => ({
  type,
  label: type,
  doi: "10.5555/invented",
  date: "2026-02-03",
  title: `An invented ${type}`,
})

describe("notice badges", () => {
  it("says the gravest notice in a word, and nothing for a correction alone", () => {
    const { rerender } = render(
      <SeriousNoticeBadge notices={[notice("correction"), notice("retraction")]} />
    )
    expect(screen.getByText("Retracted")).toBeInTheDocument()
    rerender(<SeriousNoticeBadge notices={[notice("correction")]} />)
    expect(screen.queryByText("Corrected")).not.toBeInTheDocument()
  })

  it("lists every notice, serious ones first", () => {
    render(<NoticeBadges notices={[notice("correction"), notice("withdrawal")]} />)
    const words = screen.getAllByText(/Corrected|Withdrawn/).map((el) => el.textContent)
    expect(words).toEqual(["Withdrawn", "Corrected"])
  })

  it("draws words in their ink, no pill, no icon", () => {
    render(
      <>
        <SeriousNoticeBadge notices={[notice("retraction")]} />
        <DraftBadge />
      </>
    )
    const retracted = screen.getByText("Retracted")
    expect(retracted).toHaveAttribute("data-slot", "badge")
    expect(retracted).toHaveClass("text-danger")
    expect(retracted.className).not.toMatch(/\bbg-|rounded-(?:full|4xl)/)
    expect(retracted.querySelector("svg")).toBeNull()
    expect(retracted).toHaveAttribute("title", "retraction (3 Feb 2026): An invented retraction")
    expect(screen.getByText("Draft")).toHaveClass("text-warning")
  })
})

describe("relevance and prior", () => {
  it("names the relevance for screen readers, with or without the word", () => {
    const { rerender } = render(<RelevanceStars value={2} />)
    expect(screen.getByRole("img", { name: "Relevance 2 of 3: Related" })).toBeInTheDocument()
    expect(screen.getByText("Related")).toBeInTheDocument()
    rerender(<RelevanceStars value={null} showLabel={false} />)
    expect(screen.getByRole("img", { name: "Relevance: not rated" })).toBeInTheDocument()
    expect(screen.queryByText("Not rated")).not.toBeInTheDocument()
  })

  it("marks each relevance with its glyph and names it", () => {
    const { container, rerender } = render(<RelevanceMark value={3} />)
    const mark = screen.getByRole("img", { name: "Relevance 3 of 3: In scope" })
    expect(mark).toHaveTextContent("¶")
    expect(mark.querySelector(".text-rubric")).not.toBeNull()
    rerender(<RelevanceMark value={2} />)
    expect(screen.getByRole("img", { name: "Relevance 2 of 3: Related" })).toHaveTextContent("•")
    expect(container.querySelector(".text-rubric")).toBeNull()
    rerender(<RelevanceMark value={1} />)
    expect(
      screen.getByRole("img", { name: "Relevance 1 of 3: Loosely related" })
    ).toHaveTextContent("·")
    rerender(<RelevanceMark value={0} />)
    expect(
      screen.getByRole("img", { name: "Relevance 0 of 3: Unrelated" }).querySelector("svg")
    ).not.toBeNull()
    rerender(<RelevanceMark value={null} showLabel />)
    expect(screen.getByRole("img", { name: "Relevance: not rated" })).toHaveTextContent("Not rated")
  })

  it("says the prior in words and a tabular number, no bar", () => {
    const prior: Prior = { bib: "ml", score: 0.861, by: "similarity" }
    const { container, rerender } = render(<PriorNote prior={prior} bibLabel="ML methods" />)
    expect(container).toHaveTextContent("closest to ML methods · 0.86")
    // Text, not a flex box: in a narrow margin the words wrap and "· 0.86" stays whole.
    expect(container.firstElementChild).not.toHaveClass("inline-flex")
    const meter = screen.getByRole("meter", { name: "Prior, closeness to ML methods" })
    expect(meter).toHaveTextContent("0.86")
    expect(meter).toHaveClass("num")
    rerender(<PriorNote prior={prior} bibLabel="ML methods" words={false} />)
    expect(container).toHaveTextContent(/^0\.86$/)
    rerender(<PriorNote prior={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("keeps the former stars and meters working in the new look", () => {
    const { container } = render(
      <>
        <Stars value={3} />
        <MeterBar value={0.5} />
        <PriorMeter prior={null} />
      </>
    )
    expect(container).toHaveTextContent("¶")
    expect(container.querySelectorAll("[style*=width]")).toHaveLength(0)
    expect(screen.getByText("Prior: not scored")).toHaveClass("sr-only")
  })

  it("draws the prior as a meter with its score", () => {
    const prior: Prior = { bib: "ml", score: 0.734, by: "model" }
    render(<PriorMeter prior={prior} bibLabel="ML methods" />)
    const meter = screen.getByRole("meter", { name: "Prior, closeness to ML methods" })
    expect(meter).toHaveAttribute("aria-valuenow", "0.734")
    expect(meter).toHaveAttribute("aria-valuetext", "0.73 (by a model trained on past decisions)")
    expect(screen.getByText("0.73")).toBeInTheDocument()
  })
})

describe("CliCommand", () => {
  it("copies its command", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<CliCommand command="glossator inbox run" />)
    await user.click(screen.getByRole("button", { name: "Copy: glossator inbox run" }))
    expect(writeText).toHaveBeenCalledWith("glossator inbox run")
    expect(screen.getByRole("button", { name: "Copied: glossator inbox run" })).toBeInTheDocument()
  })
})
