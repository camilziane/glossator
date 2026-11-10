import { type Page } from "@playwright/test"

import { expect, expectAccessible, test } from "./test"

const isPhone = () => test.info().project.name === "phone"

/** The Articles rows: table rows on wide screens, compact rows on phones. */
function articleItems(page: Page) {
  return isPhone()
    ? page.getByRole("list", { name: /^Articles of/ }).getByRole("listitem")
    : page.getByRole("table", { name: /^Articles of/ }).locator("tbody tr")
}

async function openHub(page: Page, search: string) {
  await page.goto(`/bib/?${search}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
}

/** The polite count under the toolbar ("2 of 4 articles"; hidden while nothing is filtered). */
function count(page: Page) {
  return page.getByRole("status").filter({ hasText: "articles" })
}

test.describe("a bibliography's hub", () => {
  test("shows the header on one line, the figures and the tables", async ({
    page,
    consoleErrors,
  }) => {
    await openHub(page, "b=grassland")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Grassland soil and canopy sensors, invented"
    )
    const numbers = page.getByRole("list", { name: "In numbers" })
    await expect(numbers).toContainText("4 articles")
    await expect(numbers).toContainText("2023–2026")
    await expect(numbers.getByRole("button", { name: "1 retracted" })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Articles/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await expect(page.getByRole("tab", { name: /Plots/ })).toBeVisible()
    await expect(articleItems(page)).toHaveCount(4)
    await expect(articleItems(page).first()).toContainText("Retracted")
    await expect(count(page)).toHaveText("4 articles")
    expect(consoleErrors).toEqual([])
  })

  test("is accessible, in light and dark, with the preview open", async ({ page }) => {
    await openHub(page, "b=grassland")
    await expect(articleItems(page)).toHaveCount(4)
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
    if (!isPhone()) {
      await articleItems(page).first().focus()
      await page.keyboard.press(" ")
      await expect(page.getByRole("region", { name: /moisture/i })).toBeVisible()
      await expectAccessible(page)
      await page.keyboard.press("Escape")
    }
    await page.getByRole("tab", { name: /Plots/ }).click()
    await expect(page.getByText("P1", { exact: true })).toBeVisible()
    await expectAccessible(page)
  })

  test("filters with the field and keeps the filter in the URL", async ({ page }) => {
    await openHub(page, "b=grassland")
    await page.getByRole("searchbox", { name: "Filter the articles" }).fill("moisture")
    await expect(articleItems(page)).toHaveCount(1)
    await expect(page).toHaveURL(/[?&]q=moisture/)
    await expect(count(page)).toHaveText("1 of 4 articles")
    await page.reload()
    await expect(page.getByRole("searchbox", { name: "Filter the articles" })).toHaveValue(
      "moisture"
    )
    await expect(articleItems(page)).toHaveCount(1)
    await page.getByRole("button", { name: "Clear the filters" }).click()
    await expect(articleItems(page)).toHaveCount(4)
    await expect(page).toHaveURL(/\/bib\/\?b=grassland$/)
  })

  test("focuses the filter with /", async ({ page }) => {
    test.skip(isPhone(), "no keyboard shortcut on phones")
    await openHub(page, "b=grassland")
    await page.keyboard.press("/")
    await expect(page.getByRole("searchbox", { name: "Filter the articles" })).toBeFocused()
  })

  test("filters by tags from the Tags menu, all of them or any", async ({ page }) => {
    await openHub(page, "b=grassland")
    await page.getByRole("button", { name: /^Tags/ }).click()
    const list = page.getByRole("listbox", { name: "Tags" })
    await expect(list.getByRole("option", { name: /Probe array/ })).toContainText("2")
    // The field to find a tag has the focus: typing narrows, Enter toggles the first match.
    await expect(page.getByPlaceholder("Find a tag")).toBeFocused()
    await page.keyboard.type("probe")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/[?&]tag=Probe\+array/)
    await page.getByPlaceholder("Find a tag").fill("")
    await list.getByRole("option", { name: /^Drainage/ }).click()
    await page.keyboard.press("Escape")
    // All the tags by default: the line under the toolbar says "and".
    await expect(articleItems(page)).toHaveCount(1)
    await expect(articleItems(page).first()).toContainText("Okafor")
    await expect(page.getByText("and", { exact: true })).toBeVisible()
    await expect(page).toHaveURL(
      /[?&]tag=Probe\+array.*tag=Drainage|tag=Drainage.*tag=Probe\+array/
    )
    await page.getByRole("button", { name: /^Tags/ }).click()
    await page.getByRole("radio", { name: "any" }).click()
    await page.keyboard.press("Escape")
    await expect(articleItems(page)).toHaveCount(2)
    await expect(page.getByText("or", { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/[?&]tagmode=any/)
    await page.getByRole("button", { name: "Remove the tag Drainage" }).click()
    await expect(page).not.toHaveURL(/tag=Drainage/)
  })

  test("filters by notices, status and years from a shared link or the header", async ({
    page,
  }) => {
    await openHub(page, "b=grassland&notice=serious")
    await expect(articleItems(page)).toHaveCount(1)
    await expect(articleItems(page).first()).toContainText("Lindqvist")
    await openHub(page, "b=grassland&status=draft")
    await expect(articleItems(page)).toHaveCount(1)
    await expect(articleItems(page).first()).toContainText("Brandt")
    await openHub(page, "b=grassland&year=2024-2025")
    await expect(articleItems(page)).toHaveCount(2)
    await expect(page.getByRole("button", { name: /^Year/ }).first()).toContainText("2024–2025")
    await openHub(page, "b=grassland")
    await page.getByRole("button", { name: "1 draft" }).click()
    await expect(page).toHaveURL(/[?&]status=draft/)
    await expect(articleItems(page)).toHaveCount(1)
  })

  test("says when no article matches", async ({ page }) => {
    await openHub(page, "b=grassland&q=nothing-like-this")
    await expect(page.getByText("No article matches")).toBeVisible()
    await page.getByRole("button", { name: "Clear the filters" }).click()
    await expect(articleItems(page)).toHaveCount(4)
  })

  test("sorts from the column heads", async ({ page }) => {
    test.skip(isPhone(), "phones sort from the Sort menu")
    await openHub(page, "b=grassland")
    const table = page.getByRole("table", { name: /^Articles of/ })
    await expect(table.getByRole("columnheader", { name: /Year/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    )
    await table.getByRole("button", { name: "Year" }).click()
    await expect(table.getByRole("columnheader", { name: /Year/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    )
    await expect(articleItems(page).first()).toContainText("Mendes")
    await expect(page).toHaveURL(/[?&]sort=year\.asc/)
    await table.getByRole("button", { name: "Article" }).click()
    await expect(articleItems(page).first()).toContainText("Brandt")
    await expect(page).toHaveURL(/[?&]sort=article\.asc/)
    // Key metrics mix kinds of figures: no sort there.
    await expect(
      table.getByRole("columnheader", { name: /Key metrics/ }).getByRole("button")
    ).toHaveCount(0)
  })

  test("sorts from the Sort menu on phones", async ({ page }) => {
    test.skip(!isPhone(), "wide screens sort from the column heads")
    await openHub(page, "b=grassland")
    await page.getByRole("button", { name: /^Sort:/ }).click()
    await page.getByRole("menuitemradio", { name: "Oldest first" }).click()
    await expect(articleItems(page).first()).toContainText("Mendes")
    await expect(page).toHaveURL(/[?&]sort=year\.asc/)
  })

  test("opens an article from its row, carrying the list, and comes back to the row", async ({
    page,
  }) => {
    await openHub(page, "b=ml&sort=article.asc")
    if (isPhone()) {
      await articleItems(page).nth(1).getByRole("link").click()
      await expect(page).toHaveURL(/\/article\/\?b=ml&k=ferreira2025&from=/)
      return
    }
    const rows = articleItems(page)
    // The first row has the focus on arrival: its keys work at once.
    await expect(rows.first()).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(rows.nth(1)).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=ferreira2025&from=/)
    const from = new URL(page.url()).searchParams.get("from")
    expect(from).toBe("/bib/?b=ml&sort=article.asc")
    await page.goBack()
    await expect(rows.nth(1)).toBeFocused()
    await rows.nth(2).getByRole("link").click()
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=novak2024&from=/)
  })

  test("previews a row: Space, ↓ to move, Esc to close on the row", async ({ page }) => {
    test.skip(isPhone(), "phones preview in a bottom sheet")
    await openHub(page, "b=grassland")
    const rows = articleItems(page)
    await rows.first().focus()
    await page.keyboard.press(" ")
    const first = page.getByRole("region", { name: /moisture/i })
    await expect(first).toBeVisible()
    await expect(first.getByRole("heading", { name: "Key metrics" })).toBeVisible()
    await expect(first.getByRole("link", { name: /^Open/ })).toHaveAttribute("href", /from=/)
    await expect(first.getByRole("link", { name: /^PDF/ })).toBeVisible()
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("region", { name: /Night drainage/ })).toBeVisible()
    await expect(rows.nth(1)).toBeFocused()
    await page.keyboard.press("c")
    await expect(page.getByRole("menuitem", { name: "Copy the citation key" })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("region", { name: /Night drainage/ })).toBeHidden()
    await rows.nth(1).focus()
    // A click on a row outside its title previews it too.
    await rows.nth(2).locator("td").nth(3).click()
    await expect(page.getByRole("region", { name: /surface mat/i })).toBeVisible()
  })

  test("previews a row in a bottom sheet on phones", async ({ page }) => {
    test.skip(!isPhone(), "wide screens preview in a drawer")
    await openHub(page, "b=grassland")
    await articleItems(page).first().locator("div").last().click()
    const sheet = page.getByRole("dialog", { name: /moisture/i })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole("link", { name: /^Open/ })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
  })

  test("shows a cut cell's whole text after a pause", async ({ page }) => {
    test.skip(isPhone(), "phones show compact rows")
    await openHub(page, "b=grassland")
    await page.getByRole("radio", { name: "1 line" }).click()
    const cell = articleItems(page).first().locator("[data-clamp][data-cut]").first()
    await cell.hover()
    await expect(page.getByRole("tooltip")).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(page.getByRole("tooltip")).toBeHidden()
  })

  test("shows and hides columns, rows of one line, two or all, and copies them", async ({
    page,
    context,
  }) => {
    test.skip(isPhone(), "the column check needs the table")
    await openHub(page, "b=ml")
    const table = page.getByRole("table", { name: /^Articles of/ })
    await expect(table.getByRole("columnheader", { name: /Tags/ })).toHaveCount(0)
    // A short table shows everything until the reader asks for less.
    await expect(table).toHaveAttribute("data-lines", "full")
    await page.getByRole("button", { name: /^Columns/ }).click()
    await page.getByRole("menuitemcheckbox", { name: "Tags" }).click()
    await page.getByRole("menuitemcheckbox", { name: "Idea" }).click()
    await page.keyboard.press("Escape")
    await expect(table.getByRole("columnheader", { name: /Tags/ })).toBeVisible()
    await expect(table.getByRole("columnheader", { name: /Idea/ })).toHaveCount(0)
    await expect(page).toHaveURL(/cols=tags/)
    await expect(page).toHaveURL(/cols=idea/)

    await page.getByRole("radio", { name: "1 line" }).click()
    await expect(table).toHaveAttribute("data-lines", "1")
    await page.reload()
    await expect(page.getByRole("table", { name: /^Articles of/ })).toHaveAttribute(
      "data-lines",
      "1"
    )

    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.getByRole("button", { name: /^Copy/ }).click()
    await page.getByRole("menuitem", { name: "The table as LaTeX table" }).click()
    const tex = await page.evaluate(() => navigator.clipboard.readText())
    expect(tex).toContain("\\begin{tabularx}{\\linewidth}")
    expect(tex).toContain("\\cite{novak2024}")
    expect(tex).not.toContain("Idea")

    await page.getByRole("button", { name: /^(Copy|Copied)/ }).click()
    await page.getByRole("menuitem", { name: "The headline metrics as CSV" }).click()
    const csv = await page.evaluate(() => navigator.clipboard.readText())
    expect(csv.split("\n")[0]).toBe("Key,Citation,Metric,Value,CI,Condition,Page")
    expect(csv).toContain("novak2024,")
  })

  test("switches tables with the tabs; an sensor type filters the articles", async ({ page }) => {
    await openHub(page, "b=grassland")
    await page.getByRole("tab", { name: /Sensor types/ }).click()
    await expect(page).toHaveURL(/#sensors$/)
    await page.getByRole("link", { name: /^Probe array/ }).click()
    await expect(page).toHaveURL(/[?&]tag=Probe\+array/)
    await expect(page.getByRole("tab", { name: /Articles/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await expect(articleItems(page)).toHaveCount(2)
    await page.goto("/bib/?b=grassland#plots")
    await expect(page.getByRole("tab", { name: /Plots/ })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByText("P1", { exact: true })).toBeVisible()
    await page.getByRole("searchbox", { name: "Filter plots" }).fill("mown")
    await expect(page.getByText("P2", { exact: true })).toHaveCount(0)
  })

  test("prints the rows as set, titles and key metrics whole, the head's labels", async ({
    page,
  }) => {
    test.skip(isPhone(), "print is checked once")
    await openHub(page, "b=grassland")
    await page.getByRole("radio", { name: "2 lines" }).click()
    await page.emulateMedia({ media: "print" })
    await expect(page.getByRole("searchbox", { name: "Filter the articles" })).toBeHidden()
    const row = articleItems(page).first()
    // A text cell keeps its two lines on paper (no fade); the title prints whole.
    const cell = row.locator("td").nth(2).locator("[data-clamp]")
    expect(await cell.evaluate((el) => getComputedStyle(el).maxHeight)).not.toBe("none")
    expect(await cell.evaluate((el) => getComputedStyle(el).maskImage)).toBe("none")
    expect(
      await row
        .locator("[data-row-title] > div")
        .first()
        .evaluate((el) => getComputedStyle(el).maxHeight)
    ).toBe("none")
    const head = page
      .getByRole("table", { name: /^Articles of/ })
      .locator("th")
      .first()
    expect(await head.evaluate((el) => getComputedStyle(el).position)).toBe("static")
    await expect(head.getByText("Article", { exact: true }).first()).toBeVisible()
  })

  test("says what to do with an empty bibliography, or one the library lacks", async ({ page }) => {
    await openHub(page, "b=materials")
    await expect(page.getByText("No article yet", { exact: true })).toBeVisible()
    await page.goto("/bib/?b=nowhere")
    await expect(page.getByText("No such bibliography")).toBeVisible()
  })
})
