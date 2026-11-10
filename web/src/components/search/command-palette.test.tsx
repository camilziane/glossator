import { act, fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { indexLibrary } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { router } from "../../../tests/utils/navigation"
import { renderWithApp } from "../../../tests/utils/render"

import { CommandPalette } from "./command-palette"

const lib = indexLibrary(fixtureLibrary())

async function openPalette() {
  await renderWithApp(<CommandPalette />)
  act(() => {
    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  })
  return screen.findByRole("dialog")
}

/** The options in the order drawn, by their text. */
function optionTexts(dialog: HTMLElement): string[] {
  return within(dialog)
    .getAllByRole("option")
    .map((o) => o.textContent ?? "")
}

function highlighted(dialog: HTMLElement): HTMLElement {
  return within(dialog)
    .getAllByRole("option")
    .find((o) => o.getAttribute("aria-selected") === "true")!
}

describe("<CommandPalette>", () => {
  it("opens empty with the pages, the bibliographies and the theme, no icons", async () => {
    const dialog = await openPalette()
    const groups = within(dialog)
    expect(groups.getByRole("option", { name: /^Today/ })).toBeInTheDocument()
    expect(groups.getByRole("option", { name: /^Inbox/ })).toBeInTheDocument()
    expect(groups.getByRole("option", { name: /^Search/ })).toBeInTheDocument()
    const ml = lib.bib("ml")!
    expect(groups.getByRole("option", { name: new RegExp(ml.title) })).toBeInTheDocument()
    expect(groups.getByRole("option", { name: /Switch to the dark theme/ })).toBeInTheDocument()
    expect(groups.getByRole("status")).toHaveTextContent("3 bibliographies")
    // No per-row icons: the rows are words.
    for (const option of groups.getAllByRole("option")) {
      expect(option.querySelector("svg:not(.opacity-0):not(.hidden)")).toBeNull()
    }
  })

  it("puts a page or a bibliography whose name starts with the words first", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    const ml = lib.bib("ml")!
    await user.type(within(dialog).getByRole("combobox"), ml.short.slice(0, 2))
    expect(optionTexts(dialog)[0]).toContain(ml.short)
    expect(highlighted(dialog)).toHaveTextContent(ml.short)
    await user.keyboard("{Enter}")
    expect(router.push).toHaveBeenCalledWith("/bib/?b=ml")
  })

  it("goes to a page by its name, and teaches its chord", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    await user.type(within(dialog).getByRole("combobox"), "inb")
    const inbox = highlighted(dialog)
    expect(inbox).toHaveTextContent(/^Inbox/)
    expect(inbox.querySelector("[data-kbd-hint]")).toHaveTextContent("gi")
    await user.keyboard("{Enter}")
    expect(router.push).toHaveBeenCalledWith("/inbox/")
  })

  it("finds articles by any word, accents folded: serif title, the citation marked", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    await user.type(within(dialog).getByRole("combobox"), "muller modellver")
    const ferreira = lib.article("ml", "ferreira2025")!.article
    const option = await within(dialog).findByRole("option", { name: /Ferreira et al\. 2025/ })
    expect(option).toHaveTextContent(ferreira.title)
    expect(option.querySelector("mark")).not.toBeNull()
    expect(within(dialog).getByRole("status")).toHaveTextContent("1 article")
    await user.keyboard("{Enter}")
    expect(router.push).toHaveBeenCalledWith("/article/?b=ml&k=ferreira2025")
  })

  it("shows a fragment of the one-liner when the words matched there only", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    const novak = lib.article("ml", "novak2024")!.article
    // A word of the one-liner that the title and the citation do not have.
    const word = novak.one_line
      .split(/\W+/)
      .find(
        (w) =>
          w.length > 4 &&
          !novak.title.toLowerCase().includes(w.toLowerCase()) &&
          !novak.cite.includes(w)
      )!
    await user.type(within(dialog).getByRole("combobox"), `${word} ${novak.key}`)
    const option = await within(dialog).findByRole("option", { name: /Novak & Ito 2024/ })
    const marks = [...option.querySelectorAll("mark")].map((m) => m.textContent?.toLowerCase())
    expect(marks).toContain(word.toLowerCase())
  })

  it("says when an article is retracted", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    await user.type(within(dialog).getByRole("combobox"), "moisture")
    const option = await within(dialog).findByRole("option", { name: /Lindqvist et al\. 2026/ })
    expect(option).toHaveTextContent("Retracted")
  })

  it("lists inbox papers in italic, says they are the inbox's, and links to one", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    const paper = lib.inboxPaper("lopez2026drenaje")!
    await user.type(within(dialog).getByRole("combobox"), "praderas")
    const option = await within(dialog).findByRole("option", {
      name: new RegExp(paper.title.slice(0, 12)),
    })
    expect(option.querySelector(".italic")).toHaveTextContent(paper.title)
    expect(option).toHaveTextContent(/inbox/)
    await user.click(option)
    expect(router.push).toHaveBeenCalledWith("/inbox/?p=lopez2026drenaje")
  })

  it("ends with the full-text search, which Enter does when it is highlighted, and Ctrl+Enter anywhere", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    const input = within(dialog).getByRole("combobox")
    await user.type(input, "zzqx spindle")
    const fullText = within(dialog).getByRole("option", {
      name: /Search the full text for “zzqx spindle”/,
    })
    // Nothing else matches: it is the only option, so the highlighted one.
    expect(within(dialog).getByRole("status")).toHaveTextContent("No article or inbox paper")
    expect(highlighted(dialog)).toBe(fullText)
    await user.keyboard("{Enter}")
    expect(router.push).toHaveBeenLastCalledWith("/search/?q=zzqx+spindle")
  })

  it("keeps the full-text row last, and Ctrl+Enter searches the full text from any row", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    const input = within(dialog).getByRole("combobox")
    await user.type(input, "invented")
    const options = within(dialog).getAllByRole("option")
    expect(options.at(-1)).toHaveTextContent("Search the full text for “invented”")
    expect(highlighted(dialog)).not.toBe(options.at(-1))
    await user.keyboard("{Control>}{Enter}{/Control}")
    expect(router.push).toHaveBeenLastCalledWith("/search/?q=invented")
  })

  it("puts the full-text search first for three words or more that start no title", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    await user.type(within(dialog).getByRole("combobox"), "toy filter session")
    const options = within(dialog).getAllByRole("option")
    expect(options[0]).toHaveTextContent("Search the full text for “toy filter session”")
    expect(highlighted(dialog)).toBe(options[0])
    // Its key is Enter alone, drawn (no font has ↵).
    expect(options[0]!.querySelector('[aria-label="Enter"] svg')).not.toBeNull()
    await user.keyboard("{Enter}")
    expect(router.push).toHaveBeenLastCalledWith("/search/?q=toy+filter+session")
  })

  it("keeps a title's first words a title: the article first, the full text last", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    const novak = lib.article("ml", "novak2024")!.article
    const start = novak.title.split(" ").slice(0, 3).join(" ")
    await user.type(within(dialog).getByRole("combobox"), start)
    const options = within(dialog).getAllByRole("option")
    expect(highlighted(dialog)).toHaveTextContent(novak.title)
    expect(options.at(-1)).toHaveTextContent(`Search the full text for “${start}”`)
  })

  it("sets the citation in the serif, surnames in small caps, the match marked", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    await user.type(within(dialog).getByRole("combobox"), "novak")
    const option = await within(dialog).findByRole("option", { name: /Novak & Ito 2024/ })
    const surname = option.querySelector(".cite .au")
    expect(surname).toHaveTextContent("Novak")
    expect(surname?.querySelector("mark")).not.toBeNull()
    expect(surname?.closest(".font-serif")).not.toBeNull()
  })

  it("highlights the first result of each query, the one aria-activedescendant names", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    const input = within(dialog).getByRole("combobox")
    await user.type(input, "praderas")
    const paper = lib.inboxPaper("lopez2026drenaje")!
    const first = await within(dialog).findByRole("option", {
      name: new RegExp(paper.title.slice(0, 12)),
    })
    expect(first).toHaveAttribute("aria-selected", "true")
    expect(input).toHaveAttribute("aria-activedescendant", first.id)
    await user.keyboard("{ArrowDown}")
    const next = highlighted(dialog)
    expect(next).not.toBe(first)
    expect(input).toHaveAttribute("aria-activedescendant", next.id)
    // A new query starts at its first result again.
    await user.clear(input)
    await user.type(input, "muller")
    const ferreira = await within(dialog).findByRole("option", { name: /Ferreira et al\. 2025/ })
    expect(ferreira).toHaveAttribute("aria-selected", "true")
    expect(input).toHaveAttribute("aria-activedescendant", ferreira.id)
  })

  it("holds its title inside the dialog, and gives the focus back when it closes", async () => {
    const user = userEvent.setup()
    await renderWithApp(
      <>
        <button type="button">Before</button>
        <CommandPalette />
      </>
    )
    screen.getByRole("button", { name: "Before" }).focus()
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    })
    const dialog = await screen.findByRole("dialog", { name: "Search the library" })
    expect(within(dialog).getByText("Search the library", { selector: "h2" })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus()
  })

  it("keeps its key hints in a footer that touch screens hide", async () => {
    const dialog = await openPalette()
    const footer = dialog.querySelector("footer")!
    expect(footer.querySelector("[data-kbd-hint]")).toHaveTextContent(
      /move.*open.*full text.*close/
    )
  })

  it("filters its own commands by the words typed", async () => {
    const user = userEvent.setup()
    const dialog = await openPalette()
    await user.type(within(dialog).getByRole("combobox"), "dark theme")
    expect(within(dialog).getByRole("option", { name: /Switch to the dark theme/ })).toBeVisible()
    expect(within(dialog).queryByRole("option", { name: /^Today/ })).toBeNull()
  })
})
