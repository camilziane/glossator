/**
 * The e2e `test`: every page starts with the API mocked (search, read, status, decide; an automatic
 * fixture), so tests never touch a real index or inbox. Override a route in a test with `page.route` (the last one
 * registered wins), or read what the app sent through `api.calls`.
 */
import AxeBuilder from "@axe-core/playwright"
import { test as base, expect, type Page } from "@playwright/test"

export interface ApiCall {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
}

export const test = base.extend<{ api: { calls: ApiCall[] }; consoleErrors: string[] }>({
  // auto: every test gets the mocks, whether it names `api` or not.
  api: [
    async ({ page }, provide) => {
      const calls: ApiCall[] = []
      await page.route("**/api/**", async (route) => {
        const req = route.request()
        const url = new URL(req.url())
        let body: unknown = null
        try {
          body = req.postDataJSON()
        } catch {
          body = req.postData()
        }
        calls.push({
          method: req.method(),
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          body,
        })
        const json = (data: unknown, status = 200) => route.fulfill({ status, json: data })
        switch (url.pathname) {
          case "/api/status":
            return json({ built: "2026-11-09T08:00:00+00:00", articles: 7, semantic: true })
          case "/api/search":
            return json({ query: url.searchParams.get("q") ?? "", mode: "hybrid", hits: [] })
          case "/api/read":
            return json({ ref: url.searchParams.get("ref") ?? "", text: "A passage (mocked)." })
          case "/api/inbox/decide": {
            const ids = (body as { ids?: string[] } | null)?.ids ?? []
            const decision =
              (body as { decision?: string } | null)?.decision === "accept"
                ? "accepted"
                : "rejected"
            return json({ done: ids.map((id) => `${id}: ${decision}`) })
          }
          default:
            return json({ error: "no such API" }, 404)
        }
      })
      await provide({ calls })
    },
    { auto: true },
  ],
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text())
    })
    page.on("pageerror", (err) => errors.push(err.message))
    await provide(errors)
  },
})

export { expect }

/**
 * Send the decisions waiting for their Undo delay now, the way leaving the page does (pagehide):
 * a test need not wait the delay out.
 */
export async function sendDecisionsNow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")))
}

/** The bodies of the decisions the app sent, once `count` of them were. */
export async function sentDecisions(api: { calls: ApiCall[] }, count: number) {
  const decided = () => api.calls.filter((c) => c.path === "/api/inbox/decide")
  await expect.poll(() => decided().length).toBe(count)
  return decided().map((c) => c.body)
}

/** WCAG 2.2 AA checks of what the page shows now. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
  ).toEqual([])
}
