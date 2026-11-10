import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants"
import { describe, expect, it } from "vitest"

import nextConfig from "../../next.config"

describe("next.config", () => {
  it("builds a static export, with no rewrites", () => {
    const config = nextConfig(PHASE_PRODUCTION_BUILD)
    expect(config.output).toBe("export")
    expect(config.rewrites).toBeUndefined()
  })

  it("proxies the data and the API in development only for this machine's names", async () => {
    const config = nextConfig(PHASE_DEVELOPMENT_SERVER)
    const rewrites = await config.rewrites!()
    expect(Array.isArray(rewrites)).toBe(true)
    const list = rewrites as { source: string; has?: { type: string; value?: string }[] }[]
    expect(list.map((r) => r.source)).toEqual(["/data/:path*", "/library/:path*", "/api/:path*"])
    for (const rule of list) {
      expect(rule.has).toEqual([{ type: "host", value: "(?:127\\.0\\.0\\.1|localhost)" }])
      // Next anchors the pattern: it must match the loopback names and nothing longer.
      const host = new RegExp(`^${rule.has![0]!.value}$`)
      expect(["127.0.0.1", "localhost"].every((h) => host.test(h))).toBe(true)
      expect(
        ["evil.example", "localhost.evil.example", "127.0.0.1.nip.io"].some((h) => host.test(h))
      ).toBe(false)
    }
  })
})
