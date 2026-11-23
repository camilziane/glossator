import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { APP_NAME } from "@/lib/site"

import { GLYPHS } from "./icon-glyphs"
import { ICON_COLORS, iconLetter, iconSvg } from "./icon-svg"

const GLOBALS = readFileSync(resolve(__dirname, "globals.css"), "utf8")

/** A token's oklch in a top-level block of globals.css (`:root` or `.dark`), as [l, c, h]. */
function token(block: ":root" | ".dark", name: string): [number, number, number] {
  const blockRule = new RegExp(`^${block.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m")
  const body = blockRule.exec(GLOBALS)?.[1] ?? ""
  const value = new RegExp(`--${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`).exec(body)
  if (!value) throw new Error(`no oklch --${name} in ${block}`)
  return [Number(value[1]), Number(value[2]), Number(value[3])]
}

/** oklch to #rrggbb (OKLab, linear sRGB clipped, the sRGB curve). */
function hex([l, c, h]: [number, number, number]): string {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const [lc, mc, sc] = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ]
  const linear = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
  return `#${linear
    .map((x) => {
      const v = Math.min(1, Math.max(0, x))
      const g = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
      return Math.round(g * 255)
        .toString(16)
        .padStart(2, "0")
    })
    .join("")}`
}

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

  it("keeps the colours of the tokens (a token retuned in globals.css retunes the mark)", () => {
    for (const [scheme, block] of [
      ["light", ":root"],
      ["dark", ".dark"],
    ] as const) {
      expect(ICON_COLORS[scheme]).toEqual({
        paper: hex(token(block, "background")),
        ink: hex(token(block, "foreground")),
        rubric: hex(token(block, "rubric")),
      })
    }
  })

  it("has every capital, and the home-screen icon goes unframed and fixed", () => {
    expect(Object.keys(GLYPHS)).toHaveLength(26)
    const apple = iconSvg({ size: 180, frame: false, scheme: "light" })
    expect(apple).not.toContain("stroke=")
    expect(apple).not.toContain("@media")
  })
})
