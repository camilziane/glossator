import { expect, expectAccessible, test } from "./test"

const ARTICLE = "/article/?b=grassland&k=lindqvist2026"

const isPhone = () => test.info().project.name === "phone"

test.describe("the article", () => {
  test("shows the header, the facts, the key metrics first and every section", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto(ARTICLE)
    const title = page.getByRole("heading", { level: 1 })
    await expect(title).toHaveText("Mapping soil moisture from two invented probe grids")
    // the entry focus is on the title: the page's keys work at once
    await expect(title).toBeFocused()
    await expect(page).toHaveTitle(/Lindqvist et al\. 2026/)
    if (!isPhone()) {
      const pdf = page.locator("header").getByRole("link", { name: /^PDF · published version/ })
      await expect(pdf).toHaveAttribute(
        "href",
        "/library/grassland/articles/lindqvist2026/paper.pdf"
      )
    }
    await expect(page.getByRole("region", { name: "Facts" })).toBeVisible()
    const ids = await page
      .locator("section[data-section]")
      .evaluateAll((sections) => sections.map((s) => s.id))
    expect(ids.slice(0, 3)).toEqual(["metrics", "figures", "overview"])
    // the page's own bands have no number; the record's sections start at 1
    await expect(page.locator("#metrics--title")).toHaveText("Key metrics")
    await expect(page.locator("#overview--title")).toHaveText(/^1\s+Overview$/)
    // the headline metrics as sentences, the whole table folded
    await expect(page.locator("#metrics details")).not.toHaveAttribute("open")
    for (const id of ["task", "siting", "provenance"]) expect(ids).toContain(id)
    // a cited page opens the PDF there
    await expect(
      page
        .locator("#metrics")
        .getByRole("link", { name: /p\.\s6/ })
        .first()
    ).toHaveAttribute("href", /paper\.pdf#page=6$/)
    // no contents column, no pager cards
    await expect(page.getByRole("navigation", { name: "On this page" })).toHaveCount(0)
    expect(consoleErrors).toEqual([])
  })

  test("puts a retraction in danger words and a correction in a note", async ({ page }) => {
    await page.goto(ARTICLE)
    await expect(page.getByRole("region", { name: "Notice: Retracted" })).toContainText(
      "This article was retracted"
    )
    await page.goto("/article/?b=grassland&k=okafor2025")
    await expect(page.getByText(/A correction to this article was published/)).toBeVisible()
    await expect(page.getByRole("region", { name: /^Notice/ })).toHaveCount(0)
  })

  test("lands on the section a deep link names, on load and on reload", async ({ page }) => {
    await page.goto(`${ARTICLE}#model`)
    const heading = page.getByRole("heading", { level: 2, name: /Model/ })
    await expect(heading).toBeInViewport()
    await expect(heading).toBeFocused()
    await page.reload()
    await expect(heading).toBeInViewport()
  })

  test("shows the slim bar once the title scrolls away, and jumps from its Sections menu", async ({
    page,
  }) => {
    await page.goto(ARTICLE)
    const bar = page.locator("#article-toc-bar")
    await expect(bar).not.toHaveAttribute("data-shown")
    await page.locator("#siting").scrollIntoViewIfNeeded()
    await expect(bar).toHaveAttribute("data-shown", "")
    await bar.getByRole("button", { name: /Sections/ }).click()
    await page.getByRole("menuitem", { name: /Model/ }).click()
    await expect(page).toHaveURL(/#model$/)
    const heading = page.getByRole("heading", { level: 2, name: /Model/ })
    await expect(heading).toBeInViewport()
    await expect(heading).toBeFocused()
    await expect(bar).toContainText("Model")
  })

  test("lands on the section with less motion, and when the hash changes in the page", async ({
    page,
  }) => {
    // Sections off screen are drawn only near the viewport: an instant jump (less motion), or the
    // browser's own jump to a new hash, passes sections whose size changes once drawn.
    await page.emulateMedia({ reducedMotion: "reduce" })
    const heading = page.getByRole("heading", { level: 2, name: /Related articles/ })
    /** The heading sits right below what covers the page's top (the top bar, the slim bar). */
    const landed = async () => {
      const box = await heading.boundingBox()
      const covered = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
      )
      return box !== null && box.y >= covered - 2 && box.y <= covered + 40
    }

    await page.goto(ARTICLE)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.locator("#overview").scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => window.scrollY)
    const bar = page.locator("#article-toc-bar")
    await expect(bar).toHaveAttribute("data-shown", "")
    await bar.getByRole("button", { name: /Sections/ }).click()
    await page.getByRole("menuitem", { name: /Related articles/ }).click()
    await expect(page).toHaveURL(/#related$/)
    await expect.poll(landed).toBe(true)
    // Back returns where the reader was when they picked the section.
    await page.goBack()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before)

    await page.evaluate(() => {
      window.location.hash = "#related"
    })
    await expect.poll(landed).toBe(true)
  })

  test("opens a figure from the strip in a lightbox at its own size, and gives the focus back", async ({
    page,
  }) => {
    await page.goto(ARTICLE)
    const thumb = page.locator("#figures").getByRole("button").first()
    await thumb.scrollIntoViewIfNeeded()
    await thumb.click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // The stand-in figures are 480 px wide: shown at that size, never enlarged, so no zoom.
    const img = dialog.getByRole("img")
    await expect.poll(async () => (await img.boundingBox())?.width).toBeLessThanOrEqual(480)
    await expect(dialog.getByRole("button", { name: "Zoom" })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(thumb).toBeFocused()
  })

  test("pages within the list it came from with ], and returns to it with Esc", async ({
    page,
  }) => {
    test.skip(isPhone(), "keys are a keyboard's")
    const from = "/bib/?b=grassland"
    await page.goto(`${ARTICLE}&from=${encodeURIComponent(from)}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await page.keyboard.press("]")
    await expect(page).toHaveURL(/\/article\/\?b=grassland&k=okafor2025&from=/)
    const title = page.getByRole("heading", { level: 1 })
    await expect(title).toHaveText(/Night drainage/)
    await expect(title).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/\/bib\/\?b=grassland$/)
  })

  test("stays with Esc when it was not opened from a list", async ({ page }) => {
    test.skip(isPhone(), "keys are a keyboard's")
    await page.goto(ARTICLE)
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/\/article\/\?b=grassland&k=lindqvist2026$/)
  })

  test("opens the whole key metrics table with m", async ({ page }) => {
    test.skip(isPhone(), "keys are a keyboard's")
    await page.goto(ARTICLE)
    const all = page.locator("#metrics details")
    await expect(all).not.toHaveAttribute("open")
    await page.keyboard.press("m")
    await expect(page).toHaveURL(/#metrics$/)
    await expect(all).toHaveAttribute("open")
    await expect(all.getByRole("table")).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Key metrics" })).toBeFocused()
  })

  test("copies a quote with its citation, and the LaTeX citation with Shift", async ({
    page,
    context,
  }) => {
    test.skip(isPhone(), "clipboard permissions are a desktop Chromium feature here")
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto(ARTICLE)
    const copy = page.getByRole("button", { name: "Copy the quote with its citation" }).first()
    await copy.scrollIntoViewIfNeeded()
    await copy.focus()
    await page.keyboard.press("y")
    // the record gives the journal's page numbering (journal_offset): the journal's page is cited
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(/^“.+” \(Lindqvist et al\. 2026, p\. 2\d\d\)$/)
    await page.keyboard.press("Shift+Y")
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(/^\\cite\[p\.~2\d\d\]\{lindqvist2026\}$/)
  })

  test("cites the article from the Cite menu (c)", async ({ page, context }) => {
    test.skip(isPhone(), "clipboard permissions are a desktop Chromium feature here")
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto(ARTICLE)
    // The article's keys act once it is drawn (its title takes the focus).
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await page.keyboard.press("c")
    await page.getByRole("menuitem", { name: "Copy the citation key" }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("lindqvist2026")
  })

  test("explains a draft, an unreadable record and an unknown key", async ({ page }) => {
    await page.goto("/article/?b=grassland&k=brandt2024grid")
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible()
    // In the files line, or on a phone in place of its PDF button.
    await expect(page.getByText("PDF · to fetch").filter({ visible: true })).toBeVisible()

    await page.goto("/article/?b=grassland&k=mendes2023")
    await expect(page.getByRole("heading", { name: /record could not be read/ })).toBeVisible()
    await expect(page.getByText("glossator check mendes2023 --bib grassland")).toBeVisible()

    await page.goto("/article/?b=ml&k=novak2042")
    await expect(page.getByRole("heading", { level: 1, name: "No such article" })).toBeVisible()
    await page.getByRole("link", { name: /Novak & Ito 2024/ }).click()
    await expect(page).toHaveURL(/k=novak2024$/)
  })

  test("never scrolls the page sideways, even with wide tables", async ({ page }) => {
    await page.goto(`${ARTICLE}#siting`)
    await expect(page.getByRole("heading", { level: 2, name: /Sensor siting/ })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("prints as text and an outer gloss, the cite as its running head", async ({ page }) => {
    await page.goto(ARTICLE)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--print-head")
      )
    ).toContain("Lindqvist et al. 2026")
    await page.emulateMedia({ media: "print" })
    await expect(page.locator("#article-toc-bar")).toBeHidden()
    await expect(page.locator("#figures")).toBeHidden()
  })

  test("is accessible, in light and dark", async ({ page }) => {
    await page.goto(ARTICLE)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expectAccessible(page)
    await page.locator("#siting").scrollIntoViewIfNeeded()
    await expectAccessible(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
    await page.goto("/article/?b=grassland&k=mendes2023")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expectAccessible(page)
  })
})
