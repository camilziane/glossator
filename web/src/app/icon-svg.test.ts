import { describe, expect, it } from "vitest"

import { APP_NAME } from "@/lib/site"

import { GLYPHS } from "./icon-glyphs"
import { ICON_COLORS, iconLetter, iconSvg } from "./icon-svg"

describe("the app's mark", () => {
  it("is APP_NAME's first letter, as a capital", () => {
    expect(iconLetter()).toBe(APP_NAME.trim()[0]?.toUpperCase())
    expect(iconLetter("glossator")).toBe("G")
    expect(iconLetter("  émile")).toBe("É")
  })

  it("draws the letter's outline in rubric on paper, framed in ink, with a dark scheme inside", () => {
    const svg = iconSvg({ size: 32 })
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toContain(`fill="${ICON_COLORS.light.paper}"`)
    expect(svg).toContain(`stroke="${ICON_COLORS.light.ink}"`)
    expect(svg).toContain(`fill="${ICON_COLORS.light.rubric}"`)
    expect(svg).toContain(GLYPHS[iconLetter()]?.d ?? "<text")
    expect(svg).toContain("@media (prefers-color-scheme: dark)")
    expect(svg).toContain(`fill:${ICON_COLORS.dark.paper}`)
  })

  it("has every capital, and the home-screen icon goes unframed and fixed", () => {
    expect(Object.keys(GLYPHS)).toHaveLength(26)
    const apple = iconSvg({ size: 180, frame: false, scheme: "light" })
    expect(apple).not.toContain("stroke=")
    expect(apple).not.toContain("@media")
  })
})
