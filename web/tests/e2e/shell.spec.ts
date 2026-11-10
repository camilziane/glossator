import type { Page } from "@playwright/test"

import { CLI_NAME } from "../../src/lib/site"

import { expect, expectAccessible, test } from "./test"

const isPhone = () => test.info().project.name === "phone"

/** The top bar's navigation (desktop) or the phone's tab bar. */
function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Main" })
}

/** The bibliographies' links: in the top bar, or in the phone's Library sheet. */
async function bibliographies(page: Page) {
  if (!isPhone()) return mainNav(page)
  await mainNav(page).getByRole("button", { name: "Library", exact: true }).click()
  return page.getByRole("dialog", { name: "Library" })
}

test.describe("the shell", () => {
  test("shows the library with its bibliographies and counts", async ({ page, consoleErrors }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const nav = await bibliographies(page)
    await expect(nav.getByRole("link", { name: "Grassland 4 articles" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "ML methods 3 articles" })).toBeVisible()
    if (!isPhone()) {
      // The fixture's last run found nothing new: the waiting papers, muted.
      await expect(mainNav(page).getByRole("link", { name: "Inbox 6 waiting" })).toBeVisible()
    }
    expect(consoleErrors).toEqual([])
  })

  test("counts the papers of the latest run in rubric", async ({ page }) => {
    test.skip(isPhone(), "the phone's tab bar shows the same count: covered on desktop")
    await page.route("**/data/library.json", async (route) => {
      const response = await route.fetch()
      const data = (await response.json()) as { inbox: { last_run: string } }
      data.inbox.last_run = "2026-11-08T07:00:00"
      await route.fulfill({ response, json: data })
    })
    await page.goto("/")
    const inbox = mainNav(page).getByRole("link", { name: "Inbox 6 new, 6 waiting" })
    await expect(inbox).toBeVisible()
    await expect(inbox).toHaveAttribute("title", /6 new papers · 6 waiting/)
  })

  test("is accessible, in light and dark", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
  })

  test("navigates from the top bar, marks the place and focuses the page", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const nav = await bibliographies(page)
    await nav.getByRole("link", { name: /^ML methods/ }).click()
    await expect(page).toHaveURL(/\/bib\/\?b=ml$/)
    const h1 = page.getByRole("heading", { level: 1 })
    await expect(h1).toHaveText("Learning methods for invented signals")
    // Focus on page entry, without scrolling: the hub's current row (its first on arrival), or its
    // h1 on a phone (no keys there), reached from the tab bar's Library sheet.
    if (isPhone()) await expect(h1).toBeFocused()
    else
      await expect(
        page
          .getByRole("table", { name: /^Articles of/ })
          .locator("tbody tr")
          .first()
      ).toBeFocused()
    if (isPhone()) {
      await expect(
        mainNav(page).getByRole("button", { name: "Library", exact: true })
      ).toBeVisible()
    } else {
      await expect(mainNav(page).getByRole("link", { name: /^ML methods/ })).toHaveAttribute(
        "aria-current",
        "page"
      )
      await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveCount(0)
    }
  })

  test("folds the bibliographies into a Library menu on narrower screens", async ({ page }) => {
    test.skip(isPhone(), "the phone has its tab bar")
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto("/bib/?b=ml")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const menu = mainNav(page).getByRole("button", { name: /Library.*ML methods/ })
    await menu.click()
    await page.getByRole("menuitem", { name: /Grassland/ }).click()
    await expect(page).toHaveURL(/\/bib\/\?b=grassland$/)
  })

  test("goes everywhere with g chords, / and ?", async ({ page }) => {
    test.skip(isPhone(), "keyboard shortcuts are for desktops")
    await page.goto("/")
    // Today gives the focus to the way into triage (Enter starts it); the chords work from there.
    await expect(page.getByRole("link", { name: "Start triage" })).toBeFocused()
    await page.keyboard.press("g")
    await page.keyboard.press("i")
    await expect(page).toHaveURL(/\/inbox\/$/)
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible()
    await page.keyboard.press("g")
    await page.keyboard.press("2")
    await expect(page).toHaveURL(/\/bib\/\?b=ml$/)
    // The hub focuses its current row.
    await expect(
      page
        .getByRole("table", { name: /^Articles of/ })
        .locator("tbody tr")
        .first()
    ).toBeFocused()
    // "/" focuses the page's filter…
    await page.keyboard.press("/")
    await expect(page.locator("[data-page-filter]")).toBeFocused()
    // …and a chord never fires while typing.
    await page.keyboard.type("gt")
    await expect(page).toHaveURL(/\/bib\/\?b=ml/)
    await page.keyboard.press("Escape")
    await page.getByRole("heading", { level: 1 }).click()
    await page.keyboard.press("g")
    await page.keyboard.press("t")
    await expect(page).toHaveURL(/\/$/)
    // On a page without a filter, "/" opens the search palette.
    await expect(page.getByRole("link", { name: "Start triage" })).toBeFocused()
    await page.keyboard.press("/")
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    await page.keyboard.press("?")
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" })
    await expect(dialog.getByRole("region", { name: "Everywhere" })).toContainText(
      "Go to the inbox"
    )
    await page.keyboard.press("Escape")
    await page.keyboard.press("g")
    await page.keyboard.press("s")
    await expect(page).toHaveURL(/\/search\/$/)
  })

  test("follows the chosen theme in the browser's colour", async ({ page }) => {
    test.skip(isPhone(), "the theme menu is the top bar's: the phone's sheet sets the same")
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const colours = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
          (m) => m.content
        )
      )
    const before = await colours()
    await page.getByRole("button", { name: "Theme" }).click()
    await page.getByRole("menuitemradio", { name: "Dark" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect.poll(colours).not.toEqual(before)
    const after = await colours()
    expect(new Set(after).size).toBe(1)
  })

  test("has a tab bar on phones", async ({ page }) => {
    test.skip(!isPhone(), "the tab bar is the phone's")
    await page.goto("/inbox/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const tabs = mainNav(page)
    await expect(tabs.getByRole("link", { name: /^Inbox/ })).toHaveAttribute("aria-current", "page")
    for (const name of ["Today", "Search"]) {
      const box = await tabs.getByRole("link", { name, exact: true }).boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(48)
    }
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/
    )
    await tabs.getByRole("link", { name: "Search", exact: true }).click()
    await expect(page).toHaveURL(/\/search\/$/)
  })

  test("redirects the former page's links", async ({ page }) => {
    await page.goto("/#ml/novak2024/results")
    await expect(page).toHaveURL(/\/article\/\?b=ml&k=novak2024#results$/)
    await page.goto("/#grassland")
    await expect(page).toHaveURL(/\/bib\/\?b=grassland$/)
    await page.goto("/#inbox")
    await expect(page).toHaveURL(/\/inbox\/$/)
  })

  test("opens the command palette with ⌘K / Ctrl+K", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+k")
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("combobox").fill("moisture")
    await expect(dialog.getByRole("option", { name: /Lindqvist et al\. 2026/ })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })

  test("shows the page's own skeleton while the library loads", async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route("**/data/library.json", async (route) => {
      await held
      await route.continue()
    })
    await page.goto("/inbox/")
    const status = page.getByRole("status").filter({ hasText: "Loading the library" })
    await expect(status).toHaveAttribute("aria-busy", "true")
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0)
    release()
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible()
  })

  test("says when the data is missing", async ({ page }) => {
    await page.route("**/data/library.json", (route) =>
      route.fulfill({ status: 404, json: { error: "no data yet: run glossator build" } })
    )
    await page.goto("/")
    await expect(page.getByRole("main").getByRole("alert")).toContainText("No library data yet")
  })

  test("tells no answer from an error the server answered", async ({ page }) => {
    let mode: "refused" | "error" = "refused"
    await page.route("**/data/library.json", (route) =>
      mode === "refused"
        ? route.abort("connectionrefused")
        : route.fulfill({ status: 500, json: { error: "OSError: an invented failure" } })
    )
    await page.goto("/bib/?b=ml")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `No answer from ${CLI_NAME} serve`
    )
    await expect(page.getByRole("main").locator("code")).toContainText(`${CLI_NAME} serve`)

    mode = "error"
    await page.getByRole("button", { name: "Try again" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `${CLI_NAME} serve answered 500 — see its terminal`
    )
  })

  test("answers an unknown path with the 404 page", async ({ page }) => {
    await page.goto("/no/such/page/")
    await expect(page.getByText("Page not found")).toBeVisible()
  })
})
