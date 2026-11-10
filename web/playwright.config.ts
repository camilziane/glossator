import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests of the built app (npm run build first), served by the real `glossator serve` with the
 * synthetic library (scripts/serve-fixture.mjs). The API is mocked in every test (tests/e2e/test.ts):
 * no test ever reaches a real index or decides on a real inbox.
 *
 * @playwright/test is pinned: `npx playwright install chromium` fetches the Chromium it expects,
 * once per computer. PLAYWRIGHT_CHROMIUM_PATH picks another binary.
 */
const port = Number(process.env.E2E_PORT || 8790)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  // glossator serve is a small stdlib server (one thread per request, a listen queue of 64).
  workers: Number(process.env.E2E_WORKERS || 4),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/serve-fixture.mjs",
    url: `${baseURL}/data/library.json`,
    env: { E2E_PORT: String(port) },
    // Never reuse a server already on the port: it could be one serving the real library.
    reuseExistingServer: false,
    // SIGTERM lets the script stop glossator serve and remove its temporary library.
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
