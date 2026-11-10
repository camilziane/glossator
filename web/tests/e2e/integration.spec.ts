/**
 * The pages together: links between them, the session's decisions seen everywhere, the one shortcuts
 * dialog. Decisions are mocked (tests/e2e/test.ts): no test ever decides on a real inbox.
 */
import type { Page } from "@playwright/test"

import { expect, expectAccessible, sendDecisionsNow, sentDecisions, test } from "./test"

const isPhone = () => test.info().project.name === "phone"

/** The top bar's navigation (desktop) or the phone's tab bar. */
function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Main" })
}

test.describe("the pages together", () => {
  test("a decision updates the top bar's count and the overview", async ({ page, api }) => {
    test.skip(isPhone(), "the tab bar shows only the new papers: covered on desktop")
    await page.goto("/inbox/?p=ghosh2026graph")
    const nav = mainNav(page)
    await expect(nav.getByRole("link", { name: "Inbox 6 waiting" })).toBeVisible()
    await page
      .locator("#inbox-reading-pane")
      .getByRole("button", { name: /^Reject/ })
      .click()
    await expect(nav.getByRole("link", { name: "Inbox 5 waiting" })).toBeVisible()

    // Client-side navigation keeps the session's decisions, the one waiting for its Undo too.
    await nav.getByRole("link", { name: "Today" }).click()
    await expect(
      page.getByRole("heading", { level: 1 }).getByRole("link", { name: "5 papers wait" })
    ).toBeVisible()
    const inbox = page.getByRole("region", { name: /^Worth a look/ })
    await expect(inbox.getByRole("listitem")).toHaveCount(2)
    await expect(inbox).not.toContainText("Graph transformers")
    // The decision speaks in the status line, which outlives the inbox: on Today, the shell's corner.
    const status = page.locator("[data-slot=status-line]").first()
    await expect(status).toContainText("Rejected ‘Graph transformers")
    await expect(status.getByRole("button", { name: /Undo/ })).toBeVisible()
    expect(api.calls.filter((c) => c.path === "/api/inbox/decide")).toEqual([])
    await sendDecisionsNow(page)
    expect(await sentDecisions(api, 1)).toEqual([{ ids: ["ghosh2026graph"], decision: "reject" }])
    // Sent: the line keeps its words, without the Undo.
    await expect(status).toContainText("Rejected ‘Graph transformers")
    await expect(status.getByRole("button", { name: /Undo/ })).toHaveCount(0)
  })

  test("opens an inbox paper from the overview and from the palette", async ({ page }) => {
    await page.goto("/")
    const inbox = page.getByRole("region", { name: /^Worth a look/ })
    const first = inbox.getByRole("listitem").filter({ hasText: "Long-term drift" })
    await first.getByRole("link").click()
    await expect(page).toHaveURL(/\/inbox\/\?view=worth&p=sato2026arrays$/)
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible()

    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+k")
    const palette = page.getByRole("dialog")
    await palette.getByRole("combobox").fill("rejected invented")
    await palette.getByRole("option", { name: /A rejected invented paper/ }).click()
    await expect(page).toHaveURL(/\/inbox\/\?p=ortiz2026rejected&status=rejected$/)
    await expect(page.getByText("A rejected invented paper").first()).toBeVisible()
  })

  test("links articles, hubs and the search both ways", async ({ page }) => {
    await page.goto("/bib/?b=ml")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page
      .getByRole("link", { name: /Novak & Ito 2024/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=novak2024/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    if (isPhone()) {
      await mainNav(page).getByRole("button", { name: "Library", exact: true }).click()
      await page
        .getByRole("dialog", { name: "Library" })
        .getByRole("link", { name: /^ML methods/ })
        .click()
    } else {
      // The article's bibliography is marked in the top bar, and leads back to it.
      const bib = mainNav(page).getByRole("link", { name: /^ML methods/ })
      await expect(bib).toHaveAttribute("aria-current", "true")
      await bib.click()
    }
    await expect(page).toHaveURL(/\/bib\/\?b=ml$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    if (isPhone()) await mainNav(page).getByRole("link", { name: "Search", exact: true }).click()
    else {
      await page.getByRole("heading", { level: 1 }).click()
      await page.keyboard.press("g")
      await page.keyboard.press("s")
    }
    await expect(page).toHaveURL(/\/search\/$/)
    await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible()
  })

  test("an article opened from a hub pages in the hub's order and Esc returns to its row", async ({
    page,
  }) => {
    test.skip(isPhone(), "keys are a keyboard's")
    // Oldest first: the bibliography's own order (newest first) would page elsewhere.
    await page.goto("/bib/?b=grassland&sort=year.asc")
    const rows = page.getByRole("table", { name: /^Articles of/ }).locator("tbody tr")
    await expect(rows.first()).toBeFocused()
    await rows
      .filter({ hasText: "surface mat" })
      .getByRole("link", { name: /surface mat/ })
      .click()
    await expect(page).toHaveURL(/k=brandt2024grid&from=/)
    const title = page.getByRole("heading", { level: 1 })
    await expect(title).toBeFocused()
    await page.keyboard.press("]")
    await expect(page).toHaveURL(/k=okafor2025&from=/)
    await expect(title).toHaveText(/Night drainage/)
    await expect(title).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/\/bib\/\?b=grassland&sort=year\.asc$/)
    await expect(rows.filter({ hasText: "Night drainage" })).toBeFocused()
  })

  test("one shortcuts dialog, with the page's keys first", async ({ page }) => {
    test.skip(isPhone(), "keyboard shortcuts are for desktops")
    await page.goto("/inbox/")
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible()
    await page.keyboard.press("?")
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(1)
    await expect(dialog.getByRole("region", { name: "Inbox" })).toContainText("Next paper")
    await expect(dialog.getByRole("region", { name: "Everywhere" })).toContainText(
      "Search the library"
    )
    await expectAccessible(page)
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()

    // Another page lists its own keys, and the inbox's are gone.
    await page.goto("/bib/?b=ml")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.keyboard.press("?")
    await expect(dialog.getByRole("region", { name: "Bibliography" })).toContainText(
      "Filter the table"
    )
    await expect(dialog.getByRole("region", { name: "Inbox" })).toHaveCount(0)
  })

  test("every route answers, with no console error", async ({ page, consoleErrors }) => {
    for (const path of [
      "/",
      "/bib/?b=grassland",
      "/bib/?b=materials",
      "/article/?b=grassland&k=lindqvist2026",
      "/article/?b=ml&k=novak2024",
      "/search/?q=array",
      "/inbox/",
    ]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    }
    expect(consoleErrors).toEqual([])
  })
})
