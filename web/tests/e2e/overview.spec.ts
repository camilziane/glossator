import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, expectAccessible, test } from "./test"

type Json = Record<string, unknown> & {
  bibliographies: unknown[]
  inbox: { last_run: string; papers: { status: string; found: string }[] } | null
}

/** The synthetic library, to serve a variant of it (no bibliography, no inbox…). */
function fixture(): Json {
  return JSON.parse(
    readFileSync(join(test.info().project.testDir, "../fixtures/library.json"), "utf8")
  ) as Json
}

/** Today's date as the browser writes a day (YYYY-MM-DD, local time). */
function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

test.describe("Today", () => {
  test("says what changed, then the inbox's best papers, the contents and the recent articles", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/^Today — /)
    const h1 = page.getByRole("heading", { level: 1 })
    await expect(h1).toContainText("Three bibliographies, 7 articles.")
    // The fixture's latest run found nothing new: what waits, and the papers worth a look.
    await expect(h1.getByRole("link", { name: "6 papers wait" })).toHaveAttribute(
      "href",
      "/inbox/?view=waiting"
    )
    await expect(h1.getByRole("link", { name: "1 of them in scope" })).toHaveAttribute(
      "href",
      "/inbox/?view=worth"
    )
    await expect(h1.getByRole("link", { name: "One accepted paper waits" })).toHaveAttribute(
      "href",
      "/inbox/?view=accepted"
    )

    const main = page.getByRole("main")
    const inbox = main.getByRole("region", { name: "Worth a look" })
    const rows = inbox.getByRole("listitem")
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toContainText("Long-term drift")
    await expect(rows.first().getByRole("img", { name: /Relevance 3 of 3/ })).toBeVisible()
    await expect(inbox.getByRole("link", { name: "Start triage" })).toHaveAttribute(
      "href",
      "/inbox/?view=worth"
    )

    const bibs = main.getByRole("region", { name: "Bibliographies" })
    await expect(bibs.getByRole("heading", { level: 3 })).toHaveText([
      "Grassland soil and canopy sensors, invented",
      "Learning methods for invented signals",
      "Materials background",
    ])
    const grass = bibs.getByRole("listitem").filter({ hasText: "soil and canopy sensors" })
    await expect(grass).toContainText("4 articles")
    await expect(grass).toContainText(
      "2023–2026 · 1 draft · 1 retracted · 1 corrected · 1 unreadable record"
    )
    await expect(
      bibs.getByRole("listitem").filter({ hasText: "Materials background" })
    ).toContainText("glossator curate <DOI> --bib materials")

    const recent = main.getByRole("region", { name: "Recently published" })
    await expect(recent.getByRole("heading", { level: 3 })).toHaveText([
      "2026",
      "2025",
      "2024",
      "2023",
    ])
    await expect(main.locator("footer time").first()).toHaveAttribute(
      "datetime",
      "2026-11-09T08:00:00+00:00"
    )
    expect(consoleErrors).toEqual([])
  })

  test("names the papers of a run this morning, and leads to them", async ({ page }) => {
    const data = fixture()
    const day = today()
    const inbox = data.inbox!
    inbox.last_run = `${day}T07:30:00`
    for (const p of inbox.papers) p.found = day
    await page.route("**/data/library.json", (route) => route.fulfill({ json: data }))
    await page.goto("/")
    const h1 = page.getByRole("heading", { level: 1 })
    await expect(h1).toContainText("This morning the inbox found 6 new papers, 1 of them in scope.")
    await expect(h1.getByRole("link", { name: "6 new papers" })).toHaveAttribute(
      "href",
      "/inbox/?view=new"
    )
    const section = page.getByRole("region", { name: "New in the inbox" })
    await expect(section.getByRole("listitem")).toHaveCount(5)
    await section.getByRole("link", { name: /Long-term drift/ }).click()
    await expect(page).toHaveURL(/\/inbox\/\?view=new&p=sato2026arrays$/)
  })

  test("leads to a bibliography, a retracted article and back", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Learning methods for invented signals" }).click()
    await expect(page).toHaveURL(/\/bib\/\?b=ml$/)

    await page.goto("/")
    await page.getByRole("link", { name: /^1 retracted: Lindqvist et al\. 2026/ }).click()
    await expect(page).toHaveURL(/\/article\/\?b=grassland&k=lindqvist2026$/)

    // From Recently published, the article knows its list (its pager, Esc). The whole entry is the
    // link: a click on its one-liner opens it.
    await page.goto("/")
    const entry = page
      .getByRole("region", { name: "Recently published" })
      .getByRole("listitem")
      .filter({ hasText: "Sparse attention over invented sensor graphs" })
      .last()
    const oneLiner = entry.getByText(/Graph-sparse attention matches dense attention/)
    await oneLiner.scrollIntoViewIfNeeded()
    const box = (await oneLiner.boundingBox())!
    await page.mouse.click(box.x + 20, box.y + box.height / 2)
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=ashworth2026&from=%2F$/)
  })

  test("is accessible in light and dark", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "Bibliographies" })).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
  })

  test("works from the keyboard: Start triage, g i, g t, ? and the way back", async ({ page }) => {
    test.skip(test.info().project.name === "phone", "keyboard shortcuts need a keyboard")
    await page.goto("/")
    const triage = page.getByRole("link", { name: "Start triage" })
    await expect(triage).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/inbox\/\?view=worth$/)

    await page.goto("/")
    await expect(triage).toBeFocused()
    await page.keyboard.press("Shift+?")
    const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts" })
    await expect(shortcuts).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(shortcuts).toBeHidden()
    await page.keyboard.press("g")
    await page.keyboard.press("i")
    await expect(page).toHaveURL(/\/inbox\/$/)

    // g t on Today itself: back to the top, the focus on Start triage.
    await page.goto("/")
    await expect(triage).toBeFocused()
    await page.getByRole("link", { name: "Learning methods for invented signals" }).focus()
    await page.keyboard.press("g")
    await page.keyboard.press("t")
    await expect(triage).toBeFocused()

    // Esc from an article opened from Recently published lands on its entry.
    const recent = page
      .getByRole("region", { name: "Recently published" })
      .getByRole("link", { name: "Sparse attention over invented sensor graphs" })
    await recent.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=ashworth2026&from=%2F$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/\/$/)
    await expect(recent).toBeFocused()

    // Back from a bibliography lands on the entry the reader left by.
    await page.goto("/")
    const ml = page.getByRole("link", { name: "Learning methods for invented signals" })
    await ml.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/bib\/\?b=ml$/)
    await page.goBack()
    await expect(ml).toBeFocused()
  })

  test("does not move when the data arrives", async ({ page }) => {
    await page.route("**/data/library.json", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600))
      await route.continue()
    })
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number
          hadRecentInput: boolean
        })[]) {
          if (!entry.hadRecentInput) w.__cls += entry.value
        }
      }).observe({ type: "layout-shift", buffered: true })
    })
    await page.goto("/")
    await expect(
      page.getByRole("region", { name: "Bibliographies" }).getByRole("heading", { level: 3 })
    ).toHaveCount(3)
    // Two frames painted after the content, then a task: the shifts of that paint are reported.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))
        )
    )
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    expect(cls).toBeLessThan(0.1)
  })

  test("says what to do with no bibliography and no inbox", async ({ page }) => {
    const data = fixture()
    data.bibliographies = []
    data.inbox = null
    await page.route("**/data/library.json", (route) => route.fulfill({ json: data }))
    await page.goto("/")
    const main = page.getByRole("main")
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("No bibliography yet.")
    await expect(main.getByText("No bibliography yet", { exact: true })).toBeVisible()
    await expect(main.getByText("glossator build", { exact: true })).toBeVisible()
    await expect(main.getByText("No inbox on this computer.")).toBeVisible()
    await expect(main.getByText("glossator inbox init", { exact: true })).toBeVisible()
    await expectAccessible(page)
  })

  test("says when nothing waits in the inbox", async ({ page }) => {
    const data = fixture()
    data.inbox!.papers = data.inbox!.papers.filter((p) => p.status !== "new")
    await page.route("**/data/library.json", (route) => route.fulfill({ json: data }))
    await page.goto("/")
    const inbox = page.getByRole("region", { name: "Inbox" })
    await expect(inbox).toContainText("Nothing waits for a decision")
    await expect(inbox.getByText("glossator inbox run", { exact: true })).toBeVisible()
  })
})

test.describe("the 404 page", () => {
  test("names the address and suggests what it may have meant", async ({ page }) => {
    await page.goto("/ml/novak2024/")
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible()
    await expect(page.getByRole("main")).toContainText("/ml/novak2024/")
    await expect(page.getByRole("link", { name: /Search for “novak2024”/ })).toHaveAttribute(
      "href",
      "/search/?q=novak2024"
    )
    await page.getByRole("link", { name: /Novak & Ito 2024/ }).click()
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=novak2024$/)
  })

  test("is accessible in light and dark", async ({ page }) => {
    await page.goto("/no/such/page/")
    await expect(page.getByRole("navigation", { name: "Bibliographies" })).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
  })
})
