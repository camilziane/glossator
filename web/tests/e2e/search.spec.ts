import type { Page } from "@playwright/test"

import { expect, expectAccessible, test } from "./test"

// Invented passages over the synthetic library's articles (tests/fixtures/library.json). The
// summary's passage is flattened `field: value` lines, as the server sends them.
const HITS = [
  {
    ref: "ml/novak2024/paper.pdf#4.1",
    cite: "Novak & Ito 2024, Trans. Synth. Signals",
    snippet: "…the toy filter raises accuracy on every invented session…",
    bib: "ml",
    key: "novak2024",
    source: "paper.pdf",
    page: 4,
    passage: 1,
  },
  {
    ref: "ml/ashworth2026/record:details",
    cite: "Ashworth & Kim 2026, arXiv",
    snippet:
      "…sparse layers of an invented filter architecture: attention over the toy set source: p. 3…",
    bib: "ml",
    key: "ashworth2026",
    source: "record:details",
    page: null,
    passage: null,
  },
  {
    ref: "ml/novak2024/supplementary/table s1.pdf#2.3",
    cite: "Novak & Ito 2024, Trans. Synth. Signals",
    snippet: "Filter taps for each toy channel.",
    bib: "ml",
    key: "novak2024",
    source: "supplementary/table s1.pdf",
    page: 2,
    passage: 3,
  },
]

const NOVAK_TITLE = "A toy convolutional filter for invented field signals"
const ASHWORTH_TITLE = /^Sparse attention over invented sensor graphs/

/** A paper's passage as /api/read gives it: the snippet inside whole sentences. */
const PASSAGE =
  "The toy filter passage, read whole. Here the toy filter raises accuracy on every invented session, as the table shows. After it."

const PAGE_TEXT = `Text before the passage.\n\n${PASSAGE}\n\nText after it.`

/**
 * /api/search answers the invented hits (in the mode asked, or `mode`); /api/read a passage or its
 * page. These routes take over from the `api` fixture's, so they keep their own record of the calls.
 */
async function mockSearch(page: Page, { mode }: { mode?: string } = {}) {
  const sent = { searches: [] as URLSearchParams[], reads: [] as URLSearchParams[] }
  await page.route("**/api/search?*", (route) => {
    const url = new URL(route.request().url())
    sent.searches.push(url.searchParams)
    return route.fulfill({
      json: {
        query: url.searchParams.get("q") ?? "",
        mode: mode ?? url.searchParams.get("mode") ?? "hybrid",
        hits: HITS,
      },
    })
  })
  await page.route("**/api/read?*", (route) => {
    const url = new URL(route.request().url())
    sent.reads.push(url.searchParams)
    const whole = url.searchParams.get("page") === "1"
    const ref = url.searchParams.get("ref") ?? ""
    return route.fulfill({
      json: {
        ref,
        text: whole
          ? PAGE_TEXT
          : ref.includes("record:")
            ? "problem: Attention is slow.\nidea: Sparse layers of an invented filter.\narchitecture: attention over the toy set"
            : PASSAGE,
      },
    })
  })
  return sent
}

const isPhone = () => test.info().project.name === "phone"

/** The reader: the side column on wide screens (≥ 1280 px), else a sheet (dialog). */
function reader(page: Page) {
  const wide = (page.viewportSize()?.width ?? 0) >= 1280
  return wide ? page.getByRole("complementary", { name: "Passage" }) : page.getByRole("dialog")
}

test.describe("full-text search", () => {
  test("groups passages by article, with page marks, files and labelled summaries", async ({
    page,
    consoleErrors,
  }) => {
    const sent = await mockSearch(page)
    await page.goto("/search/?q=toy+filter")
    await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeAttached()
    await expect(page.locator("#search-status")).toHaveText("3 passages in 2 articles")
    expect(Object.fromEntries(sent.searches[0] ?? [])).toMatchObject({
      q: "toy filter",
      mode: "hybrid",
      scope: "all",
    })
    // The filters as one sentence of text menus, no eyebrows.
    await expect(page.getByRole("search")).toContainText(
      "Words and meaning in everything from every bibliography"
    )

    const novak = page.getByRole("region", { name: NOVAK_TITLE })
    // The passage's match is one highlight (the title marks its words too, one by one).
    await expect(novak.locator("[data-passage] mark").first()).toHaveText("toy filter")
    await expect(novak.getByRole("link", { name: /^p\. 4/ })).toHaveAttribute(
      "href",
      "/library/ml/articles/novak2024/paper.pdf#page=4"
    )
    await expect(novak.getByText("table s1.pdf")).toBeVisible()
    const ashworth = page.getByRole("region", { name: ASHWORTH_TITLE })
    await expect(ashworth.getByText("Method", { exact: true })).toBeVisible()
    await expect(ashworth.getByText("Architecture or algorithm")).toBeVisible()
    await expect(ashworth).not.toContainText("architecture:")
    expect(consoleErrors).toEqual([])
  })

  test("reads a passage, then its whole page", async ({ page }) => {
    const sent = await mockSearch(page)
    await page.goto("/search/?q=toy+filter")
    await expect(page.locator("#search-status")).toContainText("3 passages")
    await page.getByRole("region", { name: NOVAK_TITLE }).locator("[data-passage]").first().click()
    await expect(page).toHaveURL(/read=ml(\/|%2F)novak2024(\/|%2F)paper\.pdf%234\.1/)
    const panel = reader(page)
    await expect(panel).toContainText("The toy filter passage, read whole.")
    await expect(panel.getByRole("link", { name: /PDF p\. 4/ })).toHaveAttribute("target", "_blank")
    await panel.getByRole("button", { name: "All of page 4" }).click()
    await expect(panel.getByText("Text before the passage.")).toBeVisible()
    await expect(panel.getByText("This passage")).toBeVisible()
    // (A dev server's strict mode may ask twice: count what was asked, not how often. The
    // supplementary file's first page is read too, to know what the file is.)
    const paper = sent.reads.filter((q) => q.get("ref")?.startsWith("ml/novak2024/paper.pdf"))
    expect([...new Set(paper.map((q) => q.get("page")))]).toEqual([null, "1"])
  })

  test("keeps the mode, scope and bibliography in the URL", async ({ page }) => {
    const sent = await mockSearch(page)
    await page.goto("/search/?q=filter")
    await expect(page.locator("#search-status")).toContainText("3 passages")
    await page.getByRole("button", { name: "Match: Words and meaning" }).click()
    await page.getByRole("menuitemradio", { name: /^Words(?! and)/ }).click()
    await expect(page).toHaveURL(/mode=keyword/)
    await page.getByRole("button", { name: "Search in: everything" }).click()
    await page.getByRole("menuitemradio", { name: /^the summaries/i }).click()
    await expect(page).toHaveURL(/scope=records/)
    await page.getByRole("button", { name: "Bibliography: every bibliography" }).click()
    await page.getByRole("menuitemradio", { name: /^ML methods/ }).click()
    await expect(page).toHaveURL(/bib=ml/)
    await expect
      .poll(() => Object.fromEntries(sent.searches.at(-1) ?? []))
      .toMatchObject({ q: "filter", mode: "keyword", scope: "records", bib: "ml" })
  })

  test("says honestly when the answer went by words only", async ({ page }) => {
    await mockSearch(page, { mode: "keyword" })
    await page.route("**/api/status", (route) => route.fulfill({ json: { semantic: false } }))
    await page.goto("/search/?q=filter")
    await expect(page.getByText(/By words only: the meaning model is still loading/)).toBeVisible()
  })

  test("without the API, says what to run and still finds articles by title", async ({ page }) => {
    await page.route("**/api/**", (route) => route.abort())
    await page.goto("/search/?q=moisture")
    await expect(
      page.getByRole("heading", { name: "No answer from glossator serve" })
    ).toBeVisible()
    await expect(page.locator("code").filter({ hasText: "glossator serve" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Mapping soil moisture/ }).first()).toHaveAttribute(
      "href",
      /^\/article\/\?b=grassland&k=lindqvist2026/
    )
  })

  test("shows the server's words when the search fails", async ({ page }) => {
    await page.route("**/api/search?*", (route) =>
      route.fulfill({ status: 404, json: { error: "no index yet: run glossator build" } })
    )
    await page.goto("/search/?q=filter")
    await expect(
      page.getByRole("alert").filter({ hasText: "The search could not answer" })
    ).toContainText("no index yet: run glossator build")
  })

  test("is driven by the keyboard: ↓ ↑ preview, Enter opens the article, Esc comes back", async ({
    page,
  }) => {
    test.skip(isPhone(), "keyboard shortcuts are for desktops")
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockSearch(page)
    await page.goto("/search/")
    // No help box before a search: the field, focused, and three searches to try.
    await expect(page.getByRole("searchbox", { name: "Search the papers" })).toBeFocused()
    await expect(page.getByText(/^Try “/)).toBeVisible()
    await page.keyboard.type("filter")
    await expect(page.locator("#search-status")).toContainText("3 passages")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    const second = page.locator("[data-passage]").nth(1)
    await expect(second).toBeFocused()
    await expect(reader(page).getByText("table s1.pdf")).toBeVisible()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=ashworth2026&from=.*#details$/)
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/\/search\/\?q=filter(&|$)/)
    await expect(page.locator("[data-passage]").nth(2)).toBeFocused()
  })

  test("copies the citation with its page and the passage with its citation", async ({
    page,
    context,
  }) => {
    test.skip(isPhone(), "keyboard shortcuts are for desktops")
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockSearch(page)
    await page.goto("/search/?q=toy+filter")
    await expect(page.locator("[data-passage]").first()).toBeFocused()
    // The synthetic paper is an accepted manuscript: its pages are the manuscript's.
    await page.keyboard.press("c")
    await expect(page.getByText("\\cite{novak2024} % manuscript p. 4")).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "\\cite{novak2024} % manuscript p. 4"
    )
    // The whole sentence of the passage, never the snippet's cut.
    await page.keyboard.press("y")
    await expect(page.getByText("Copied the passage with its citation")).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "“Here the toy filter raises accuracy on every invented session, as the table shows.” (Novak & Ito 2024, manuscript p. 4)"
    )
  })

  test("is accessible, in light and dark", async ({ page }) => {
    await mockSearch(page)
    await page.goto("/search/?q=toy+filter")
    await expect(page.locator("#search-status")).toContainText("3 passages")
    await expectAccessible(page)
    await page.locator("[data-passage]").first().click()
    await expect(reader(page)).toContainText("The toy filter passage, read whole.")
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
  })
})

test.describe("the ⌘K palette", () => {
  async function openPalette(page: Page) {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    if (isPhone()) {
      await page
        .locator("header")
        .first()
        .getByRole("button", { name: "Search the library" })
        .click()
    } else {
      await page.keyboard.press("ControlOrMeta+k")
    }
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    return dialog
  }

  test("finds articles and inbox papers, accents folded, and opens one", async ({ page }) => {
    const dialog = await openPalette(page)
    await dialog.getByRole("combobox").fill("drenaje montana")
    const paper = dialog.getByRole("option", { name: /Drenaje nocturno/ })
    await expect(paper).toBeVisible()
    await expect(paper).toContainText("inbox")
    await expect(dialog.getByRole("status")).toHaveText("1 inbox paper")
    await dialog.getByRole("combobox").fill("muller")
    await dialog.getByRole("option", { name: /Ferreira et al\. 2025/ }).click()
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=ferreira2025$/)
  })

  test("puts a bibliography first on a prefix of its name, and Enter goes there", async ({
    page,
  }) => {
    const dialog = await openPalette(page)
    await dialog.getByRole("combobox").fill("ml")
    await expect(dialog.getByRole("option").first()).toContainText("ML methods")
    await expect(dialog.getByRole("option").first()).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/bib\/\?b=ml$/)
  })

  test("goes to the full-text search from its row", async ({ page }) => {
    const dialog = await openPalette(page)
    await dialog.getByRole("combobox").fill("toy spindle")
    await dialog.getByRole("option", { name: /full text for “toy spindle”/ }).click()
    await expect(page).toHaveURL(/\/search\/\?q=toy\+spindle$/)
    await expect(page.getByRole("searchbox", { name: "Search the papers" })).toHaveValue(
      "toy spindle"
    )
  })

  test("keeps the full-text row last, and Ctrl+Enter takes it from any row", async ({ page }) => {
    test.skip(isPhone(), "keyboard shortcuts are for desktops")
    const dialog = await openPalette(page)
    await dialog.getByRole("combobox").fill("invented")
    await expect(dialog.getByRole("option").last()).toContainText("Search the full text for")
    await expect(dialog.getByRole("option").first()).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("ControlOrMeta+Enter")
    await expect(page).toHaveURL(/\/search\/\?q=invented$/)
  })

  test("puts the full-text search first for a phrase that starts no title", async ({ page }) => {
    test.skip(isPhone(), "keyboard shortcuts are for desktops")
    const dialog = await openPalette(page)
    await dialog.getByRole("combobox").fill("toy filter session")
    await expect(dialog.getByRole("option").first()).toContainText(
      "Search the full text for “toy filter session”"
    )
    await expect(dialog.getByRole("option").first()).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/search\/\?q=toy\+filter\+session$/)
  })

  test("switches the theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    const dialog = await openPalette(page)
    await dialog.getByRole("option", { name: "Switch to the dark theme" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect(dialog).toBeHidden()
  })

  test("is accessible, in light and dark", async ({ page }) => {
    const dialog = await openPalette(page)
    await dialog.getByRole("combobox").fill("invented")
    await expect(dialog.getByRole("option").first()).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
  })
})
