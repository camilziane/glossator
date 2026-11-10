/**
 * The inbox's triage on the synthetic library. Every decision is mocked (tests/e2e/test.ts, or a
 * route of the test's own): no test ever decides on a real inbox. The values come from the fixture
 * itself (tests/fixtures/library.json), read here, so the specs say what the page should do with
 * whatever the fixture holds.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Locator, Page } from "@playwright/test"

import { expect, expectAccessible, sendDecisionsNow, sentDecisions, test } from "./test"

interface Paper {
  id: string
  title: string
  status: string
  found: string
  queries: string[]
  sources: string[]
  prior: { score: number; bib: string } | null
  triage: {
    bib: string | null
    relevance: number | null
    summary: string | null
    why: string | null
    by: string | null
  }
}

const fixture = JSON.parse(readFileSync(join(__dirname, "../fixtures/library.json"), "utf8")) as {
  inbox: { last_run: string; papers: Paper[] }
  bibliographies: { name: string; short: string; articles: { key: string; cite: string }[] }[]
}
const papers = fixture.inbox.papers
const undecided = papers.filter((p) => p.status === "new")
/** Worth a look, in the inbox's order: relevance, then the prior (the fixture's run found nothing new). */
const worth = undecided
  .filter((p) => (p.triage.relevance ?? -1) >= 2)
  .sort(
    (a, b) =>
      (b.triage.relevance ?? -1) - (a.triage.relevance ?? -1) ||
      (b.prior?.score ?? -1) - (a.prior?.score ?? -1)
  )
const accepted = papers.find((p) => p.status === "accepted")!
const gated = papers.find((p) => p.triage.by === "prior")!
const firstWords = (title: string) => title.split(" ").slice(0, 3).join(" ")

const isPhone = () => test.info().project.name === "phone"

/** The current paper: the reading pane beside the list, or the paper on a phone's whole screen. */
const current = (page: Page): Locator => page.locator("#inbox-reading-pane")
const papersFeed = (page: Page) => page.getByRole("feed", { name: "Papers in this view" })
const rows = (page: Page) => papersFeed(page).getByRole("article")
const statusLine = (page: Page) => page.locator("[data-slot=status-line]").first()

async function open(page: Page, query = "") {
  await page.goto(`/inbox/${query}`)
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeAttached()
  await expect(rows(page).first()).toBeVisible()
}

/** Phones: a tap opens the paper on the whole screen. */
async function openPaper(page: Page, index = 0) {
  if (isPhone()) await rows(page).nth(index).tap()
  else await rows(page).nth(index).click()
  await expect(current(page)).toBeVisible()
}

test.describe("the inbox", () => {
  test("opens on Worth a look when nothing is new, grouped by relevance", async ({
    page,
    consoleErrors,
  }) => {
    await open(page)
    if (!isPhone()) {
      const views = page.getByRole("navigation", { name: "Views" })
      await expect(views.getByRole("link", { name: /Worth a look/ })).toHaveAttribute(
        "aria-current",
        "page"
      )
      await expect(views.getByRole("link", { name: /All waiting/ })).toContainText(
        String(undecided.length)
      )
    }
    await expect(rows(page)).toHaveCount(worth.length)
    await expect(rows(page).first()).toContainText(firstWords(worth[0]!.title))
    await expect(
      rows(page)
        .first()
        .getByRole("img", { name: /Relevance 3 of 3/ })
    ).toBeVisible()
    await expect(papersFeed(page)).toContainText("In scope")
    // No stars, meters or icons in the rows.
    await expect(rows(page).first().locator("svg")).toHaveCount(0)
    expect(consoleErrors).toEqual([])
  })

  test("shows the current paper as a glossed page, its details folded", async ({ page }) => {
    await open(page)
    await openPaper(page)
    const here = current(page)
    await expect(here.getByRole("heading", { level: 2 })).toContainText(firstWords(worth[0]!.title))
    await expect(here.getByText(worth[0]!.triage.why!)).toBeVisible()
    await expect(here).not.toContainText("Why:")
    // The margin: no prior naming the triage's own bibliography, no "found by" (in the details).
    const gloss = here.getByRole("complementary", { name: "Why it is here" })
    if (worth[0]!.prior?.bib === worth[0]!.triage.bib)
      await expect(gloss.getByRole("meter")).toHaveCount(0)
    await expect(gloss).not.toContainText("found by")
    await expect(here.getByText(`glossator inbox accept ${worth[0]!.id}`)).toBeHidden()
    await here.getByText("Details", { exact: true }).click()
    await expect(here.getByText(`glossator inbox accept ${worth[0]!.id}`)).toBeVisible()
    await expect(here.getByRole("button", { name: /^Accept/ })).toContainText("→")
  })

  test("says when Haiku never read a paper", async ({ page }) => {
    // A link to the paper (on a phone, opened on the whole screen).
    await page.goto(`/inbox/?view=waiting&p=${gated.id}${isPhone() ? "&read=true" : ""}`)
    await expect(current(page).getByText(/^Never read by Haiku/)).toBeVisible()
  })

  test("keeps its view, filters and order in the URL", async ({ page }) => {
    test.skip(isPhone(), "a phone chooses them in its sheet (next test)")
    await open(page)
    const bib = worth[0]!.triage.bib!
    const name = fixture.bibliographies.find((b) => b.name === bib)!.short
    await page.getByRole("button", { name: /^Bibliography/ }).click()
    await page.getByRole("menuitemcheckbox", { name: new RegExp(name) }).click()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(new RegExp(`[?&]bib=${bib}`))
    await expect(rows(page)).toHaveCount(worth.filter((p) => p.triage.bib === bib).length)
    // The order from the keyboard: s opens its menu, and the focus comes back to the paper, where
    // the inbox's keys act (v the next view).
    await rows(page).first().focus()
    await page.keyboard.press("s")
    await page.getByRole("menuitemradio", { name: "Title" }).click()
    await expect(page).toHaveURL(/sort=title/)
    await expect(papersFeed(page).locator("article:focus")).toHaveCount(1)
    await page.keyboard.press("v")
    await expect(page).toHaveURL(/view=waiting/)

    await page.reload()
    await expect(rows(page)).toHaveCount(undecided.filter((p) => p.triage.bib === bib).length)
    await page.getByRole("button", { name: "Clear filters" }).first().click()
    await expect(rows(page)).toHaveCount(undecided.length)
  })

  test("puts the views and filters of a phone in one sheet", async ({ page }) => {
    test.skip(!isPhone(), "the phone's sheet")
    await open(page)
    await page.getByRole("button", { name: /Views & filters/ }).tap()
    const sheet = page.getByRole("dialog", { name: "Views & filters" })
    await sheet.getByRole("radio", { name: /All waiting/ }).check()
    await sheet.getByRole("button", { name: "Done" }).tap()
    await expect(page).toHaveURL(/view=waiting/)
    await expect(rows(page)).toHaveCount(undecided.length)
  })

  test("filters as you type, and keys are text there", async ({ page, api }) => {
    test.skip(isPhone(), "the filter box is in the phone's sheet")
    await open(page, "?view=waiting")
    await page.keyboard.press("/")
    const box = page.getByRole("searchbox", { name: "Filter the papers" })
    await expect(box).toBeFocused()
    const accented = undecided.find((p) => /[áéíóúñ]/.test(p.title))!
    const word = accented.title.split(" ").find((w) => /[áéíóúñ]/.test(w))!
    await page.keyboard.type(word.normalize("NFD").replace(/\p{M}/gu, ""))
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText(firstWords(accented.title))
    await page.keyboard.type(" ar")
    expect(api.calls.filter((c) => c.path === "/api/inbox/decide")).toEqual([])
  })

  test("triages from the keyboard: move, accept, the status line and the focus follow", async ({
    page,
  }) => {
    test.skip(isPhone(), "keyboard triage is a desktop affair")
    let header: string | undefined
    await page.route("**/api/inbox/decide", async (route) => {
      header = route.request().headers()["x-glossator"]
      const { ids } = route.request().postDataJSON() as { ids: string[] }
      await route.fulfill({ json: { done: ids.map((id) => `${id}: accepted`) } })
    })
    await page.clock.install()
    await open(page)
    // The first paper has the focus on arrival; j moves, the URL follows.
    await expect(rows(page).nth(0)).toBeFocused()
    await page.keyboard.press("j")
    await expect(rows(page).nth(1)).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`p=${worth[1]!.id}`))
    await expect(current(page)).toContainText(firstWords(worth[1]!.title))
    await page.keyboard.press("a")
    // At once: one line with Undo, the paper collapses into "Decided this session"; sent later.
    await expect(statusLine(page)).toContainText(`Accepted ‘${firstWords(worth[1]!.title)}`)
    await expect(statusLine(page).getByRole("button", { name: /Undo/ })).toBeVisible()
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Decided this session/ })).toContainText("1")
    expect(header).toBeUndefined()
    await page.clock.fastForward(7000)
    await expect(statusLine(page).getByRole("button", { name: /Undo/ })).toHaveCount(0)
    expect(header).toBe("1")
    await expect(rows(page)).toHaveCount(worth.length - 1)

    await page.keyboard.press("?")
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible()
    await expect(page.getByRole("dialog")).toContainText("In scope:")
    await page.keyboard.press("Escape")
    await expect(rows(page).nth(1)).toBeFocused()
  })

  test("scrolls the paper with Space", async ({ page }) => {
    test.skip(isPhone(), "a phone's page scrolls itself")
    await open(page)
    const box = current(page).locator("> div").first()
    await box.evaluate((el) => {
      const filler = document.createElement("div")
      filler.style.height = "3000px"
      el.append(filler)
    })
    await page.keyboard.press(" ")
    await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  })

  test("keeps its letters away from other controls", async ({ page, api }) => {
    test.skip(isPhone(), "keyboard triage is a desktop affair")
    await open(page)
    await page.getByRole("button", { name: /^Select/ }).focus()
    await page.keyboard.press("a")
    await page.keyboard.press("r")
    await page.getByRole("button", { name: /theme/i }).first().focus()
    await page.keyboard.press("a")
    await expect(statusLine(page)).toHaveText("")
    await sendDecisionsNow(page)
    expect(api.calls.filter((c) => c.path === "/api/inbox/decide")).toEqual([])
    await expect(rows(page)).toHaveCount(worth.length)
  })

  test("undoes a decision before it is sent", async ({ page, api }) => {
    await open(page)
    await openPaper(page)
    await current(page)
      .getByRole("button", { name: /^Reject/ })
      .click()
    await expect(statusLine(page)).toContainText("Rejected")
    await statusLine(page).getByRole("button", { name: /Undo/ }).click()
    await expect(statusLine(page)).toContainText("is back in the list")
    await sendDecisionsNow(page)
    expect(api.calls.filter((c) => c.path === "/api/inbox/decide")).toEqual([])
  })

  test("sends what waits when the tab is hidden", async ({ page, api }) => {
    // Not a real reload: a request sent while a page unloads escapes the test's routes and would
    // reach the fixture's server. Hiding the tab takes the same path (flushDecisions).
    await open(page)
    await openPaper(page)
    await current(page)
      .getByRole("button", { name: /^Reject/ })
      .click()
    expect(api.calls.filter((c) => c.path === "/api/inbox/decide")).toEqual([])
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(await sentDecisions(api, 1)).toEqual([{ ids: [worth[0]!.id], decision: "reject" }])
  })

  test("rejects with a button: the paper moves to Decided this session", async ({ page, api }) => {
    await open(page)
    await openPaper(page)
    await current(page)
      .getByRole("button", { name: /^Reject/ })
      .click()
    if (!isPhone()) {
      await expect(rows(page)).toHaveCount(worth.length - 1)
      await page.getByRole("button", { name: /Decided this session/ }).click()
      await expect(
        page.getByRole("feed", { name: "Papers decided this session" }).getByRole("article")
      ).toContainText("Rejected")
    } else {
      // On a phone the next paper is on the screen; Back returns to the list.
      await expect(current(page)).toContainText(firstWords(worth[1]!.title))
      await page.goBack()
      await expect(rows(page)).toHaveCount(worth.length - 1)
    }
    await sendDecisionsNow(page)
    expect(await sentDecisions(api, 1)).toEqual([{ ids: [worth[0]!.id], decision: "reject" }])
  })

  test("asks before a decision on a selection", async ({ page, api }) => {
    test.skip(isPhone(), "selection is a desktop affair (x)")
    await open(page)
    await page.keyboard.press("x")
    await page.keyboard.press("j")
    await page.keyboard.press("x")
    const selection = page.getByRole("group", { name: "Selection" })
    await expect(selection).toContainText("2 selected")
    await selection.getByRole("button", { name: /^Accept/ }).click()
    const dialog = page.getByRole("alertdialog", { name: "Accept 2 papers?" })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    expect(api.calls.filter((c) => c.path === "/api/inbox/decide")).toEqual([])

    await selection.getByRole("button", { name: /^Accept/ }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Accept 2 papers" }).click()
    await expect(statusLine(page)).toContainText("Accepted 2 papers")
    await sendDecisionsNow(page)
    expect(await sentDecisions(api, 1)).toEqual([
      { ids: [worth[0]!.id, worth[1]!.id], decision: "accept" },
    ])
  })

  test("rolls a decision back when the server refuses it, and offers a Retry", async ({ page }) => {
    await page.route("**/api/inbox/decide", (route) =>
      route.fulfill({ status: 403, json: { error: "a decision needs the header X-Glossator: 1" } })
    )
    await open(page)
    await openPaper(page)
    await current(page)
      .getByRole("button", { name: /^Reject/ })
      .click()
    await sendDecisionsNow(page)
    await expect(statusLine(page)).toContainText("Not rejected")
    await expect(statusLine(page).getByRole("button", { name: "Retry" })).toBeVisible()
    if (isPhone()) await page.goBack()
    await expect(rows(page)).toHaveCount(worth.length)
  })

  test("adds failures up: the rows say so, one line counts them and retries them all", async ({
    page,
    api,
  }) => {
    test.skip(isPhone(), "keyboard triage is a desktop affair")
    let failing = true
    await page.route("**/api/inbox/decide", (route) => {
      if (failing) return route.abort("connectionreset")
      return route.fallback()
    })
    await open(page)
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("r")
      await sendDecisionsNow(page)
      await expect(rows(page).first()).toContainText("Reject not saved")
    }
    await expect(statusLine(page)).toContainText("2 decisions not saved")
    await expect(rows(page).filter({ hasText: "Reject not saved" })).toHaveCount(2)
    failing = false
    await statusLine(page).getByRole("button", { name: "Retry all" }).click()
    await expect(rows(page).filter({ hasText: "Reject not saved" })).toHaveCount(0)
    await sendDecisionsNow(page)
    expect((await sentDecisions(api, 1))[0]).toMatchObject({ decision: "reject" })
  })

  test("gives the focus to the current paper after a menu and after v", async ({ page }) => {
    test.skip(isPhone(), "keyboard triage is a desktop affair")
    await open(page)
    await page.keyboard.press("j")
    await expect(rows(page).nth(1)).toBeFocused()
    await page.keyboard.press("s")
    await page.getByRole("menuitemradio", { name: "Title" }).click()
    await expect(page.locator("article[aria-current=true]")).toBeFocused()
    await expect(page.locator("article[aria-current=true]")).toContainText(
      firstWords(worth[1]!.title)
    )
    await page.keyboard.press("v")
    await expect(page.locator("article[aria-current=true]")).toBeFocused()
  })

  test("sweeps a group with Shift+X, then decides it after asking", async ({ page, api }) => {
    test.skip(isPhone(), "selection is a desktop affair")
    await open(page, "?view=waiting")
    const related = undecided.filter((p) => p.triage.relevance === 2)
    await rows(page)
      .filter({ hasText: firstWords(related[0]!.title) })
      .click()
    await page.keyboard.press("Shift+X")
    await expect(page.getByRole("group", { name: "Selection" })).toContainText(
      `${related.length} selected`
    )
    await page.keyboard.press("r")
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: `Reject ${related.length} papers` })
      .click()
    await sendDecisionsNow(page)
    expect((await sentDecisions(api, 1))[0]).toMatchObject({ decision: "reject" })
  })

  test("reads the data again when a decision gets no answer", async ({ page }) => {
    await page.route("**/api/inbox/decide", (route) => route.abort("connectionreset"))
    await open(page)
    await openPaper(page)
    await current(page)
      .getByRole("button", { name: /^Reject/ })
      .click()
    await sendDecisionsNow(page)
    // The data (unchanged: the decision never reached the server) says it was not saved.
    await expect(statusLine(page)).toContainText(/Not rejected: .*\(not saved\)/)
    // The API answers its probe: decisions stay possible.
    await expect(page.getByText("Decisions need glossator serve")).toHaveCount(0)
  })

  test("shows the commands to type when the API is not there", async ({ page }) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><p>static</p>" })
    )
    await open(page)
    await expect(page.getByText("Decisions need glossator serve")).toBeVisible()
    await openPaper(page)
    const bar = current(page).getByRole("group", { name: "Decide in a terminal" })
    await expect(bar.getByText(`glossator inbox reject ${worth[0]!.id}`)).toBeVisible()
    await expect(current(page).getByRole("button", { name: /^Accept/ })).toHaveCount(0)
  })

  test("opens on the paper a link names, in its view", async ({ page }) => {
    await page.goto(`/inbox/?p=${accepted.id}`)
    if (!isPhone()) {
      await expect(
        page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: /^Accepted/ })
      ).toHaveAttribute("aria-current", "page")
      await expect(rows(page).first()).toBeFocused()
      await expect(current(page)).toContainText("Accepted, waiting for")
    } else {
      await expect(page.getByText(/^Accepted\s*\d/)).toBeVisible()
    }
  })

  test("draws a long inbox as a window of papers", async ({ page }) => {
    // A synthetic inbox of 300 papers (the fixture's, cloned under invented ids).
    const data = JSON.parse(
      readFileSync(join(test.info().project.testDir, "../fixtures/library.json"), "utf8")
    ) as { inbox: { papers: Record<string, unknown>[] } }
    const model = data.inbox.papers.find((p) => p["id"] === worth.at(-1)!.id)!
    data.inbox.papers = Array.from({ length: 300 }, (_, i) => ({
      ...model,
      id: `synthetic${String(i).padStart(3, "0")}`,
      title: `Invented paper number ${i + 1}`,
    }))
    await page.route("**/data/library.json", (route) => route.fulfill({ json: data }))
    await page.goto("/inbox/")
    await expect(rows(page).first()).toBeVisible()
    // A window of the 300: what the screen shows (rows of about 64 px, compact on phones too) and
    // the virtualizer's overscan of 8.
    const drawn = await rows(page).count()
    expect(drawn).toBeLessThan(isPhone() ? 30 : 40)
    await expect(rows(page).first()).toHaveAttribute("aria-setsize", "300")
    if (!isPhone()) {
      await expect(rows(page).first()).toBeFocused()
      await page.keyboard.press("End")
      const last = page.locator("article[aria-posinset='300']")
      await expect(last).toBeFocused()
      await expect(current(page)).toContainText("Invented paper number 300")
      await page.keyboard.press("k")
      await expect(page.locator("article[aria-posinset='299']")).toBeFocused()
      await page.keyboard.press("Home")
      await expect(page.locator("article[aria-posinset='1']")).toBeFocused()
      // Scrolled away with the wheel, the current paper stays drawn: it holds the tab stop.
      await page.locator("#inbox-results").hover()
      await page.mouse.wheel(0, 20000)
      await expect(page.locator("article[aria-posinset='1']")).toHaveAttribute("tabindex", "0")
    } else {
      // To the end of the page (its height grows as rows are measured): the last row is drawn.
      await expect
        .poll(
          async () => {
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
            return page.locator("article[aria-posinset='300']").count()
          },
          { timeout: 10000 }
        )
        .toBe(1)
      expect(await rows(page).count()).toBeLessThan(30)
    }
    await expectAccessible(page)
  })

  test("prints a plain list of the view", async ({ page }) => {
    await open(page)
    await page.emulateMedia({ media: "print" })
    const printed = page.locator("section.print\\:block")
    await expect(printed).toBeVisible()
    for (const p of worth) await expect(printed).toContainText(firstWords(p.title))
    await expect(papersFeed(page)).toBeHidden()
  })

  test("is accessible, in light and dark", async ({ page }) => {
    await open(page)
    await expectAccessible(page)
    await openPaper(page)
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
  })
})
